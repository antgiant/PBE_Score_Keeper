// Yjs CRDT Implementation for PBE Score Keeper
// Multi-doc architecture: Global doc for metadata + Per-session Y.Docs

// DocManager - Central manager for all Y.Doc instances
// Global doc stores: dataVersion, currentSession (UUID), sessionOrder (UUID array), globalHistory
// Session docs store: name, config, teams, blocks, questions, historyLog
var DocManager = {
  globalDoc: null,
  globalProvider: null,
  globalUndoManager: null,
  sessionDocs: new Map(),        // Map<sessionId, Y.Doc>
  sessionProviders: new Map(),   // Map<sessionId, IndexeddbPersistence>
  sessionUndoManagers: new Map(), // Map<sessionId, Y.UndoManager>
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
   * Get undo manager for current session
   * @returns {Y.UndoManager} Current session undo manager or null
   */
  getActiveSessionUndoManager: function() {
    if (!this.activeSessionId) return null;
    return this.sessionUndoManagers.get(this.activeSessionId) || null;
  },

  /**
   * Get global undo manager
   * @returns {Y.UndoManager} Global undo manager
   */
  getGlobalUndoManager: function() {
    return this.globalUndoManager;
  },

  /**
   * Set the active session by ID
   * @param {string} sessionId - UUID of session to activate
   */
  setActiveSession: function(sessionId) {
    this.activeSessionId = sessionId;
  }
};

// Legacy global variables - kept for compatibility during transition
var ydoc;
var yProvider;
var yUndoManager;
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

function setYUndoManager(manager) {
  yUndoManager = manager;
  DocManager.globalUndoManager = manager;
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
 * Get the global undo manager
 * @returns {Y.UndoManager} Global undo manager
 */
function getGlobalUndoManager() {
  return DocManager.getGlobalUndoManager();
}

/**
 * Get undo manager for the active session
 * @returns {Y.UndoManager} Active session undo manager
 */
function getActiveSessionUndoManager() {
  return DocManager.getActiveSessionUndoManager();
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
          resolve(sessionDoc);
        });
      } else {
        // No IndexedDB, resolve immediately
        DocManager.pendingSessionLoads.delete(sessionId);
        resolve(sessionDoc);
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
  const undoMgr = DocManager.sessionUndoManagers.get(sessionId);

  if (undoMgr) {
    undoMgr.destroy();
    DocManager.sessionUndoManagers.delete(sessionId);
  }

  if (provider) {
    if (clearStorage) {
      await provider.clearData();
    }
    provider.destroy();
    DocManager.sessionProviders.delete(sessionId);
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
 * Get or create an undo manager for a specific session
 * @param {string} sessionId - UUID of the session
 * @returns {Y.UndoManager} UndoManager for the session
 */
function getOrCreateSessionUndoManager(sessionId) {
  if (!sessionId) return null;

  if (DocManager.sessionUndoManagers.has(sessionId)) {
    return DocManager.sessionUndoManagers.get(sessionId);
  }

  const sessionDoc = getSessionDoc(sessionId);
  if (!sessionDoc) return null;

  // Track session data changes
  const undoMgr = new Y.UndoManager([
    sessionDoc.getMap('session')
  ], {
    trackedOrigins: new Set(['local']),
    captureTimeout: 500
  });

  // Update buttons when stack changes
  undoMgr.on('stack-item-added', update_undo_redo_buttons);
  undoMgr.on('stack-item-popped', update_undo_redo_buttons);
  undoMgr.on('stack-cleared', update_undo_redo_buttons);

  DocManager.sessionUndoManagers.set(sessionId, undoMgr);
  return undoMgr;
}

/**
 * Destroy an undo manager for a session
 * @param {string} sessionId - UUID of the session
 */
function destroySessionUndoManager(sessionId) {
  if (!sessionId) return;
  const undoMgr = DocManager.sessionUndoManagers.get(sessionId);
  if (undoMgr) {
    undoMgr.destroy();
    DocManager.sessionUndoManagers.delete(sessionId);
  }
}

/**
 * Initialize Yjs with multi-doc architecture
 * Sets up global doc for metadata and prepares for per-session docs
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
      setYProvider(new IndexeddbPersistence('pbe-score-keeper-global', getGlobalDoc()));

      yProvider.on('synced', function() {
        console.log('Global Yjs doc synced with IndexedDB');
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
      });
    } else {
      // No IndexedDB persistence
      setYjsReady(true);
    }

    // Setup global undo manager - only tracks global metadata changes
    setYUndoManager(new Y.UndoManager([
      getGlobalDoc().getMap('meta')
    ], {
      trackedOrigins: new Set(['local']),
      captureTimeout: 500
    }));

    // Listen for undo/redo stack changes
    yUndoManager.on('stack-item-added', update_undo_redo_buttons);
    yUndoManager.on('stack-item-popped', update_undo_redo_buttons);
    yUndoManager.on('stack-cleared', update_undo_redo_buttons);

    // Listen for remote changes on global doc
    getGlobalDoc().on('update', function(updateData, origin) {
      if (origin !== 'local' && origin !== 'migration' && origin !== 'import' && origin !== 'history') {
        console.log('Remote update on global doc, refreshing');
        sync_data_to_display();
      }
    });

    return true;
  } catch (error) {
    console.error('Failed to initialize Yjs:', error);
    return false;
  }
}

/**
 * Check if Yjs has data (v2.0 single-doc or v3.0 multi-doc)
 * @returns {boolean} True if Yjs data exists
 */
function has_yjs_data() {
  if (!yjsReady || !getGlobalDoc()) return false;
  const meta = getGlobalDoc().getMap('meta');
  const version = meta.get('dataVersion');
  return meta.size > 0 && (version === 2.0 || version === 3.0);
}

/**
 * Check if using multi-doc architecture (v3.0)
 * @returns {boolean} True if multi-doc mode
 */
function is_multi_doc() {
  if (!getGlobalDoc()) return false;
  const meta = getGlobalDoc().getMap('meta');
  return meta.get('dataVersion') === 3.0;
}

/**
 * Initialize new Yjs state for first-time users (v3.0 multi-doc)
 * Creates global doc structure and first session doc
 */
async function initialize_new_yjs_state() {
  if (!getGlobalDoc()) {
    console.error('Yjs not initialized');
    return;
  }

  const sessionId = generateSessionId();
  var d = new Date();
  var date = d.toLocaleString();

  // Initialize global doc structure
  getGlobalDoc().transact(function() {
    const meta = getGlobalDoc().getMap('meta');
    meta.set('dataVersion', 3.0);
    meta.set('currentSession', sessionId);
    meta.set('sessionOrder', [sessionId]);

    // Global history for session-level events
    const globalHistory = getGlobalDoc().getArray('globalHistory');
    // Will be populated by add_global_history_entry
  }, 'init');

  // Create first session doc
  const sessionDoc = await initSessionDoc(sessionId);
  
  sessionDoc.transact(function() {
    const session = sessionDoc.getMap('session');
    session.set('id', sessionId);
    session.set('name', 'Session ' + date);
    session.set('createdAt', Date.now());
    session.set('lastModified', Date.now());

    // Config
    const config = new Y.Map();
    config.set('maxPointsPerQuestion', 12);
    config.set('rounding', false);
    session.set('config', config);

    // Teams
    const teams = new Y.Array();
    teams.push([null]); // Placeholder at index 0
    const team1 = new Y.Map();
    team1.set('name', 'Team 1');
    teams.push([team1]);
    session.set('teams', teams);

    // Blocks
    const blocks = new Y.Array();
    const block0 = new Y.Map();
    block0.set('name', 'No Block/Group');
    blocks.push([block0]);
    const block1 = new Y.Map();
    block1.set('name', 'Block/Group 1');
    blocks.push([block1]);
    session.set('blocks', blocks);

    // Questions
    const questions = new Y.Array();
    questions.push([null]); // Placeholder at index 0

    const question1 = new Y.Map();
    question1.set('name', 'Question 1');
    question1.set('score', 0);
    question1.set('block', 0);
    question1.set('ignore', false);

    const questionTeams = new Y.Array();
    questionTeams.push([null]); // Placeholder at index 0
    const team1Score = new Y.Map();
    team1Score.set('score', 0);
    team1Score.set('extraCredit', 0);
    questionTeams.push([team1Score]);
    question1.set('teams', questionTeams);

    questions.push([question1]);
    session.set('questions', questions);
    session.set('currentQuestion', 1);

    // Session-specific history log
    const historyLog = new Y.Array();
    session.set('historyLog', historyLog);
  }, 'init');

  // Set active session
  DocManager.setActiveSession(sessionId);

  // Create undo manager for this session
  getOrCreateSessionUndoManager(sessionId);

  // Log creation in global history
  add_global_history_entry('Create Session', 'Created "Session ' + date + '"');

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
      currentQuestion: oldSession.get('currentQuestion'),
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
      session.set('currentQuestion', sessionData.currentQuestion);

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
  getOrCreateSessionUndoManager(newCurrentSession);

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
 * Load state from Yjs - handles both v2.0 and v3.0 formats
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
  }

  // Load v3.0 format
  const currentSessionId = meta.get('currentSession');
  
  // Ensure session doc is loaded
  await initSessionDoc(currentSessionId);
  DocManager.setActiveSession(currentSessionId);
  
  // Create undo manager for session
  getOrCreateSessionUndoManager(currentSessionId);

  // Set legacy current_session variable (for compatibility)
  // In v3.0, we use UUID, but some code still expects index
  // We'll use the position in sessionOrder as the "index"
  const sessionOrder = meta.get('sessionOrder') || [];
  const sessionIndex = sessionOrder.indexOf(currentSessionId) + 1;
  
  if (typeof current_session !== 'undefined') {
    current_session = sessionIndex;
  } else {
    window.current_session = sessionIndex;
  }

  console.log('Loaded from Yjs v3.0, current session:', currentSessionId);
}

/**
 * Perform undo operation - uses session or global undo manager as appropriate
 */
function perform_undo() {
  // Try session undo manager first
  const sessionUndoMgr = getActiveSessionUndoManager();
  if (sessionUndoMgr && sessionUndoMgr.canUndo()) {
    const actionDescription = get_last_action_description();
    sessionUndoMgr.undo();
    
    // Log to session history
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        add_history_entry('Undo', 'Undid: ' + actionDescription);
      }, 'history');
    }
    
    sync_data_to_display();
    refresh_history_display();
    return;
  }

  // Fall back to global undo manager
  if (yUndoManager && yUndoManager.canUndo()) {
    yUndoManager.undo();
    
    getGlobalDoc().transact(() => {
      add_global_history_entry('Undo', 'Undid global action');
    }, 'history');
    
    sync_data_to_display();
    refresh_history_display();
  }
}

/**
 * Perform redo operation
 */
function perform_redo() {
  // Try session redo first
  const sessionUndoMgr = getActiveSessionUndoManager();
  if (sessionUndoMgr && sessionUndoMgr.canRedo()) {
    sessionUndoMgr.redo();
    
    const sessionDoc = getActiveSessionDoc();
    if (sessionDoc) {
      sessionDoc.transact(() => {
        add_history_entry('Redo', 'Redid the previously undone action');
      }, 'history');
    }
    
    sync_data_to_display();
    refresh_history_display();
    return;
  }

  // Fall back to global redo
  if (yUndoManager && yUndoManager.canRedo()) {
    yUndoManager.redo();
    
    getGlobalDoc().transact(() => {
      add_global_history_entry('Redo', 'Redid global action');
    }, 'history');
    
    sync_data_to_display();
    refresh_history_display();
  }
}

/**
 * Update undo/redo button states
 */
function update_undo_redo_buttons() {
  const undoButton = document.getElementById('undo_button');
  const redoButton = document.getElementById('redo_button');

  const sessionUndoMgr = getActiveSessionUndoManager();
  const canUndo = (sessionUndoMgr && sessionUndoMgr.canUndo()) || (yUndoManager && yUndoManager.canUndo());
  const canRedo = (sessionUndoMgr && sessionUndoMgr.canRedo()) || (yUndoManager && yUndoManager.canRedo());

  if (undoButton) {
    undoButton.disabled = !canUndo;
  }
  if (redoButton) {
    redoButton.disabled = !canRedo;
  }
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

  for (const sessionId of sessionOrder) {
    const sessionDoc = getSessionDoc(sessionId);
    if (sessionDoc) {
      const session = sessionDoc.getMap('session');
      names.push(session.get('name') || 'Unnamed Session');
    } else {
      names.push('Loading...');
    }
  }

  return names;
}

/**
 * Get team names for current session
 * @returns {Array<string>} Array of team names (index 0 is empty string)
 */
function get_team_names() {
  const session = get_current_session();
  if (!session) return ['', 'Team 1'];
  
  const teams = session.get('teams');
  if (!teams) return ['', 'Team 1'];
  
  const names = [];
  for (let i = 0; i < teams.length; i++) {
    const team = teams.get(i);
    names.push(team ? team.get('name') : '');
  }
  return names;
}

/**
 * Get block names for current session
 * @returns {Array<string>} Array of block names
 */
function get_block_names() {
  const session = get_current_session();
  if (!session) return ['No Block/Group', 'Block/Group 1'];
  
  const blocks = session.get('blocks');
  if (!blocks) return ['No Block/Group', 'Block/Group 1'];
  
  const names = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks.get(i);
    names.push(block ? block.get('name') : '');
  }
  return names;
}

/**
 * Get question names for current session
 * @returns {Array<string>} Array of question names (index 0 is empty string)
 */
function get_question_names() {
  const session = get_current_session();
  if (!session) return ['', 'Question 1'];
  
  const questions = session.get('questions');
  if (!questions) return ['', 'Question 1'];
  
  const names = [];
  for (let i = 0; i < questions.length; i++) {
    const question = questions.get(i);
    names.push(question ? question.get('name') : '');
  }
  return names;
}

/**
 * Add entry to global history (for session-level events)
 * @param {string} action - Action name
 * @param {string} details - Action details
 */
function add_global_history_entry(action, details) {
  if (!getGlobalDoc()) return;

  const globalHistory = getGlobalDoc().getArray('globalHistory');
  const entry = new Y.Map();
  entry.set('timestamp', Date.now());
  entry.set('action', action);
  entry.set('details', details);
  globalHistory.push([entry]);
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
