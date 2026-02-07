// Yjs CRDT Implementation for PBE Score Keeper
// Multi-doc architecture: Global doc for metadata + Per-session Y.Docs

// DocManager - Central manager for all Y.Doc instances
// Global doc stores: dataVersion, currentSession (UUID), sessionOrder (UUID array), globalHistory
// Session docs store: name, config, teams, blocks, questions, historyLog
var DocManager = {
  globalDoc: null,
  globalProvider: null,
  globalBroadcast: null,          // BroadcastChannel for global doc
  sessionDocs: new Map(),        // Map<sessionId, Y.Doc>
  sessionProviders: new Map(),   // Map<sessionId, IndexeddbPersistence>
  sessionBroadcasts: new Map(),  // Map<sessionId, BroadcastChannel>
  activeSessionId: null,
  yjsReady: false,
  pendingSessionLoads: new Map(), // Map<sessionId, Promise> for deduplication

  /**
   * Get the currently active session doc
   * @returns {Y.Doc} Current session doc or null
   */
  getActiveSessionDoc: function() {
    if (!this.activeSessionId) return null;
    return this.sessionDocs.get(this.activeSessionId) || null;
  },

  /**
   * Get the global metadata doc
   * @returns {Y.Doc} Global doc or null
   */
  getGlobalDoc: function() {
    return this.globalDoc;
  },



  /**
   * Set the active session by ID
   * @param {string} sessionId - UUID of session to activate
   */
  setActiveSession: function(sessionId) {
    this.activeSessionId = sessionId;
  }
};

// ============================================================================
// DATA VERSION CONSTANTS
// ============================================================================

/**
 * Current data version for sessions.
 * v4.0 = UUID-keyed Y.Maps with order arrays
 * v5.0 = Deterministic question IDs (q-1, q-2, etc.)
 */
var DATA_VERSION_CURRENT = '5.0';
var DATA_VERSION_UUID = '4.0';
var DATA_VERSION_DETERMINISTIC = '5.0';

/**
 * Whether to create new sessions using UUID-based v4.0 format.
 * Set to true to enable v4 sessions for new session creation.
 * Existing v3 sessions continue to work; migration happens separately.
 */
var USE_UUID_FOR_NEW_SESSIONS = true;

/**
 * Minimum sync version - clients must have at least this version to sync.
 * v5-only runtime: prevent legacy clients from syncing.
 */
var MIN_SYNC_VERSION = '5.0';

// ============================================================================
// UUID GENERATION FUNCTIONS
// ============================================================================

/**
 * Generate a UUID for a new team
 * Uses 't-' prefix for easy identification in debugging
 * @returns {string} New team UUID (e.g., "t-abc123...")
 */
function generateTeamId() {
  return 't-' + generateUUID();
}

/**
 * Generate a deterministic ID for a new question
 * Uses 'q-' prefix followed by sequential number (e.g., "q-1", "q-2")
 * If session is provided, uses nextQuestionNumber counter for deterministic IDs.
 * Falls back to UUID for legacy calls without session parameter.
 * @param {Y.Map} [session] - Optional session Y.Map for deterministic ID generation
 * @returns {string} New question ID (e.g., "q-1", "q-2", or "q-uuid..." for legacy)
 */
function generateQuestionId(session) {
  if (session && session.get) {
    const nextNum = session.get('nextQuestionNumber') || 1;
    session.set('nextQuestionNumber', nextNum + 1);
    return 'q-' + nextNum;
  }
  // Legacy fallback for calls without session parameter
  return 'q-' + generateUUID();
}

/**
 * Generate a UUID for a new block
 * Uses 'b-' prefix for easy identification in debugging
 * @returns {string} New block UUID (e.g., "b-abc123...")
 */
function generateBlockId() {
  return 'b-' + generateUUID();
}

/**
 * Generate a raw UUID (no prefix)
 * @returns {string} New UUID
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID generation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ============================================================================
// UUID STRUCTURE HELPERS
// ============================================================================

/**
 * Check if a session uses the new UUID-based structure (v4.0 or v5.0)
 * @param {Y.Map} session - The session Y.Map
 * @returns {boolean} True if session uses UUID structure
 */
function isUUIDSession(session) {
  if (!session) return false;
  const dataVersion = session.get('dataVersion');
  return dataVersion === DATA_VERSION_UUID || dataVersion === DATA_VERSION_DETERMINISTIC || 
         dataVersion === '4.0' || dataVersion === '5.0';
}

/**
 * Check if a session uses deterministic question IDs (v5.0+)
 * @param {Y.Map} session - The session Y.Map
 * @returns {boolean} True if session uses deterministic question IDs
 */
function isDeterministicSession(session) {
  if (!session) return false;
  const dataVersion = session.get('dataVersion');
  return dataVersion === DATA_VERSION_DETERMINISTIC || dataVersion === '5.0';
}

/**
 * Validate and repair the nextQuestionNumber counter.
 * Called on session load to ensure counter is always >= max existing question number + 1.
 * @param {Y.Map} session - The session Y.Map
 */
function validateQuestionCounter(session) {
  if (!session || !isDeterministicSession(session)) return;
  
  const questionsById = session.get('questionsById');
  if (!questionsById) return;
  
  // Find the maximum question number from existing questions
  let maxNum = 0;
  questionsById.forEach((q, id) => {
    // Extract number from q-N format
    const match = id.match(/^q-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  });
  
  // Ensure counter is at least maxNum + 1
  const currentCounter = session.get('nextQuestionNumber') || 1;
  if (currentCounter <= maxNum) {
    console.log(`Repairing question counter: was ${currentCounter}, setting to ${maxNum + 1}`);
    session.set('nextQuestionNumber', maxNum + 1);
  }
}

/**
 * Migrate a v4.0 session to v5.0 format (deterministic question IDs)
 * Called automatically when loading a v4.0 session.
 * 
 * Note: This migration updates the internal 'id' field and cleans up obsolete fields,
 * but preserves the original map keys for CRDT compatibility. The getOrderedQuestions()
 * function handles both v4 (questionOrder-based) and v5 (numeric-sorted) sessions.
 * 
 * @param {Y.Doc} sessionDoc - The session Y.Doc
 * @param {Y.Map} session - The session Y.Map
 * @returns {boolean} True if migration was performed
 */
function migrateV4ToV5(sessionDoc, session) {
  if (!session || !sessionDoc) return false;
  
  const dataVersion = session.get('dataVersion');
  
  // Only migrate v4.0 sessions (not v3 or already v5)
  if (dataVersion !== DATA_VERSION_UUID && dataVersion !== '4.0') {
    return false;
  }
  
  // Already deterministic - no migration needed
  if (isDeterministicSession(session)) {
    return false;
  }
  
  const questionsById = session.get('questionsById');
  const questionOrder = session.get('questionOrder');
  
  if (!questionsById || !questionOrder) {
    return false;
  }
  
  console.log('Migrating v4.0 session to v5.0...');
  
  // Build ordered list of questions from questionOrder array
  const orderedQuestions = [];
  for (let i = 0; i < questionOrder.length; i++) {
    const qId = questionOrder.get(i);
    const question = questionsById.get(qId);
    if (question && !isDeleted(question)) {
      orderedQuestions.push({ oldId: qId, data: question, newId: `q-${orderedQuestions.length + 1}` });
    }
  }
  
  // Build old→new ID mapping for history updates
  const idMapping = new Map();
  orderedQuestions.forEach((q) => {
    idMapping.set(q.oldId, q.newId);
  });
  
  sessionDoc.transact(() => {
    // Process each question: clean up obsolete fields
    // Note: We keep the original map keys for CRDT compatibility
    orderedQuestions.forEach((q) => {
      const questionData = q.data;
      
      // Remove obsolete fields
      if (questionData.has('sortOrder')) questionData.delete('sortOrder');
      if (questionData.has('nameUpdatedAt')) questionData.delete('nameUpdatedAt');
      if (questionData.has('scoreUpdatedAt')) questionData.delete('scoreUpdatedAt');
      if (questionData.has('blockUpdatedAt')) questionData.delete('blockUpdatedAt');
      if (questionData.has('ignoreUpdatedAt')) questionData.delete('ignoreUpdatedAt');
      if (questionData.has('deleted')) questionData.delete('deleted');
      if (questionData.has('deletedAt')) questionData.delete('deletedAt');
      
      // Clean up team scores
      const teamScores = questionData.get('teamScores');
      if (teamScores) {
        teamScores.forEach((ts) => {
          if (ts && ts.has) {
            if (ts.has('scoreUpdatedAt')) ts.delete('scoreUpdatedAt');
            if (ts.has('extraCreditUpdatedAt')) ts.delete('extraCreditUpdatedAt');
          }
        });
      }
    });
    
    // Set nextQuestionNumber counter based on number of questions
    session.set('nextQuestionNumber', orderedQuestions.length + 1);
    
    // Update history entries with new question IDs
    const historyLog = session.get('historyLog');
    if (historyLog) {
      for (let i = 0; i < historyLog.length; i++) {
        const entry = historyLog.get(i);
        if (entry && entry.get) {
          const oldQId = entry.get('questionId');
          if (oldQId && idMapping.has(oldQId)) {
            entry.set('questionId', idMapping.get(oldQId));
          }
        }
      }
    }
    
    // Set data version to v5.0
    // Note: The session will use questionOrder array for ordering (v4 compatibility path)
    // until all questions have deterministic q-N IDs
    session.set('dataVersion', DATA_VERSION_DETERMINISTIC);
  }, 'v5-migration');
  
  console.log(`Migration complete: ${orderedQuestions.length} questions cleaned up`);
  return true;
}

/**
 * Detect session data format for upgrade routing.
 * @param {Y.Map} session - The session Y.Map
 * @returns {string} 'v5', 'v4', 'v3', or 'unknown'
 */
function detectSessionFormat(session) {
  if (!session) return 'unknown';
  if (isDeterministicSession(session)) return 'v5';
  if (session.get('teamsById') || session.get('questionsById') || session.get('blocksById')) {
    return 'v4';
  }
  if (session.get('teams') || session.get('questions') || session.get('blocks')) {
    return 'v3';
  }
  return 'unknown';
}

/**
 * Ensure a session is upgraded to v5 deterministic structure.
 * @param {Y.Doc} sessionDoc - The session Y.Doc
 * @returns {{upgraded: boolean, reason: string}} Upgrade result
 */
function ensureSessionIsV5(sessionDoc) {
  if (!sessionDoc) return { upgraded: false, reason: 'no-doc' };
  const session = sessionDoc.getMap('session');
  if (!session) return { upgraded: false, reason: 'no-session' };

  if (isDeterministicSession(session)) {
    validateQuestionCounter(session);
    return { upgraded: false, reason: 'already-v5' };
  }

  const format = detectSessionFormat(session);
  if (format === 'v3') {
    const result = migrateSessionToUUID(sessionDoc);
    if (result && result.success === false) {
      return { upgraded: false, reason: 'v3-migration-failed' };
    }
  } else if (format === 'v4') {
    const dataVersion = session.get('dataVersion');
    if (dataVersion !== DATA_VERSION_UUID && dataVersion !== '4.0') {
      sessionDoc.transact(() => {
        session.set('dataVersion', DATA_VERSION_UUID);
      }, 'migration');
    }
  } else {
    return { upgraded: false, reason: 'unknown-format' };
  }

  const upgradedSession = sessionDoc.getMap('session');
  const migrated = migrateV4ToV5(sessionDoc, upgradedSession);
  if (migrated && isDeterministicSession(upgradedSession)) {
    validateQuestionCounter(upgradedSession);
  }
  return { upgraded: migrated, reason: migrated ? 'upgraded' : 'no-change' };
}

/**
 * Upgrade all sessions in the global order to v5.
 * @returns {Promise<{upgraded: number, total: number}>}
 */
async function upgradeAllSessionsToV5() {
  if (!getGlobalDoc()) return { upgraded: 0, total: 0 };
  const meta = getGlobalDoc().getMap('meta');
  const sessionOrder = meta.get('sessionOrder') || [];
  let upgraded = 0;

  for (const sessionId of sessionOrder) {
    const sessionDoc = await initSessionDoc(sessionId);
    const result = ensureSessionIsV5(sessionDoc);
    if (result && result.upgraded) {
      upgraded++;
    }
  }

  return { upgraded, total: sessionOrder.length };
}

/**
 * Check if an item is soft-deleted
 * @param {Y.Map} item - Team, question, or block Y.Map
 * @returns {boolean} True if item is deleted
 */
function isDeleted(item) {
  if (!item) return true;
  return item.get('deleted') === true;
}

/**
 * Soft-delete an item (team, question, or block)
 * Sets deleted=true and deletedAt=timestamp. Item remains in structure.
 * @param {Y.Map} item - The item to soft-delete
 */
function softDelete(item) {
  if (!item) return;
  item.set('deleted', true);
  item.set('deletedAt', Date.now());
}

/**
 * Get ordered teams from a UUID-based session, excluding deleted ones
 * @param {Y.Map} session - The session Y.Map
 * @returns {Array<{id: string, data: Y.Map}>} Array of {id, data} objects in display order
 */
function getOrderedTeams(session) {
  if (!session || !isUUIDSession(session)) return [];
  
  const teamsById = session.get('teamsById');
  const teamOrder = session.get('teamOrder');
  if (!teamsById || !teamOrder) return [];
  
  const result = [];
  for (let i = 0; i < teamOrder.length; i++) {
    const teamId = teamOrder.get(i);
    const team = teamsById.get(teamId);
    if (team && !isDeleted(team)) {
      result.push({ id: teamId, data: team });
    }
  }
  return result;
}

/**
 * Get ordered questions from a UUID-based session, excluding deleted ones.
 * For v5.0 (deterministic sessions): sorts by numeric part of ID (q-1, q-2, q-3...)
 * For v4.0: uses questionOrder array
 * @param {Y.Map} session - The session Y.Map
 * @returns {Array<{id: string, data: Y.Map}>} Array of {id, data} objects in display order
 */
function getOrderedQuestions(session) {
  if (!session || !isUUIDSession(session)) return [];
  
  const questionsById = session.get('questionsById');
  if (!questionsById) return [];
  
  // For deterministic sessions (v5.0+), sort by numeric ID
  if (isDeterministicSession(session)) {
    const result = [];
    questionsById.forEach((question, questionId) => {
      if (!isDeleted(question)) {
        result.push({ id: questionId, data: question });
      }
    });
    // Sort by numeric part of ID (q-1, q-2, q-3...)
    result.sort((a, b) => {
      const numA = parseInt(a.id.replace('q-', ''), 10);
      const numB = parseInt(b.id.replace('q-', ''), 10);
      // Handle non-numeric IDs (legacy) by putting them at the end
      if (isNaN(numA)) return 1;
      if (isNaN(numB)) return -1;
      return numA - numB;
    });
    return result;
  }
  
  // For v4.0 sessions, use questionOrder array
  const questionOrder = session.get('questionOrder');
  if (!questionOrder) return [];
  
  const result = [];
  for (let i = 0; i < questionOrder.length; i++) {
    const questionId = questionOrder.get(i);
    const question = questionsById.get(questionId);
    if (question && !isDeleted(question)) {
      result.push({ id: questionId, data: question });
    }
  }
  return result;
}

/**
 * Get ordered blocks from a UUID-based session, excluding deleted ones
 * @param {Y.Map} session - The session Y.Map
 * @returns {Array<{id: string, data: Y.Map}>} Array of {id, data} objects in display order
 */
function getOrderedBlocks(session) {
  if (!session || !isUUIDSession(session)) return [];
  
  const blocksById = session.get('blocksById');
  const blockOrder = session.get('blockOrder');
  if (!blocksById || !blockOrder) return [];
  
  const result = [];
  for (let i = 0; i < blockOrder.length; i++) {
    const blockId = blockOrder.get(i);
    const block = blocksById.get(blockId);
    if (block && !isDeleted(block)) {
      result.push({ id: blockId, data: block });
    }
  }
  return result;
}

/**
 * Get a team by ID from a UUID-based session
 * @param {Y.Map} session - The session Y.Map
 * @param {string} teamId - Team UUID
 * @returns {Y.Map|null} Team Y.Map or null
 */
function getTeamById(session, teamId) {
  if (!session || !teamId) return null;
  const teamsById = session.get('teamsById');
  if (!teamsById) return null;
  return teamsById.get(teamId) || null;
}

/**
 * Get a question by ID from a UUID-based session
 * @param {Y.Map} session - The session Y.Map
 * @param {string} questionId - Question UUID
 * @returns {Y.Map|null} Question Y.Map or null
 */
function getQuestionById(session, questionId) {
  if (!session || !questionId) return null;
  const questionsById = session.get('questionsById');
  if (!questionsById) return null;
  return questionsById.get(questionId) || null;
}

/**
 * Get a block by ID from a UUID-based session
 * @param {Y.Map} session - The session Y.Map
 * @param {string} blockId - Block UUID
 * @returns {Y.Map|null} Block Y.Map or null
 */
function getBlockById(session, blockId) {
  if (!session || !blockId) return null;
  const blocksById = session.get('blocksById');
  if (!blocksById) return null;
  return blocksById.get(blockId) || null;
}

/**
 * Get a team's score for a specific question
 * @param {Y.Map} session - The session Y.Map
 * @param {string} questionId - Question UUID
 * @param {string} teamId - Team UUID
 * @returns {{score: number, extraCredit: number}|null} Score data or null
 */
function getTeamScore(session, questionId, teamId) {
  const question = getQuestionById(session, questionId);
  if (!question) return null;
  
  const teamScores = question.get('teamScores');
  if (!teamScores) return null;
  
  const scoreData = teamScores.get(teamId);
  if (!scoreData) return null;
  
  return {
    score: scoreData.get('score') || 0,
    extraCredit: scoreData.get('extraCredit') || 0
  };
}

/**
 * Get team UUID by display index (1-based)
 * @param {Y.Map} session - The session Y.Map
 * @param {number} displayIndex - 1-based display index
 * @returns {string|null} Team UUID or null
 */
function getTeamIdByDisplayIndex(session, displayIndex) {
  const teams = getOrderedTeams(session);
  if (displayIndex < 1 || displayIndex > teams.length) return null;
  return teams[displayIndex - 1].id;
}

/**
 * Get display index (1-based) for a team UUID
 * @param {Y.Map} session - The session Y.Map
 * @param {string} teamId - Team UUID
 * @returns {number} 1-based display index or 0 if not found
 */
function getDisplayIndexByTeamId(session, teamId) {
  const teams = getOrderedTeams(session);
  for (let i = 0; i < teams.length; i++) {
    if (teams[i].id === teamId) return i + 1;
  }
  return 0;
}

/**
 * Get question UUID by display index (1-based)
 * @param {Y.Map} session - The session Y.Map
 * @param {number} displayIndex - 1-based display index
 * @returns {string|null} Question UUID or null
 */
function getQuestionIdByDisplayIndex(session, displayIndex) {
  const questions = getOrderedQuestions(session);
  if (displayIndex < 1 || displayIndex > questions.length) return null;
  return questions[displayIndex - 1].id;
}

/**
 * Get display index (1-based) for a question UUID
 * @param {Y.Map} session - The session Y.Map
 * @param {string} questionId - Question UUID
 * @returns {number} 1-based display index or 0 if not found
 */
function getDisplayIndexByQuestionId(session, questionId) {
  const questions = getOrderedQuestions(session);
  for (let i = 0; i < questions.length; i++) {
    if (questions[i].id === questionId) return i + 1;
  }
  return 0;
}

/**
 * Get block UUID by display index (0-based, since "No Block" is at index 0)
 * @param {Y.Map} session - The session Y.Map
 * @param {number} displayIndex - 0-based display index
 * @returns {string|null} Block UUID or null
 */
function getBlockIdByDisplayIndex(session, displayIndex) {
  const blocks = getOrderedBlocks(session);
  if (displayIndex < 0 || displayIndex >= blocks.length) return null;
  return blocks[displayIndex].id;
}

/**
 * Get display index (0-based) for a block UUID
 * @param {Y.Map} session - The session Y.Map
 * @param {string} blockId - Block UUID
 * @returns {number} 0-based display index or -1 if not found
 */
function getDisplayIndexByBlockId(session, blockId) {
  const blocks = getOrderedBlocks(session);
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].id === blockId) return i;
  }
  return -1;
}

/**
 * Create a new team in a UUID-based session
 * @param {Y.Doc} sessionDoc - The session Y.Doc
 * @param {Y.Map} session - The session Y.Map
 * @param {string} name - Team name
 * @returns {string} New team UUID
 */
function createTeam(sessionDoc, session, name) {
  const teamId = generateTeamId();
  const now = Date.now();
  
  sessionDoc.transact(() => {
    const teamsById = session.get('teamsById');
    const teamOrder = session.get('teamOrder');
    
    const team = new Y.Map();
    team.set('id', teamId);
    team.set('name', name);
    team.set('createdAt', now);
    team.set('deleted', false);
    team.set('sortOrder', teamOrder.length);
    
    teamsById.set(teamId, team);
    teamOrder.push([teamId]);
    
    // Add empty team scores to all existing questions
    const questionsById = session.get('questionsById');
    const questionOrder = session.get('questionOrder');
    if (questionsById && questionOrder) {
      for (let i = 0; i < questionOrder.length; i++) {
        const qId = questionOrder.get(i);
        const question = questionsById.get(qId);
        if (question && !isDeleted(question)) {
          const teamScores = question.get('teamScores');
          if (teamScores) {
            const scoreData = new Y.Map();
            scoreData.set('score', 0);
            scoreData.set('extraCredit', 0);
            teamScores.set(teamId, scoreData);
          }
        }
      }
    }
  }, 'local');
  
  return teamId;
}

/**
 * Create a new question in a UUID-based session
 * Uses deterministic question IDs (q-1, q-2, etc.) based on nextQuestionNumber counter
 * @param {Y.Doc} sessionDoc - The session Y.Doc
 * @param {Y.Map} session - The session Y.Map
 * @param {Object} options - Question options
 * @param {string} options.name - Question name (optional)
 * @param {number} options.score - Max points (default: 0)
 * @param {string} options.blockId - Block UUID (default: first block)
 * @returns {string} New question ID (e.g., "q-1", "q-2")
 */
function createQuestion(sessionDoc, session, options = {}) {
  // Generate deterministic question ID using session counter
  const questionId = generateQuestionId(session);
  const now = Date.now();
  
  sessionDoc.transact(() => {
    const questionsById = session.get('questionsById');
    const questionOrder = session.get('questionOrder');
    const blocksById = session.get('blocksById');
    const blockOrder = session.get('blockOrder');
    
    // Default to first block if not specified
    let blockId = options.blockId;
    if (!blockId && blockOrder && blockOrder.length > 0) {
      blockId = blockOrder.get(0);
    }
    
    const question = new Y.Map();
    question.set('id', questionId);
    question.set('name', options.name || '');
    question.set('score', options.score || 0);
    question.set('blockId', blockId);
    question.set('ignore', false);
    question.set('createdAt', now);
    // Note: 'deleted' field removed in v5.0 - questions are permanent
    // Use 'ignore' flag for scoring exclusion
    // sortOrder and *UpdatedAt fields also removed in v5.0
    // Order is determined by deterministic ID (q-1, q-2, etc.)
    // Timestamp conflicts are resolved by Yjs CRDT at the property level
    
    // Initialize team scores for all teams
    const teamScores = new Y.Map();
    const teamsById = session.get('teamsById');
    const teamOrder = session.get('teamOrder');
    if (teamsById && teamOrder) {
      for (let i = 0; i < teamOrder.length; i++) {
        const teamId = teamOrder.get(i);
        const team = teamsById.get(teamId);
        if (team && !isDeleted(team)) {
          const scoreData = new Y.Map();
          scoreData.set('score', 0);
          scoreData.set('extraCredit', 0);
          teamScores.set(teamId, scoreData);
        }
      }
    }
    question.set('teamScores', teamScores);
    
    questionsById.set(questionId, question);
    questionOrder.push([questionId]);
  }, 'local');
  
  return questionId;
}

/**
 * Create a new block in a UUID-based session
 * @param {Y.Doc} sessionDoc - The session Y.Doc
 * @param {Y.Map} session - The session Y.Map
 * @param {string} name - Block name
 * @param {boolean} isDefault - Whether this is the default "No Block"
 * @returns {string} New block UUID
 */
function createBlock(sessionDoc, session, name, isDefault = false) {
  const blockId = generateBlockId();
  const now = Date.now();
  
  sessionDoc.transact(() => {
    const blocksById = session.get('blocksById');
    const blockOrder = session.get('blockOrder');
    
    const block = new Y.Map();
    block.set('id', blockId);
    block.set('name', name);
    block.set('isDefault', isDefault);
    block.set('createdAt', now);
    block.set('deleted', false);
    block.set('sortOrder', blockOrder.length);
    
    blocksById.set(blockId, block);
    blockOrder.push([blockId]);
  }, 'local');
  
  return blockId;
}

/**
 * Initialize a new UUID-based session structure
 * Creates teamsById, teamOrder, questionsById, questionOrder, blocksById, blockOrder
 * @param {Y.Doc} sessionDoc - The session Y.Doc
 * @param {Object} options - Initialization options
 * @param {string} options.name - Session name
 * @param {number} options.maxPointsPerQuestion - Max points per question
 * @param {boolean} options.rounding - Enable rounding mode
 * @returns {Y.Map} The session Y.Map
 */
function initializeUUIDSession(sessionDoc, options = {}) {
  const session = sessionDoc.getMap('session');
  const now = Date.now();
  
  sessionDoc.transact(() => {
    // Set metadata
    session.set('name', options.name || t('defaults.session_name'));
    session.set('createdAt', now);
    session.set('dataVersion', DATA_VERSION_DETERMINISTIC);
    
    // Config
    const config = new Y.Map();
    config.set('maxPointsPerQuestion', options.maxPointsPerQuestion || 4);
    config.set('rounding', options.rounding || false);
    session.set('config', config);
    
    // Initialize UUID structures
    session.set('teamsById', new Y.Map());
    session.set('teamOrder', new Y.Array());
    session.set('questionsById', new Y.Map());
    session.set('questionOrder', new Y.Array());
    session.set('blocksById', new Y.Map());
    session.set('blockOrder', new Y.Array());
    
    // Question counter for deterministic IDs (q-1, q-2, etc.)
    session.set('nextQuestionNumber', 1);
    
    // History log
    session.set('historyLog', new Y.Array());
  }, 'init');
  
  // Create default block ("No Block")
  createBlock(sessionDoc, session, t('defaults.no_block'), true);
  
  // Create default team
  createTeam(sessionDoc, session, t('defaults.team_name', { number: 1 }));
  
  // Create initial placeholder question (question 1 with 0 points)
  createQuestion(sessionDoc, session, { score: 0 });
  
  return session;
}

/**
 * Create a new v4 session with copied settings from previous session.
 * This is called from createNewSession when USE_UUID_FOR_NEW_SESSIONS is true.
 * @param {Y.Doc} sessionDoc - The session Y.Doc (already initialized)
 * @param {Object} options - Session options
 * @param {string} options.name - Session name
 * @param {number} options.maxPointsPerQuestion - Max points setting
 * @param {boolean} options.rounding - Rounding mode setting
 * @param {Array<string>} options.teamNames - Team names to copy (without null placeholder)
 * @param {Array<string>} options.blockNames - Block names to copy
 * @returns {Y.Map} The session Y.Map
 */
function createNewSessionV4(sessionDoc, options = {}) {
  const session = sessionDoc.getMap('session');
  const now = Date.now();
  
  sessionDoc.transact(() => {
    // Set metadata
    session.set('id', options.id || generateSessionId());
    session.set('name', options.name || t('defaults.session_name'));
    session.set('createdAt', now);
    session.set('lastModified', now);
    session.set('dataVersion', DATA_VERSION_DETERMINISTIC);
    
    // Config
    const config = new Y.Map();
    config.set('maxPointsPerQuestion', options.maxPointsPerQuestion || 4);
    config.set('rounding', options.rounding || false);
    session.set('config', config);
    
    // Initialize UUID structures
    session.set('teamsById', new Y.Map());
    session.set('teamOrder', new Y.Array());
    session.set('questionsById', new Y.Map());
    session.set('questionOrder', new Y.Array());
    session.set('blocksById', new Y.Map());
    session.set('blockOrder', new Y.Array());
    
    // Question counter for deterministic IDs (q-1, q-2, etc.)
    session.set('nextQuestionNumber', 1);
    
    // History log
    session.set('historyLog', new Y.Array());
  }, 'init');
  
  // Create blocks from provided names
  const blockNames = options.blockNames || [t('defaults.no_block')];
  for (let i = 0; i < blockNames.length; i++) {
    createBlock(sessionDoc, session, blockNames[i], i === 0);
  }
  
  // Create teams from provided names
  const teamNames = options.teamNames || [t('defaults.team_name', { number: 1 })];
  for (let i = 0; i < teamNames.length; i++) {
    createTeam(sessionDoc, session, teamNames[i]);
  }
  
  // Create initial placeholder question (question 1 with 0 points)
  createQuestion(sessionDoc, session, { score: 0 });
  
  return session;
}

// ============================================================================
// UUID WRITE OPERATIONS
// ============================================================================

/**
 * Soft-delete a team by UUID
 * @param {Y.Doc} sessionDoc - The session Y.Doc
 * @param {Y.Map} session - The session Y.Map
 * @param {string} teamId - Team UUID to delete
 * @returns {boolean} True if deleted, false if not found
 */
function softDeleteTeam(sessionDoc, session, teamId) {
  if (!isUUIDSession(session)) return false;
  
  const teamsById = session.get('teamsById');
  const team = teamsById ? teamsById.get(teamId) : null;
  if (!team || isDeleted(team)) return false;
  
  sessionDoc.transact(() => {
    softDelete(team);
  }, 'local');
  
  return true;
}

// Note: softDeleteQuestion() removed in v5.0
// Questions are permanent once created - use 'ignore' flag for scoring exclusion
// This prevents ID gaps in the deterministic q-1, q-2, q-N scheme

/**
 * Soft-delete a block by UUID
 * Moves any questions in this block to the default block
 * @param {Y.Doc} sessionDoc - The session Y.Doc
 * @param {Y.Map} session - The session Y.Map
 * @param {string} blockId - Block UUID to delete
 * @returns {boolean} True if deleted, false if not found or is default block
 */
function softDeleteBlock(sessionDoc, session, blockId) {
  if (!isUUIDSession(session)) return false;
  
  const blocksById = session.get('blocksById');
  const block = blocksById ? blocksById.get(blockId) : null;
  if (!block || isDeleted(block)) return false;
  
  // Can't delete the default block
  if (block.get('isDefault')) return false;
  
  // Find the default block
  const blockOrder = session.get('blockOrder');
  let defaultBlockId = null;
  for (let i = 0; i < blockOrder.length; i++) {
    const bId = blockOrder.get(i);
    const b = blocksById.get(bId);
    if (b && !isDeleted(b) && b.get('isDefault')) {
      defaultBlockId = bId;
      break;
    }
  }
  
  sessionDoc.transact(() => {
    // Move questions from this block to default block
    if (defaultBlockId) {
      const questionsById = session.get('questionsById');
      const questionOrder = session.get('questionOrder');
      for (let i = 0; i < questionOrder.length; i++) {
        const qId = questionOrder.get(i);
        const question = questionsById.get(qId);
        if (question && !isDeleted(question) && question.get('blockId') === blockId) {
          question.set('blockId', defaultBlockId);
        }
      }
    }
    
    softDelete(block);
  }, 'local');
  
  return true;
}

/**
 * Set a team's score for a specific question
 * @param {Y.Doc} sessionDoc - The session Y.Doc
 * @param {Y.Map} session - The session Y.Map
 * @param {string} questionId - Question UUID
 * @param {string} teamId - Team UUID
 * @param {number} score - New score value
 * @returns {boolean} True if updated, false if not found
 */
function setTeamScore(sessionDoc, session, questionId, teamId, score) {
  if (!isUUIDSession(session)) return false;
  
  const question = getQuestionById(session, questionId);
  if (!question || isDeleted(question)) return false;
  
  const teamScores = question.get('teamScores');
  if (!teamScores) return false;
  
  sessionDoc.transact(() => {
    let scoreData = teamScores.get(teamId);
    if (!scoreData) {
      // Create score entry if it doesn't exist
      scoreData = new Y.Map();
      scoreData.set('extraCredit', 0);
      teamScores.set(teamId, scoreData);
    }
    scoreData.set('score', score);
  }, 'local');
  
  return true;
}

/**
 * Set a team's extra credit for a specific question
 * @param {Y.Doc} sessionDoc - The session Y.Doc
 * @param {Y.Map} session - The session Y.Map
 * @param {string} questionId - Question UUID
 * @param {string} teamId - Team UUID
 * @param {number} extraCredit - New extra credit value
 * @returns {boolean} True if updated, false if not found
 */
function setTeamExtraCredit(sessionDoc, session, questionId, teamId, extraCredit) {
  if (!isUUIDSession(session)) return false;
  
  const question = getQuestionById(session, questionId);
  if (!question || isDeleted(question)) return false;
  
  const teamScores = question.get('teamScores');
  if (!teamScores) return false;
  
  sessionDoc.transact(() => {
    let scoreData = teamScores.get(teamId);
    if (!scoreData) {
      // Create score entry if it doesn't exist
      scoreData = new Y.Map();
      scoreData.set('score', 0);
      teamScores.set(teamId, scoreData);
    }
    scoreData.set('extraCredit', extraCredit);
  }, 'local');
  
  return true;
}

/**
 * Update a team's name
 * @param {Y.Doc} sessionDoc - The session Y.Doc
 * @param {Y.Map} session - The session Y.Map
 * @param {string} teamId - Team UUID
 * @param {string} name - New name
 * @returns {boolean} True if updated, false if not found
 */
function updateTeamName(sessionDoc, session, teamId, name) {
  if (!isUUIDSession(session)) return false;
  
  const team = getTeamById(session, teamId);
  if (!team || isDeleted(team)) return false;
  
  sessionDoc.transact(() => {
    team.set('name', name);
  }, 'local');
  
  return true;
}

/**
 * Update a block's name
 * @param {Y.Doc} sessionDoc - The session Y.Doc
 * @param {Y.Map} session - The session Y.Map
 * @param {string} blockId - Block UUID
 * @param {string} name - New name
 * @returns {boolean} True if updated, false if not found
 */
function updateBlockName(sessionDoc, session, blockId, name) {
  if (!isUUIDSession(session)) return false;
  
  const block = getBlockById(session, blockId);
  if (!block || isDeleted(block)) return false;
  
  sessionDoc.transact(() => {
    block.set('name', name);
  }, 'local');
  
  return true;
}

/**
 * Update a question's max points
 * @param {Y.Doc} sessionDoc - The session Y.Doc
 * @param {Y.Map} session - The session Y.Map
 * @param {string} questionId - Question UUID
 * @param {number} score - New max points value
 * @returns {boolean} True if updated, false if not found
 */
function updateQuestionScore(sessionDoc, session, questionId, score) {
  if (!isUUIDSession(session)) return false;
  
  const question = getQuestionById(session, questionId);
  if (!question || isDeleted(question)) return false;
  
  sessionDoc.transact(() => {
    question.set('score', score);
  }, 'local');
  
  return true;
}

/**
 * Update a question's block assignment
 * @param {Y.Doc} sessionDoc - The session Y.Doc
 * @param {Y.Map} session - The session Y.Map
 * @param {string} questionId - Question UUID
 * @param {string} blockId - New block UUID
 * @returns {boolean} True if updated, false if not found
 */
function updateQuestionBlock(sessionDoc, session, questionId, blockId) {
  if (!isUUIDSession(session)) return false;
  
  const question = getQuestionById(session, questionId);
  if (!question || isDeleted(question)) return false;
  
  // Verify block exists
  const block = getBlockById(session, blockId);
  if (!block || isDeleted(block)) return false;
  
  sessionDoc.transact(() => {
    question.set('blockId', blockId);
  }, 'local');
  
  return true;
}

/**
 * Update a question's ignore status
 * @param {Y.Doc} sessionDoc - The session Y.Doc
 * @param {Y.Map} session - The session Y.Map
 * @param {string} questionId - Question UUID
 * @param {boolean} ignore - Ignore status
 * @returns {boolean} True if updated, false if not found
 */
function updateQuestionIgnore(sessionDoc, session, questionId, ignore) {
  if (!isUUIDSession(session)) return false;
  
  const question = getQuestionById(session, questionId);
  if (!question || isDeleted(question)) return false;
  
  sessionDoc.transact(() => {
    question.set('ignore', ignore);
  }, 'local');
  
  return true;
}

// ============================================================================
// MIGRATION FUNCTIONS (v3.0 → v4.0)
// ============================================================================

/**
 * Migrate a session from v3.0 (index-based) to v4.0 (UUID-based) structure
 * This is a one-time migration that converts the data model.
 * 
 * @param {Y.Doc} sessionDoc - The session Y.Doc to migrate
 * @returns {Object} Migration result with stats and any errors
 */
function migrateSessionToUUID(sessionDoc) {
  const session = sessionDoc.getMap('session');
  
  // Skip if already migrated
  if (isUUIDSession(session)) {
    return { 
      skipped: true, 
      reason: 'already-migrated',
      message: 'Session is already v4.0 format'
    };
  }
  
  const sessionName = session.get('name') || 'Unnamed';
  console.log(`Migrating session "${sessionName}" from v3.0 to v4.0...`);
  
  // Build index→UUID mappings
  const teamIndexToUUID = new Map();  // 1-based index → UUID
  const blockIndexToUUID = new Map(); // 0-based index → UUID
  const questionIndexToUUID = new Map(); // 1-based index → UUID
  
  const stats = {
    teams: 0,
    blocks: 0,
    questions: 0,
    teamScores: 0
  };
  
  try {
    sessionDoc.transact(() => {
      const now = Date.now();
      
      // 1. Create new UUID structures
      const teamsById = new Y.Map();
      const teamOrder = new Y.Array();
      const blocksById = new Y.Map();
      const blockOrder = new Y.Array();
      const questionsById = new Y.Map();
      const questionOrder = new Y.Array();
      
      // 2. Migrate teams (1-indexed with null at 0)
      const oldTeams = session.get('teams');
      if (oldTeams) {
        for (let i = 1; i < oldTeams.length; i++) {
          const oldTeam = oldTeams.get(i);
          if (!oldTeam) continue;
          
          const teamId = generateTeamId();
          teamIndexToUUID.set(i, teamId);
          
          const newTeam = new Y.Map();
          newTeam.set('id', teamId);
          newTeam.set('name', oldTeam.get('name') || `Team ${i}`);
          newTeam.set('createdAt', now);
          newTeam.set('deleted', false);
          newTeam.set('sortOrder', i - 1);
          
          teamsById.set(teamId, newTeam);
          teamOrder.push([teamId]);
          stats.teams++;
        }
      }
      
      // 3. Migrate blocks (0-indexed)
      const oldBlocks = session.get('blocks');
      if (oldBlocks) {
        for (let i = 0; i < oldBlocks.length; i++) {
          const oldBlock = oldBlocks.get(i);
          if (!oldBlock) continue;
          
          const blockId = generateBlockId();
          blockIndexToUUID.set(i, blockId);
          
          const newBlock = new Y.Map();
          newBlock.set('id', blockId);
          newBlock.set('name', oldBlock.get('name') || `Block ${i}`);
          newBlock.set('isDefault', i === 0);
          newBlock.set('createdAt', now);
          newBlock.set('deleted', false);
          newBlock.set('sortOrder', i);
          
          blocksById.set(blockId, newBlock);
          blockOrder.push([blockId]);
          stats.blocks++;
        }
      }
      
      // 4. Migrate questions (1-indexed with null at 0)
      const oldQuestions = session.get('questions');
      if (oldQuestions) {
        for (let i = 1; i < oldQuestions.length; i++) {
          const oldQuestion = oldQuestions.get(i);
          if (!oldQuestion) continue;
          
          const questionId = generateQuestionId();
          questionIndexToUUID.set(i, questionId);
          
          const newQuestion = new Y.Map();
          newQuestion.set('id', questionId);
          newQuestion.set('name', oldQuestion.get('name') || '');
          newQuestion.set('nameUpdatedAt', oldQuestion.get('nameUpdatedAt') || now);
          newQuestion.set('score', oldQuestion.get('score') || 0);
          newQuestion.set('scoreUpdatedAt', oldQuestion.get('scoreUpdatedAt') || now);
          
          // Convert block index to UUID
          const oldBlockIndex = oldQuestion.get('block') || 0;
          const blockId = blockIndexToUUID.get(oldBlockIndex) || blockOrder.get(0);
          newQuestion.set('blockId', blockId);
          newQuestion.set('blockUpdatedAt', oldQuestion.get('blockUpdatedAt') || now);
          
          newQuestion.set('ignore', oldQuestion.get('ignore') || false);
          newQuestion.set('ignoreUpdatedAt', oldQuestion.get('ignoreUpdatedAt') || now);
          newQuestion.set('createdAt', now);
          newQuestion.set('deleted', false);
          newQuestion.set('sortOrder', i - 1);
          
          // 5. Migrate team scores for this question (1-indexed)
          const oldTeamScores = oldQuestion.get('teams');
          const newTeamScores = new Y.Map();
          
          if (oldTeamScores) {
            for (let j = 1; j < oldTeamScores.length; j++) {
              const oldScore = oldTeamScores.get(j);
              if (!oldScore) continue;
              
              const teamId = teamIndexToUUID.get(j);
              if (!teamId) continue;
              
              const newScoreData = new Y.Map();
              newScoreData.set('score', oldScore.get('score') || 0);
              newScoreData.set('scoreUpdatedAt', oldScore.get('scoreUpdatedAt') || now);
              newScoreData.set('extraCredit', oldScore.get('extraCredit') || 0);
              newScoreData.set('extraCreditUpdatedAt', oldScore.get('extraCreditUpdatedAt') || now);
              
              newTeamScores.set(teamId, newScoreData);
              stats.teamScores++;
            }
          }
          newQuestion.set('teamScores', newTeamScores);
          
          questionsById.set(questionId, newQuestion);
          questionOrder.push([questionId]);
          stats.questions++;
        }
      }
      
      // 6. Set all new structures on the session
      session.set('teamsById', teamsById);
      session.set('teamOrder', teamOrder);
      session.set('blocksById', blocksById);
      session.set('blockOrder', blockOrder);
      session.set('questionsById', questionsById);
      session.set('questionOrder', questionOrder);
      
      // 7. Remove old arrays
      session.delete('teams');
      session.delete('blocks');
      session.delete('questions');
      
      // 8. Set dataVersion
      session.set('dataVersion', DATA_VERSION_UUID);
      
    }, 'migration');
    
    console.log(`Migration complete: ${stats.teams} teams, ${stats.blocks} blocks, ${stats.questions} questions, ${stats.teamScores} team scores`);
    
    return {
      success: true,
      sessionName,
      stats
    };
    
  } catch (error) {
    console.error(`Migration failed for session "${sessionName}":`, error);
    return {
      success: false,
      sessionName,
      error: error.message,
      stats
    };
  }
}

/**
 * Migrate all sessions from v3.0 to v4.0
 * Should be called once on app startup, after Yjs is ready
 * 
 * @returns {Object} Results of migration for all sessions
 */
async function migrateAllSessions() {
  const globalDoc = getGlobalDoc();
  if (!globalDoc) {
    console.error('Cannot migrate: globalDoc not available');
    return { success: false, error: 'No global doc' };
  }
  
  const meta = globalDoc.getMap('meta');
  const sessionOrder = meta.get('sessionOrder');
  
  if (!sessionOrder || sessionOrder.length === 0) {
    console.log('No sessions to migrate');
    return { success: true, results: [], message: 'No sessions to migrate' };
  }
  
  const results = [];
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  
  for (let i = 0; i < sessionOrder.length; i++) {
    const sessionId = sessionOrder.get(i);
    
    try {
      // Get or load the session doc
      let sessionDoc = DocManager.sessionDocs.get(sessionId);
      
      if (!sessionDoc) {
        // Session doc not loaded yet - create and wait for persistence
        sessionDoc = new Y.Doc();
        DocManager.sessionDocs.set(sessionId, sessionDoc);
        
        // Wait briefly for IndexedDB to sync if available
        // In real app, this would use the IndexedDB provider
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const result = migrateSessionToUUID(sessionDoc);
      results.push({ sessionId, ...result });
      
      if (result.skipped) {
        skipped++;
      } else if (result.success) {
        migrated++;
      } else {
        failed++;
      }
      
    } catch (error) {
      console.error(`Error accessing session ${sessionId}:`, error);
      results.push({ sessionId, success: false, error: error.message });
      failed++;
    }
  }
  
  console.log(`Migration summary: ${migrated} migrated, ${skipped} skipped, ${failed} failed`);
  
  return {
    success: failed === 0,
    results,
    summary: { migrated, skipped, failed }
  };
}

// Legacy global variables - kept for compatibility during transition
var ydoc;
var yProvider;

var yjsReady = false;

// Setter functions to sync legacy variables with DocManager
function setYdoc(doc) {
  ydoc = doc;
  DocManager.globalDoc = doc;
}

function setYProvider(provider) {
  yProvider = provider;
  DocManager.globalProvider = provider;
}


function setYjsReady(ready) {
  yjsReady = ready;
  DocManager.yjsReady = ready;
}

// Getter functions that use DocManager
function getActiveSessionDoc() {
  return DocManager.getActiveSessionDoc();
}

function getGlobalDoc() {
  return DocManager.getGlobalDoc();
}


/**
 * Initialize a session-specific Y.Doc with IndexedDB persistence
 * @param {string} sessionId - UUID of the session
 * @returns {Promise<Y.Doc>} The session Y.Doc
 */
async function initSessionDoc(sessionId) {
  if (!sessionId) {
    console.error('initSessionDoc: sessionId is required');
    return null;
  }

  // Return existing doc if already loaded
  const existing = DocManager.sessionDocs.get(sessionId);
  if (existing) {
    return existing;
  }

  // Check for pending load to deduplicate
  if (DocManager.pendingSessionLoads.has(sessionId)) {
    return DocManager.pendingSessionLoads.get(sessionId);
  }

  // Create load promise
  const loadPromise = new Promise((resolve, reject) => {
    try {
      const sessionDoc = new Y.Doc();
      DocManager.sessionDocs.set(sessionId, sessionDoc);

      // Set up IndexedDB persistence for this session
      if (window.indexedDB && typeof IndexeddbPersistence !== 'undefined') {
        const provider = new IndexeddbPersistence('pbe-score-keeper-session-' + sessionId, sessionDoc);
        DocManager.sessionProviders.set(sessionId, provider);

        provider.on('synced', function() {
          console.log('Session doc synced:', sessionId);
          DocManager.pendingSessionLoads.delete(sessionId);
          
          // Ensure sessions are upgraded to v5 deterministically on load
          const upgradeResult = ensureSessionIsV5(sessionDoc);
          if (upgradeResult.upgraded) {
            console.log('Upgraded session to v5:', sessionId);
          }
          
          // Set up history listener for this session
          if (typeof setupSessionHistoryListener === 'function') {
            setupSessionHistoryListener(sessionId);
          }
          
          // Note: Duplicate question detection removed in v5.0 - deterministic IDs prevent duplicates
          
          resolve(sessionDoc);
        });
      } else {
        // No IndexedDB, resolve immediately
        DocManager.pendingSessionLoads.delete(sessionId);
        
        // Set up history listener for this session
        if (typeof setupSessionHistoryListener === 'function') {
          setupSessionHistoryListener(sessionId);
        }
        
        resolve(sessionDoc);
      }
      
      // Set up BroadcastChannel for cross-tab sync
      if (typeof BroadcastChannel !== 'undefined') {
        setupBroadcastChannelSync(sessionDoc, 'pbe-session-' + sessionId, function(channel) {
          DocManager.sessionBroadcasts.set(sessionId, channel);
        });
      }
    } catch (error) {
      console.error('Failed to init session doc:', sessionId, error);
      DocManager.pendingSessionLoads.delete(sessionId);
      reject(error);
    }
  });

  DocManager.pendingSessionLoads.set(sessionId, loadPromise);
  return loadPromise;
}

// Note: setupDuplicateQuestionObserver removed in v5.0
// With deterministic question IDs (q-1, q-2), duplicate questions cannot occur
// because both peers will create the same ID and Yjs will merge at the CRDT level

/**
 * Get a session doc, loading it if necessary
 * @param {string} sessionId - UUID of the session
 * @returns {Y.Doc} The session Y.Doc or null
 */
function getSessionDoc(sessionId) {
  if (!sessionId) return null;
  return DocManager.sessionDocs.get(sessionId) || null;
}

/**
 * Destroy a session doc and clean up resources
 * @param {string} sessionId - UUID of the session
 * @param {boolean} clearStorage - Whether to clear IndexedDB storage
 * @returns {Promise<void>}
 */
async function destroySessionDoc(sessionId, clearStorage) {
  if (!sessionId) return;

  const doc = DocManager.sessionDocs.get(sessionId);
  const provider = DocManager.sessionProviders.get(sessionId);
  const broadcast = DocManager.sessionBroadcasts.get(sessionId);

  if (provider) {
    if (clearStorage) {
      await provider.clearData();
    }
    provider.destroy();
    DocManager.sessionProviders.delete(sessionId);
  }
  
  if (broadcast) {
    broadcast.close();
    DocManager.sessionBroadcasts.delete(sessionId);
  }

  if (doc) {
    doc.destroy();
    DocManager.sessionDocs.delete(sessionId);
  }

  // Clear from active if this was active
  if (DocManager.activeSessionId === sessionId) {
    DocManager.activeSessionId = null;
  }
}

/**
 * Clean up all session docs
 * Used mainly for testing
 * @returns {Promise<void>}
 */
async function destroyAllDocs() {
  const sessionIds = Array.from(DocManager.sessionDocs.keys());
  for (const sessionId of sessionIds) {
    await destroySessionDoc(sessionId, false);
  }
}



/**
 * Set up BroadcastChannel for cross-tab synchronization
 * @param {Y.Doc} doc - The Y.Doc to sync
 * @param {string} channelName - Name of the BroadcastChannel
 * @param {Function} callback - Called with the channel after setup
 */
function setupBroadcastChannelSync(doc, channelName, callback) {
  if (typeof BroadcastChannel === 'undefined') {
    console.warn('BroadcastChannel not supported');
    return;
  }

  const channel = new BroadcastChannel(channelName);
  
  // Listen for updates from other tabs
  channel.onmessage = function(event) {
    if (event.data && event.data.type === 'yjs-update') {
      const update = new Uint8Array(event.data.update);
      Y.applyUpdate(doc, update, 'broadcast-remote');
    }
  };

  // Broadcast updates to other tabs
  doc.on('update', function(update, origin) {
    // Don't broadcast updates that came from another tab
    if (origin !== 'broadcast-remote') {
      channel.postMessage({
        type: 'yjs-update',
        update: Array.from(update)
      });
    }
  });

  if (callback) {
    callback(channel);
  }

  console.log('BroadcastChannel sync enabled for:', channelName);
}

/**
 * Check if old v2.0 single-doc database exists in IndexedDB
 * @returns {Promise<boolean>} True if old 'pbe-score-keeper' database exists
 */
function check_old_v2_database_exists() {
  return new Promise((resolve) => {
    if (!window.indexedDB) {
      resolve(false);
      return;
    }

    // List all databases (if supported)
    if (window.indexedDB.databases && typeof window.indexedDB.databases === 'function') {
      window.indexedDB.databases().then(dbs => {
        const exists = dbs.some(db => db.name === 'pbe-score-keeper');
        resolve(exists);
      }).catch(() => resolve(false));
    } else {
      // Fallback: try to open the database to see if it exists
      // If it opens successfully, it exists
      const request = window.indexedDB.open('pbe-score-keeper', 1);
      request.onsuccess = function() {
        const db = request.result;
        db.close();
        resolve(true);
      };
      request.onerror = function() {
        resolve(false);
      };
    }
  });
}

/**
 * Initialize Yjs with multi-doc architecture
 * Sets up global doc for metadata and prepares for per-session docs
 * Checks for old v2.0 database and loads from it if available
 */
function initialize_yjs() {
  // Check if IndexedDB is available
  if (!window.indexedDB) {
    console.warn('IndexedDB not available. Falling back to in-memory storage.');
  }

  try {
    // Create global Yjs document for metadata
    setYdoc(new Y.Doc());

    // Setup IndexedDB persistence for global doc
    if (window.indexedDB && typeof IndexeddbPersistence !== 'undefined') {
      // Check if old v2.0 database exists and use it, otherwise use new v3.0 key
      check_old_v2_database_exists().then(oldDbExists => {
        const dbKey = oldDbExists ? 'pbe-score-keeper' : 'pbe-score-keeper-global';
        console.log('Using IndexedDB key:', dbKey);
        
        setYProvider(new IndexeddbPersistence(dbKey, getGlobalDoc()));

        yProvider.on('synced', function() {
          console.log('Global Yjs doc synced with IndexedDB from:', dbKey);
          setYjsReady(true);

          // Check document state
          const meta = getGlobalDoc().getMap('meta');
          if (meta.size === 0) {
            console.log('Empty Yjs document detected - will initialize');
          } else {
            const version = meta.get('dataVersion');
            console.log('Existing Yjs data found, version:', version);
            
            // Handle migration from v2.0 (single-doc) to v3.0 (multi-doc)
            if (version === 2.0) {
              console.log('Migration from v2.0 to v3.0 needed');
            }
          }
          
          // Set up BroadcastChannel for cross-tab sync of global doc
          if (typeof BroadcastChannel !== 'undefined') {
            setupBroadcastChannelSync(getGlobalDoc(), 'pbe-global', function(channel) {
              DocManager.globalBroadcast = channel;
            });
          }
        });
      });
    } else {
      // No IndexedDB persistence
      setYjsReady(true);
    }

    // Track previous session for change detection
    var previousSessionId = null;

    // Listen for changes on global doc
    getGlobalDoc().on('update', function(updateData, origin) {
      const meta = getGlobalDoc().getMap('meta');
      const currentSessionId = meta.get('currentSession');

      // Detect session switch
      if (previousSessionId !== null && currentSessionId !== previousSessionId) {
        console.log('Session changed from', previousSessionId, 'to', currentSessionId);
        handleSessionChangeFromGlobalUpdate(currentSessionId);
      }
      
      previousSessionId = currentSessionId;

      if (origin !== 'local' && origin !== 'migration' && origin !== 'import' && origin !== 'history') {
        console.log('Remote update on global doc, refreshing');
        // Only sync if we have an active session to prevent errors during initialization
        if (DocManager.activeSessionId) {
          sync_data_to_display();
        }
      }
    });

    return true;
  } catch (error) {
    console.error('Failed to initialize Yjs:', error);
    return false;
  }
}

/**
 * Check if Yjs has data (v2.0 single-doc or v3.0+ multi-doc)
 * @returns {boolean} True if Yjs data exists
 */
function has_yjs_data() {
  if (!yjsReady || !getGlobalDoc()) {
    return false;
  }
  const meta = getGlobalDoc().getMap('meta');
  const version = meta.get('dataVersion');
  // Support all known versions: 2.0 (single-doc), 3.0 (multi-doc), 4.0 (UUID), 5.0 (deterministic)
  const validVersions = [2.0, 3.0, '3.0', '4.0', '5.0', DATA_VERSION_UUID, DATA_VERSION_DETERMINISTIC];
  return meta.size > 0 && validVersions.includes(version);
}

/**
 * Check if using multi-doc architecture (v3.0+)
 * @returns {boolean} True if multi-doc mode
 */
function is_multi_doc() {
  if (!getGlobalDoc()) return false;
  const meta = getGlobalDoc().getMap('meta');
  const version = meta.get('dataVersion');
  // v3.0+ are all multi-doc (3.0, 4.0, 5.0)
  return version === 3.0 || version === '3.0' || version === '4.0' || version === '5.0' ||
         version === DATA_VERSION_UUID || version === DATA_VERSION_DETERMINISTIC;
}

/**
 * Initialize new Yjs state for first-time users (v5.0 multi-doc)
 * Creates global doc structure and first session doc
 */
async function initialize_new_yjs_state() {
  if (!getGlobalDoc()) {
    console.error('Yjs not initialized');
    return;
  }

  const sessionId = generateSessionId();
  var d = new Date();
  var formattedDate = (typeof format_date === 'function') ? format_date(d) : d.toLocaleString();
  var sessionName = (typeof t === 'function') ? t('defaults.session_name', { date: formattedDate }) : 'Session ' + formattedDate;

  // Initialize global doc structure
  getGlobalDoc().transact(function() {
    const meta = getGlobalDoc().getMap('meta');
    meta.set('dataVersion', DATA_VERSION_DETERMINISTIC);
    meta.set('currentSession', sessionId);
    meta.set('sessionOrder', [sessionId]);
    
    // Session name cache for instant UI updates
    const sessionNames = new Y.Map();
    sessionNames.set(sessionId, sessionName);
    meta.set('sessionNames', sessionNames);

    // Global history for session-level events
    const globalHistory = getGlobalDoc().getArray('globalHistory');
    // Will be populated by add_global_history_entry
  }, 'init');

  // Create first session doc
  const sessionDoc = await initSessionDoc(sessionId);

  const team1Name = (typeof t === 'function') ? t('defaults.team_name', { number: 1 }) : 'Team 1';
  const block0Name = (typeof t === 'function') ? t('defaults.no_block') : 'No Block/Group';
  const block1Name = (typeof t === 'function') ? t('defaults.block_name', { number: 1 }) : 'Block/Group 1';
  createNewSessionV4(sessionDoc, {
    id: sessionId,
    name: sessionName,
    maxPointsPerQuestion: 12,
    rounding: false,
    teamNames: [team1Name],
    blockNames: [block0Name, block1Name]
  });

  // Set active session
  DocManager.setActiveSession(sessionId);

  // Log creation in global history
  const initSessionName = sessionName;
  add_global_history_entry(
    'history_global.actions.create_session',
    'history_global.details_templates.created_session',
    { name: initSessionName }
  );

  console.log('Initialized new multi-doc Yjs state with session:', sessionId);
}

/**
 * Migrate from v2.0 single-doc to v3.0 multi-doc architecture
 * @returns {Promise<void>}
 */
async function migrate_v2_to_v3() {
  console.log('Starting migration from v2.0 to v3.0 multi-doc');

  const globalDoc = getGlobalDoc();
  const oldMeta = globalDoc.getMap('meta');
  const oldSessions = globalDoc.getArray('sessions');
  const oldCurrentSession = oldMeta.get('currentSession');

  // Collect all session data before modifying
  const sessionsData = [];
  for (let i = 1; i < oldSessions.length; i++) {
    const oldSession = oldSessions.get(i);
    if (!oldSession) continue;

    sessionsData.push({
      index: i,
      name: oldSession.get('name'),
      config: {
        maxPointsPerQuestion: oldSession.get('config').get('maxPointsPerQuestion'),
        rounding: oldSession.get('config').get('rounding')
      },
      teams: extractYArray(oldSession.get('teams')),
      blocks: extractYArray(oldSession.get('blocks')),
      questions: extractYArray(oldSession.get('questions')),
      // Note: currentQuestion is no longer used - it's transient app state
      historyLog: oldSession.get('historyLog') ? extractYArray(oldSession.get('historyLog')) : []
    });
  }

  // Create new session docs and build session order
  const sessionOrder = [];
  const indexToUuid = new Map();

  for (const sessionData of sessionsData) {
    const sessionId = generateSessionId();
    indexToUuid.set(sessionData.index, sessionId);
    sessionOrder.push(sessionId);

    // Create session doc
    const sessionDoc = await initSessionDoc(sessionId);
    
    sessionDoc.transact(function() {
      const session = sessionDoc.getMap('session');
      session.set('id', sessionId);
      session.set('name', sessionData.name);
      session.set('createdAt', Date.now());
      session.set('lastModified', Date.now());

      // Config
      const config = new Y.Map();
      config.set('maxPointsPerQuestion', sessionData.config.maxPointsPerQuestion);
      config.set('rounding', sessionData.config.rounding);
      session.set('config', config);

      // Teams
      const teams = new Y.Array();
      for (const team of sessionData.teams) {
        if (team === null) {
          teams.push([null]);
        } else {
          const teamMap = new Y.Map();
          teamMap.set('name', team.name);
          teams.push([teamMap]);
        }
      }
      session.set('teams', teams);

      // Blocks
      const blocks = new Y.Array();
      for (const block of sessionData.blocks) {
        const blockMap = new Y.Map();
        blockMap.set('name', block.name);
        blocks.push([blockMap]);
      }
      session.set('blocks', blocks);

      // Questions
      const questions = new Y.Array();
      for (const question of sessionData.questions) {
        if (question === null) {
          questions.push([null]);
        } else {
          const questionMap = new Y.Map();
          questionMap.set('name', question.name);
          questionMap.set('score', question.score);
          questionMap.set('block', question.block);
          questionMap.set('ignore', question.ignore);

          const questionTeams = new Y.Array();
          for (const teamScore of question.teams) {
            if (teamScore === null) {
              questionTeams.push([null]);
            } else {
              const teamScoreMap = new Y.Map();
              teamScoreMap.set('score', teamScore.score);
              teamScoreMap.set('extraCredit', teamScore.extraCredit);
              questionTeams.push([teamScoreMap]);
            }
          }
          questionMap.set('teams', questionTeams);
          questions.push([questionMap]);
        }
      }
      session.set('questions', questions);
      // Note: currentQuestion is no longer stored - it's transient app state

      // History log
      const historyLog = new Y.Array();
      for (const entry of sessionData.historyLog) {
        const entryMap = new Y.Map();
        entryMap.set('timestamp', entry.timestamp);
        entryMap.set('session', entry.session);
        entryMap.set('action', entry.action);
        entryMap.set('details', entry.details);
        historyLog.push([entryMap]);
      }
      session.set('historyLog', historyLog);
    }, 'migration');
  }

  // Update global doc
  const newCurrentSession = indexToUuid.get(oldCurrentSession) || sessionOrder[0];

  globalDoc.transact(function() {
    const meta = globalDoc.getMap('meta');
    meta.set('dataVersion', 3.0);
    meta.set('currentSession', newCurrentSession);
    meta.set('sessionOrder', sessionOrder);

    // Clear old sessions array (no longer used in v3.0)
    while (oldSessions.length > 0) {
      oldSessions.delete(0, 1);
    }

    // Initialize global history
    if (!globalDoc.getArray('globalHistory')) {
      // Already exists from getArray call
    }
  }, 'migration');

  // Set active session
  DocManager.setActiveSession(newCurrentSession);

  console.log('Migration to v3.0 complete. Sessions:', sessionOrder.length);
}

/**
 * Helper to extract Y.Array contents to plain JS array
 */
function extractYArray(yArray) {
  if (!yArray) return [];
  const result = [];
  for (let i = 0; i < yArray.length; i++) {
    const item = yArray.get(i);
    if (item === null) {
      result.push(null);
    } else if (item instanceof Y.Map) {
      result.push(extractYMap(item));
    } else if (item instanceof Y.Array) {
      result.push(extractYArray(item));
    } else {
      result.push(item);
    }
  }
  return result;
}

/**
 * Helper to extract Y.Map contents to plain JS object
 */
function extractYMap(yMap) {
  if (!yMap) return null;
  const result = {};
  yMap.forEach((value, key) => {
    if (value instanceof Y.Map) {
      result[key] = extractYMap(value);
    } else if (value instanceof Y.Array) {
      result[key] = extractYArray(value);
    } else {
      result[key] = value;
    }
  });
  return result;
}

/**
 * Load state from Yjs - upgrades legacy formats to v5
 * @returns {Promise<void>}
 */
async function load_from_yjs() {
  if (!has_yjs_data()) {
    console.error('No Yjs data to load');
    return;
  }

  const meta = getGlobalDoc().getMap('meta');
  const version = meta.get('dataVersion');

  if (version === 2.0) {
    // Migrate to v3.0 first
    await migrate_v2_to_v3();
    
    // After migration, switch to new database key and clean up old one
    await switch_to_new_database_key();
  }

  // Load session state and upgrade to v5
  const currentSessionId = meta.get('currentSession');
  
  // Ensure session doc is loaded
  await initSessionDoc(currentSessionId);
  DocManager.setActiveSession(currentSessionId);

  // Upgrade all sessions to v5 immediately
  await upgradeAllSessionsToV5();
  // Stamp global metadata to v5 after upgrade
  getGlobalDoc().transact(function() {
    meta.set('dataVersion', DATA_VERSION_DETERMINISTIC);
  }, 'migration');
  
  // Jump to last question for the current session
  const sessionDoc = DocManager.getActiveSessionDoc();
  const session = sessionDoc ? sessionDoc.getMap('session') : null;
  if (session) {
    const orderedQuestions = getOrderedQuestions(session);
    const questionCount = orderedQuestions.length;
    const lastQuestionIndex = Math.max(1, questionCount - 1);
    current_question_index = lastQuestionIndex;
  }
  
  console.log('Loaded from Yjs, current session:', currentSessionId);
}

/**
 * Switch from old v2.0 'pbe-score-keeper' key to new v3.0 'pbe-score-keeper-global' key
 * Encodes current state to new database and deletes old one
 * @returns {Promise<void>}
 */
async function switch_to_new_database_key() {
  if (!window.indexedDB || typeof IndexeddbPersistence === 'undefined') {
    console.warn('Cannot switch database keys: IndexedDB not available');
    return;
  }

  try {
    console.log('Switching from pbe-score-keeper to pbe-score-keeper-global');
    
    // Encode current state of global doc and all session docs
    const globalState = Y.encodeStateAsUpdate(getGlobalDoc());
    const sessionStates = new Map();
    
    const meta = getGlobalDoc().getMap('meta');
    const sessionOrder = meta.get('sessionOrder') || [];
    
    for (const sessionId of sessionOrder) {
      const sessionDoc = getSessionDoc(sessionId);
      if (sessionDoc) {
        sessionStates.set(sessionId, Y.encodeStateAsUpdate(sessionDoc));
      }
    }

    // Disconnect old provider
    if (yProvider) {
      yProvider.destroy();
    }

    // Delete old database
    await new Promise((resolve, reject) => {
      const deleteRequest = window.indexedDB.deleteDatabase('pbe-score-keeper');
      deleteRequest.onsuccess = () => {
        console.log('Deleted old pbe-score-keeper database');
        resolve();
      };
      deleteRequest.onerror = () => {
        console.warn('Failed to delete old pbe-score-keeper database:', deleteRequest.error);
        resolve(); // Don't reject, continue anyway
      };
    });

    // Create new provider with v3.0 key
    setYProvider(new IndexeddbPersistence('pbe-score-keeper-global', getGlobalDoc()));

    // Wait for sync
    await new Promise((resolve) => {
      if (yProvider.synced) {
        resolve();
      } else {
        yProvider.once('synced', resolve);
      }
    });

    console.log('Successfully switched to pbe-score-keeper-global database');
  } catch (error) {
    console.error('Error switching database keys:', error);
  }
}

/**
 * Handle session change from global doc update
 * @param {string} sessionId - New session UUID
 */
async function handleSessionChangeFromGlobalUpdate(sessionId) {
  if (!sessionId) return;

  // Load session doc if not already loaded
  await initSessionDoc(sessionId);

  // Set active session
  DocManager.setActiveSession(sessionId);

  // Refresh display
  sync_data_to_display();
  refresh_history_display();
}

/**
 * Get current session object from active session doc
 * @returns {Y.Map} Current session map or null
 */
function get_current_session() {
  const sessionDoc = getActiveSessionDoc();
  if (!sessionDoc) return null;
  return sessionDoc.getMap('session');
}

/**
 * Get the current session ID (UUID)
 * @returns {string} Current session UUID or null
 */
function get_current_session_id() {
  return DocManager.activeSessionId;
}

/**
 * Get current session index (1-based) from session order
 * This replaces the legacy current_session global variable
 * @returns {number} 1-based session index, or 0 if no session active
 */
function get_current_session_index() {
  const sessionId = DocManager.activeSessionId;
  if (!sessionId) return 0;
  const sessionOrder = get_session_order();
  const index = sessionOrder.indexOf(sessionId);
  return index >= 0 ? index + 1 : 0;
}

/**
 * Get session order array from global doc
 * @returns {Array<string>} Array of session UUIDs in display order
 */
function get_session_order() {
  if (!getGlobalDoc()) return [];
  const meta = getGlobalDoc().getMap('meta');
  return meta.get('sessionOrder') || [];
}

/**
 * Get session names array (for compatibility with existing code)
 * @returns {Array<string>} Array of session names (index 0 is empty string)
 */
function get_session_names() {
  const sessionOrder = get_session_order();
  const names = [''];  // Index 0 is empty for 1-based indexing

  // Get cached session names from global doc
  const meta = getGlobalDoc().getMap('meta');
  const sessionNames = meta.get('sessionNames');
  const unnamedSessionText = (typeof t === 'function') ? t('defaults.unnamed_session') : 'Unnamed Session';

  for (const sessionId of sessionOrder) {
    // Use cached name if available
    if (sessionNames && sessionNames.has(sessionId)) {
      names.push(sessionNames.get(sessionId));
    } else {
      // Fallback: load from session doc
      let sessionDoc = getSessionDoc(sessionId);
      if (sessionDoc) {
        const session = sessionDoc.getMap('session');
        const name = session.get('name') || unnamedSessionText;
        names.push(name);
        
        // Update cache for next time
        getGlobalDoc().transact(() => {
          let sessionNamesMap = meta.get('sessionNames');
          if (!sessionNamesMap) {
            sessionNamesMap = new Y.Map();
            meta.set('sessionNames', sessionNamesMap);
          }
          sessionNamesMap.set(sessionId, name);
        }, 'local');
      } else {
        names.push(unnamedSessionText);
      }
    }
  }

  return names;
}

/**
 * Repair missing or incomplete sessionNames cache
 * Rebuilds cache from individual session docs
 * @returns {Promise<boolean>} True if repair was performed, false if cache was already complete
 */
async function repairSessionNamesCache() {
  const meta = getGlobalDoc().getMap('meta');
  const sessionOrder = meta.get('sessionOrder');
  
  if (!sessionOrder || sessionOrder.length === 0) {
    return false; // No sessions to repair
  }
  
  // Check if cache exists and is complete
  let sessionNames = meta.get('sessionNames');
  const needsRepair = !sessionNames || sessionNames.size !== sessionOrder.length;
  
  if (!needsRepair) {
    return false; // Cache is complete
  }
  
  console.log('Repairing sessionNames cache...');
  
  // Rebuild cache from session docs
  const repairedNames = new Map();
  const unnamedSessionText = (typeof t === 'function') ? t('defaults.unnamed_session') : 'Unnamed Session';
  
  for (const sessionId of sessionOrder) {
    // Load the session doc from IndexedDB if not already loaded
    const sessionDoc = await initSessionDoc(sessionId);
    if (sessionDoc) {
      const session = sessionDoc.getMap('session');
      const name = session.get('name') || unnamedSessionText;
      repairedNames.set(sessionId, name);
    }
  }
  
  // Update global doc with repaired cache
  getGlobalDoc().transact(() => {
    const newSessionNames = new Y.Map();
    for (const [sessionId, name] of repairedNames) {
      newSessionNames.set(sessionId, name);
    }
    meta.set('sessionNames', newSessionNames);
  }, 'repair');
  
  console.log(`Repaired sessionNames cache with ${repairedNames.size} entries`);
  return true; // Repair was performed
}

/**
 * Prune completely empty sessions (no teams and no blocks)
 * Called during initialization to clean up orphaned/corrupted sessions
 * @returns {Promise<number>} Number of sessions pruned
 */
async function pruneEmptySessions() {
  const globalDoc = getGlobalDoc();
  if (!globalDoc) return 0;
  
  const meta = globalDoc.getMap('meta');
  const sessionOrder = meta.get('sessionOrder');
  
  if (!sessionOrder || sessionOrder.length <= 1) {
    return 0; // No sessions to prune, or only one session (don't delete the last one)
  }
  
  const currentSessionId = meta.get('currentSession');
  const emptySessionIds = [];
  
  for (let i = 0; i < sessionOrder.length; i++) {
    const sessionId = sessionOrder[i];
    
    // Never prune the current session
    if (sessionId === currentSessionId) continue;
    
    // Load the session doc
    const sessionDoc = await initSessionDoc(sessionId);
    if (!sessionDoc) {
      // Can't load session doc - consider it empty/corrupted
      emptySessionIds.push(sessionId);
      continue;
    }
    
    const session = sessionDoc.getMap('session');
    if (!session) {
      emptySessionIds.push(sessionId);
      continue;
    }
    
    // Ensure v5 and check if session is empty (no teams and no blocks)
    ensureSessionIsV5(sessionDoc);
    const upgradedSession = sessionDoc.getMap('session');
    const orderedTeams = getOrderedTeams(upgradedSession);
    const orderedBlocks = getOrderedBlocks(upgradedSession);
    const teamCount = orderedTeams.length;
    const blockCount = orderedBlocks.length;
    
    if (teamCount === 0 && blockCount === 0) {
      emptySessionIds.push(sessionId);
    }
  }
  
  // Don't delete if it would leave us with no sessions
  if (emptySessionIds.length >= sessionOrder.length) {
    console.log('pruneEmptySessions: Would delete all sessions, keeping one');
    emptySessionIds.pop(); // Keep at least one
  }
  
  if (emptySessionIds.length === 0) {
    return 0;
  }
  
  console.log(`Pruning ${emptySessionIds.length} empty session(s):`, emptySessionIds);
  
  // Remove empty sessions from global doc
  globalDoc.transact(function() {
    const newOrder = [];
    for (let i = 0; i < sessionOrder.length; i++) {
      if (!emptySessionIds.includes(sessionOrder[i])) {
        newOrder.push(sessionOrder[i]);
      }
    }
    meta.set('sessionOrder', newOrder);
    
    // Remove from session name cache
    const sessionNames = meta.get('sessionNames');
    if (sessionNames) {
      for (const sessionId of emptySessionIds) {
        sessionNames.delete(sessionId);
      }
    }
    
    // Remove from sync room cache
    const sessionSyncRooms = meta.get('sessionSyncRooms');
    if (sessionSyncRooms) {
      for (const sessionId of emptySessionIds) {
        sessionSyncRooms.delete(sessionId);
      }
    }
  }, 'prune');
  
  // Clean up IndexedDB for deleted sessions
  for (const sessionId of emptySessionIds) {
    // Dispose the provider if it exists
    if (DocManager.sessionProviders && DocManager.sessionProviders.has(sessionId)) {
      const provider = DocManager.sessionProviders.get(sessionId);
      if (provider && typeof provider.destroy === 'function') {
        provider.destroy();
      }
      DocManager.sessionProviders.delete(sessionId);
    }
    
    // Remove from session docs map
    if (DocManager.sessionDocs && DocManager.sessionDocs.has(sessionId)) {
      DocManager.sessionDocs.delete(sessionId);
    }
    
    // Try to delete from IndexedDB (best effort)
    try {
      const dbName = `pbe-score-keeper-session-${sessionId}`;
      if (typeof indexedDB !== 'undefined') {
        indexedDB.deleteDatabase(dbName);
      }
    } catch (e) {
      console.warn('Could not delete IndexedDB for session:', sessionId, e);
    }
  }
  
  console.log(`Pruned ${emptySessionIds.length} empty session(s)`);
  return emptySessionIds.length;
}

/**
 * Get team names for current session
 * Supports both v3.0 (index-based) and v4.0 (UUID-based) structures
 * @returns {Array<string>} Array of team names (index 0 is empty string for v3 compatibility)
 */
function get_team_names() {
  const team1Text = (typeof t === 'function') ? t('defaults.team_name', {number: 1}) : 'Team 1';
  const session = get_current_session();
  if (!session) return ['', team1Text];

  if (!isUUIDSession(session)) return ['', team1Text];

  const orderedTeams = getOrderedTeams(session);
  const names = [''];  // Index 0 placeholder for 1-based UI indexing
  for (let i = 0; i < orderedTeams.length; i++) {
    names.push(orderedTeams[i].data.get('name') || '');
  }
  return names;
}

/**
 * Get block names for current session
 * Supports both v3.0 (index-based) and v4.0 (UUID-based) structures
 * @returns {Array<string>} Array of block names
 */
function get_block_names() {
  const noBlockText = (typeof t === 'function') ? t('defaults.no_block') : 'No Block/Group';
  const block1Text = (typeof t === 'function') ? t('defaults.block_name', {number: 1}) : 'Block/Group 1';
  const session = get_current_session();
  if (!session) return [noBlockText, block1Text];

  if (!isUUIDSession(session)) return [noBlockText, block1Text];

  const orderedBlocks = getOrderedBlocks(session);
  const names = [];
  for (let i = 0; i < orderedBlocks.length; i++) {
    names.push(orderedBlocks[i].data.get('name') || '');
  }
  return names;
}

/**
 * Get question names for current session
 * Supports both v3.0 (index-based) and v4.0 (UUID-based) structures
 * @returns {Array<string>} Array of question names (index 0 is empty string for v3 compatibility)
 */
function get_question_names() {
  const question1Text = (typeof t === 'function') ? t('defaults.question_name', {number: 1}) : 'Question 1';
  const session = get_current_session();
  if (!session) return ['', question1Text];

  if (!isUUIDSession(session)) return ['', question1Text];

  const orderedQuestions = getOrderedQuestions(session);
  const names = [''];  // Index 0 placeholder for 1-based UI indexing
  for (let i = 0; i < orderedQuestions.length; i++) {
    names.push(orderedQuestions[i].data.get('name') || '');
  }
  return names;
}

/**
 * Add entry to global history (for session-level events)
 * Stores translation keys and params for language-independent history
 * @param {string} actionKey - Translation key for the action
 * @param {string} detailsKey - Translation key for details
 * @param {object} detailsParams - Parameters for details interpolation
 */
function add_global_history_entry(actionKey, detailsKey, detailsParams) {
  if (!getGlobalDoc()) return;

  // Get or create the global history array from meta map
  const meta = getGlobalDoc().getMap('meta');
  let globalHistory = meta.get('globalHistory');
  
  getGlobalDoc().transact(() => {
    if (!globalHistory) {
      // Array doesn't exist yet, create it
      globalHistory = new Y.Array();
      meta.set('globalHistory', globalHistory);
    }

    const entry = new Y.Map();
    entry.set('timestamp', Date.now());
    entry.set('actionKey', actionKey);
    entry.set('detailsKey', detailsKey || '');
    entry.set('detailsParams', detailsParams ? JSON.stringify(detailsParams) : '');
    globalHistory.push([entry]);
  }, 'history');
}

/**
 * Get value from current session using dot notation path
 * @param {string} path - Dot notation path
 * @returns {any} The value at the path
 */
function get_yjs_value(path) {
  const session = get_current_session();
  if (!session) return undefined;

  const parts = path.split('.');
  let current = session;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    
    if (!isNaN(part)) {
      current = current.get(Number(part));
    } else {
      current = current.get(part);
    }
  }

  return current;
}

/**
 * Set value in current session using dot notation path
 * @param {string} path - Dot notation path
 * @param {any} value - Value to set
 * @param {string} origin - Transaction origin
 */
function set_yjs_value(path, value, origin) {
  origin = origin || 'local';
  const sessionDoc = getActiveSessionDoc();
  if (!sessionDoc) {
    console.error('No active session doc');
    return;
  }

  const session = sessionDoc.getMap('session');
  const parts = path.split('.');
  const lastPart = parts.pop();

  sessionDoc.transact(function() {
    let current = session;
    for (const part of parts) {
      if (!isNaN(part)) {
        current = current.get(Number(part));
      } else {
        current = current.get(part);
      }
      if (!current) {
        console.error('Path not found:', path);
        return;
      }
    }

    if (!isNaN(lastPart)) {
      console.error('Cannot set array index directly');
      return;
    }
    current.set(lastPart, value);
  }, origin);
}
