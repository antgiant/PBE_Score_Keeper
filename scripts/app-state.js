// State Management for PBE Score Keeper
// Multi-doc architecture: Global doc for metadata + Per-session Y.Docs

// Flag to track if user is returning with existing data (for welcome back dialog)
var hasExistingDataOnLoad = false;

/**
 * Initialize application state
 * Handles first run, legacy migration, and v2→v3 migration
 */
async function initialize_state() {
  // Wait for Yjs to be ready
  if (typeof ydoc === 'undefined' || !yjsReady) {
    setTimeout(initialize_state, 100);
    return;
  }

  try {
    // Check if Yjs has data (v2.0 or v3.0)
    if (has_yjs_data()) {
      // Load from Yjs (will migrate v2.0 to v3.0 if needed)
      await load_from_yjs();
      
      // Set flag to show welcome back dialog after display is initialized
      hasExistingDataOnLoad = true;
      
      // Repair sessionNames cache if needed (for users who migrated before fix)
      if (is_multi_doc()) {
        const wasRepaired = await repairSessionNamesCache();
        
        // If cache was repaired, sync display to show corrected session
        if (wasRepaired && typeof sync_data_to_display === 'function') {
          sync_data_to_display();
        }
      }
      
      // Initialize sync manager for WebRTC sync
      if (typeof initSyncManager === 'function') {
        initSyncManager();
      }
      
      window.stateInitialized = true;
      return;
    }

    // Check localStorage for legacy data (v1.x)
    var data_version = JSON.parse(get_element("data_version"));

    if (data_version === null) {
      // First run - initialize new v3.0 multi-doc state
      await initialize_new_yjs_state();
      await load_from_yjs();
    } else if (data_version < 2.0) {
      // Migration needed from localStorage to v3.0
      // Set flag for welcome back dialog after migration
      hasExistingDataOnLoad = true;
      await migrate_localStorage_to_v3(data_version);
      await load_from_yjs();
    }

    // Initialize sync manager for WebRTC sync
    if (typeof initSyncManager === 'function') {
      initSyncManager();
    }

    // Mark state as initialized
    window.stateInitialized = true;
  } catch (error) {
    console.error('Failed to initialize state:', error);
    window.stateInitialized = true; // Still mark as initialized to prevent infinite loop
  }
}

/**
 * Data structure upgrades for localStorage format
 * @param {number} data_version - Current data version
 * @param {object|string} data - Data source (localStorage or object)
 * @returns {object} Upgraded data
 */
function data_upgrades(data_version, data) {
  data = data || "localStorage";
  
  // Add in rounding option
  if (data_version == 1.0) {
    let session_names = JSON.parse(get_element("session_names", data));
    for (let i = 1; i < session_names.length; i++) {
      set_element("session_"+i+"_rounding", JSON.stringify("false"), data);
    }
    set_element("data_version", 1.01, data);
  }
  
  // Add in ignore question option
  if (data_version == 1.01) {
    let current_session = Number(get_element("current_session", data));
    let session_names = JSON.parse(get_element("session_names", data));
    for (let i = 1; i < session_names.length; i++) {
      var question_names = JSON.parse(get_element("session_"+current_session+"_question_names", data));
      var question_count = question_names.length - 1;
      for (let j = 1; j <= question_count; j++) {
        set_element("session_"+i+"_question_"+j+"_ignore", JSON.stringify("false"), data);
      }
    }
  }
  
  // Remove Rounding option
  if (data_version < 1.3) {
    let session_names = JSON.parse(get_element("session_names", data));
    for (let i = 1; i < session_names.length; i++) {
      remove_element("session_"+i+"_rounding");
    }
    set_element("data_version", 1.3, data);
  }
  
  // Add Back Rounding option for live scoring
  if (data_version < 1.4) {
    let session_names = JSON.parse(get_element("session_names", data));
    for (let i = 1; i < session_names.length; i++) {
      set_element("session_"+i+"_rounding", JSON.stringify("false"), data);
    }
    set_element("data_version", 1.4, data);
  }
  
  // Add Extra Credit option
  if (data_version < 1.5) {
    let current_session = Number(get_element("current_session", data));
    let session_names = JSON.parse(get_element("session_names", data));
    for (let i = 1; i < session_names.length; i++) {
      let question_names = JSON.parse(get_element("session_"+current_session+"_question_names", data));
      let question_count = question_names.length - 1;
      for (let j = 1; j <= question_count; j++) {
        let team_names = JSON.parse(get_element("session_"+current_session+"_team_names", data));
        let team_count = team_names.length - 1;
        for (let k = 1; k <= team_count; k++) {
          set_element("session_"+i+"_question_"+j+"_team_"+k+"_extra_credit", JSON.stringify(0), data);
        }
      }
    }
    set_element("data_version", 1.5, data);
  }
  
  return data;
}

/**
 * Migrate localStorage data directly to v3.0 multi-doc format
 * @param {number} oldVersion - Current localStorage data version
 */
async function migrate_localStorage_to_v3(oldVersion) {
  console.log('Starting migration from localStorage v' + oldVersion + ' to Yjs v3.0');

  try {
    // Create backup of localStorage
    backup_localStorage();

    // Copy all localStorage to temp object and upgrade to v1.5
    const upgradedData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key.startsWith('pbe_legacy_backup_')) {
        upgradedData[key] = localStorage.getItem(key);
      }
    }

    // Run existing migrations to get to v1.5
    data_upgrades(oldVersion, upgradedData);

    // Parse session data
    const sessionNames = JSON.parse(upgradedData['session_names']);
    const oldCurrentSession = Number(JSON.parse(upgradedData['current_session']));
    
    // Build session order and index-to-UUID mapping
    const sessionOrder = [];
    const indexToUuid = new Map();

    // Create session docs for each session
    for (let s = 1; s < sessionNames.length; s++) {
      const sessionId = generateSessionId();
      indexToUuid.set(s, sessionId);
      sessionOrder.push(sessionId);

      // Create session doc
      const sessionDoc = await initSessionDoc(sessionId);
      const teamNames = JSON.parse(upgradedData['session_' + s + '_team_names']);

      sessionDoc.transact(function() {
        const session = sessionDoc.getMap('session');
        session.set('id', sessionId);
        session.set('name', sessionNames[s]);
        session.set('createdAt', Date.now());
        session.set('lastModified', Date.now());

        // Config
        const config = new Y.Map();
        config.set('maxPointsPerQuestion', Number(JSON.parse(upgradedData['session_' + s + '_max_points_per_question'])));
        config.set('rounding', JSON.parse(upgradedData['session_' + s + '_rounding']) === 'true');
        session.set('config', config);

        // Teams
        const teams = new Y.Array();
        teams.push([null]); // Placeholder at index 0
        for (let t = 1; t < teamNames.length; t++) {
          const teamMap = new Y.Map();
          teamMap.set('name', teamNames[t]);
          teams.push([teamMap]);
        }
        session.set('teams', teams);

        // Blocks
        const blocks = new Y.Array();
        const blockNames = JSON.parse(upgradedData['session_' + s + '_block_names']);
        for (let b = 0; b < blockNames.length; b++) {
          const blockMap = new Y.Map();
          blockMap.set('name', blockNames[b]);
          blocks.push([blockMap]);
        }
        session.set('blocks', blocks);

        // Questions
        const questions = new Y.Array();
        const questionNames = JSON.parse(upgradedData['session_' + s + '_question_names']);
        questions.push([null]); // Placeholder at index 0

        for (let q = 1; q < questionNames.length; q++) {
          const questionMap = new Y.Map();
          questionMap.set('name', questionNames[q]);
          questionMap.set('score', Number(JSON.parse(upgradedData['session_' + s + '_question_' + q + '_score'] || '0')));
          questionMap.set('block', Number(JSON.parse(upgradedData['session_' + s + '_question_' + q + '_block'] || '0')));
          questionMap.set('ignore', JSON.parse(upgradedData['session_' + s + '_question_' + q + '_ignore'] || 'false') === 'true');

          // Question teams
          const questionTeams = new Y.Array();
          questionTeams.push([null]); // Placeholder at index 0
          for (let t = 1; t < teamNames.length; t++) {
            const teamScoreMap = new Y.Map();
            teamScoreMap.set('score', Number(JSON.parse(upgradedData['session_' + s + '_question_' + q + '_team_' + t + '_score'] || '0')));
            teamScoreMap.set('extraCredit', Number(JSON.parse(upgradedData['session_' + s + '_question_' + q + '_team_' + t + '_extra_credit'] || '0')));
            questionTeams.push([teamScoreMap]);
          }
          questionMap.set('teams', questionTeams);
          questions.push([questionMap]);
        }

        session.set('questions', questions);
        // Note: currentQuestion is no longer stored in Yjs - it's transient app state

        // Empty history log
        const historyLog = new Y.Array();
        session.set('historyLog', historyLog);
      }, 'migration');
    }

    // Set up global doc with v3.0 structure
    const newCurrentSession = indexToUuid.get(oldCurrentSession) || sessionOrder[0];

    getGlobalDoc().transact(function() {
      const meta = getGlobalDoc().getMap('meta');
      meta.set('dataVersion', 3.0);
      meta.set('currentSession', newCurrentSession);
      meta.set('sessionOrder', sessionOrder);
      
      // Populate session names cache
      const sessionNamesMap = new Y.Map();
      for (let s = 1; s < sessionNames.length; s++) {
        const sessionId = indexToUuid.get(s);
        sessionNamesMap.set(sessionId, sessionNames[s]);
      }
      meta.set('sessionNames', sessionNamesMap);
    }, 'migration');

    // Clear old localStorage (keep backup)
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key.startsWith('pbe_legacy_backup_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(function(key) {
      localStorage.removeItem(key);
    });

    console.log('Migration to v3.0 completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    alert(t('alerts.migration_failed'));
    throw error;
  }
}

/**
 * Create backup of localStorage
 */
function backup_localStorage() {
  const backupKey = 'pbe_legacy_backup_' + new Date().toISOString();
  const allData = {};

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith('pbe_legacy_backup_')) {
      allData[key] = localStorage.getItem(key);
    }
  }

  try {
    localStorage.setItem(backupKey, JSON.stringify(allData));
    console.log('Backup created:', backupKey);
  } catch (e) {
    console.error('Could not create localStorage backup (storage full?):', e);
  }
}

/**
 * Get element from localStorage or data object
 */
function get_element(element_name, data) {
  data = data || "localStorage";
  if (data === "localStorage") {
    return localStorage.getItem(element_name);
  } else {
    return data[element_name];
  }
}

/**
 * Set element in localStorage or data object
 */
function set_element(element_name, element_value, data) {
  data = data || "localStorage";
  if (data === "localStorage") {
    localStorage.setItem(element_name, element_value);
  } else {
    data[element_name] = element_value;
  }
}

/**
 * Remove element from localStorage or data object
 */
function remove_element(element_name, data) {
  data = data || "localStorage";
  if (data === "localStorage") {
    localStorage.removeItem(element_name);
  } else {
    delete data[element_name];
  }
}

/**
 * Get all localStorage data
 */
function get_all_data() {
  return localStorage;
}

/**
 * Generate a UUID for a new session
 * @returns {string} New UUID
 */
function generateSessionId() {
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

/**
 * Create a new session with its own Y.Doc
 * @param {string} name - Optional name for the session
 * @returns {Promise<string>} Session UUID or null if creation failed
 */
async function createNewSession(name) {
  const currentSession = get_current_session();
  if (!currentSession) return null;

  const questions = currentSession.get('questions');
  let question_count = questions.length - 1;
  if (questions.get(question_count).get('score') === 0) {
    question_count--;
  }

  // Only allow new session if current has some data
  if (question_count <= 1) {
    return null;
  }

  // Check if currently synced - creating new session means leaving sync
  if (typeof handleSessionSwitch === 'function') {
    // Use existing handleSessionSwitch which shows confirmation and disconnects
    var shouldProceed = await handleSessionSwitch('new-session-pending');
    if (!shouldProceed) {
      return null; // User cancelled
    }
  }

  // Get current settings to copy forward
  const config = currentSession.get('config');
  const temp_max_points = config.get('maxPointsPerQuestion');
  const temp_rounding = config.get('rounding');
  const temp_block_names = get_block_names();
  const temp_team_names = get_team_names();

  // Generate new session ID
  const sessionId = generateSessionId();
  var d = new Date();
  var formattedDate = (typeof format_date === 'function') ? format_date(d) : d.toLocaleString();
  const sessionName = name || t('defaults.session_name', { date: formattedDate });

  // Create new session doc
  const sessionDoc = await initSessionDoc(sessionId);

  // Check if we should use v4 UUID-based format
  if (typeof USE_UUID_FOR_NEW_SESSIONS !== 'undefined' && USE_UUID_FOR_NEW_SESSIONS) {
    // Create v4 session using UUID helpers
    createNewSessionV4(sessionDoc, {
      name: sessionName,
      maxPointsPerQuestion: temp_max_points,
      rounding: temp_rounding,
      teamNames: temp_team_names.slice(1), // Remove null at index 0
      blockNames: temp_block_names
    });
  } else {
    // Create v3 session (index-based)
    sessionDoc.transact(function() {
      const session = sessionDoc.getMap('session');
      session.set('id', sessionId);
      session.set('name', sessionName);
      session.set('createdAt', Date.now());
      session.set('lastModified', Date.now());

    // Copy config
    const newConfig = new Y.Map();
    newConfig.set('maxPointsPerQuestion', temp_max_points);
    newConfig.set('rounding', temp_rounding);
    session.set('config', newConfig);

    // Copy teams
    const newTeams = new Y.Array();
    newTeams.push([null]); // Placeholder at index 0
    for (let i = 1; i < temp_team_names.length; i++) {
      const teamMap = new Y.Map();
      teamMap.set('name', temp_team_names[i]);
      newTeams.push([teamMap]);
    }
    session.set('teams', newTeams);

    // Copy blocks
    const newBlocks = new Y.Array();
    for (let i = 0; i < temp_block_names.length; i++) {
      const blockMap = new Y.Map();
      blockMap.set('name', temp_block_names[i]);
      newBlocks.push([blockMap]);
    }
    session.set('blocks', newBlocks);

    // Create first question
    const newQuestions = new Y.Array();
    newQuestions.push([null]); // Placeholder at index 0

    const question1 = new Y.Map();
    question1.set('name', t('defaults.question_name', { number: 1 }));
    question1.set('score', 0);
    question1.set('block', 0);
    question1.set('ignore', false);

    const question1Teams = new Y.Array();
    question1Teams.push([null]); // Placeholder
    for (let i = 1; i < temp_team_names.length; i++) {
      const teamScore = new Y.Map();
      teamScore.set('score', 0);
      teamScore.set('extraCredit', 0);
      question1Teams.push([teamScore]);
    }
    question1.set('teams', question1Teams);

    newQuestions.push([question1]);
    session.set('questions', newQuestions);
    // Note: currentQuestion is no longer stored in Yjs - it's transient app state

    // Empty history log
    const historyLog = new Y.Array();
    session.set('historyLog', historyLog);
    }, 'local');
  } // End of else block for v3 session creation

  // Update global doc
  const meta = getGlobalDoc().getMap('meta');
  const sessionOrder = meta.get('sessionOrder') || [];

  getGlobalDoc().transact(function() {
    const newOrder = sessionOrder.slice();
    newOrder.push(sessionId);
    meta.set('sessionOrder', newOrder);
    meta.set('currentSession', sessionId);
    
    // Update session name cache
    let sessionNames = meta.get('sessionNames');
    if (!sessionNames) {
      sessionNames = new Y.Map();
      meta.set('sessionNames', sessionNames);
    }
    sessionNames.set(sessionId, sessionName);
  }, 'local');

  // Switch to new session
  DocManager.setActiveSession(sessionId);
  
  // Reset to first question for the new session
  current_question_index = 1;

  // Log in global history
  add_global_history_entry('history_global.actions.create_session', 'history_global.details_templates.created_session', { name: sessionName });

  return sessionId;
}

/**
 * Create an empty session for sync joining
 * Unlike createNewSession, this does NOT populate with teams/blocks/questions
 * The session will receive data from the synced room
 * @param {string} name - Optional name for the session
 * @returns {Promise<string>} Session UUID or null if creation failed
 */
async function createEmptySessionForSync(name) {
  // Generate new session ID
  const sessionId = generateSessionId();
  var d = new Date();
  var formattedDate = (typeof format_date === 'function') ? format_date(d) : d.toLocaleString();
  const sessionName = name || t('sync.synced_session_name', { date: formattedDate });

  // Create new session doc - completely empty except for basic structure
  const sessionDoc = await initSessionDoc(sessionId);

  sessionDoc.transact(function() {
    const session = sessionDoc.getMap('session');
    session.set('id', sessionId);
    session.set('name', sessionName);
    session.set('createdAt', Date.now());
    session.set('lastModified', Date.now());
    session.set('isAwaitingSync', true);  // Flag to indicate waiting for sync data

    // Minimal config
    const newConfig = new Y.Map();
    newConfig.set('maxPointsPerQuestion', 20);
    newConfig.set('rounding', false);
    session.set('config', newConfig);

    // Empty teams array with just the null placeholder
    const newTeams = new Y.Array();
    newTeams.push([null]); // Placeholder at index 0
    session.set('teams', newTeams);

    // Empty blocks array - not even "No Block"
    const newBlocks = new Y.Array();
    session.set('blocks', newBlocks);

    // Empty questions array with just the null placeholder
    const newQuestions = new Y.Array();
    newQuestions.push([null]); // Placeholder at index 0
    session.set('questions', newQuestions);

    // Empty history log
    const historyLog = new Y.Array();
    session.set('historyLog', historyLog);
  }, 'local');

  // Update global doc
  const meta = getGlobalDoc().getMap('meta');
  const sessionOrder = meta.get('sessionOrder') || [];

  getGlobalDoc().transact(function() {
    const newOrder = sessionOrder.slice();
    newOrder.push(sessionId);
    meta.set('sessionOrder', newOrder);
    meta.set('currentSession', sessionId);
    
    // Update session name cache
    let sessionNames = meta.get('sessionNames');
    if (!sessionNames) {
      sessionNames = new Y.Map();
      meta.set('sessionNames', sessionNames);
    }
    sessionNames.set(sessionId, sessionName);
  }, 'local');

  // Switch to new session
  DocManager.setActiveSession(sessionId);
  
  // Reset to first question for the new session
  current_question_index = 1;

  // Log in global history
  add_global_history_entry('history_global.actions.create_session', 'history_global.details_templates.created_synced_session', { name: sessionName });

  return sessionId;
}

/**
 * Switch to a different session
 * @param {string|number} sessionIdOrIndex - Session UUID or 1-based index
 * @returns {Promise<boolean>} True if switch successful
 */
async function switchSession(sessionIdOrIndex) {
  const meta = getGlobalDoc().getMap('meta');
  const sessionOrder = meta.get('sessionOrder') || [];
  const oldSessionId = DocManager.activeSessionId;
  
  let sessionId;
  
  // Determine if we got a UUID or an index
  if (typeof sessionIdOrIndex === 'string' && sessionIdOrIndex.includes('-')) {
    // It's a UUID
    sessionId = sessionIdOrIndex;
  } else {
    // It's an index (1-based)
    const index = Number(sessionIdOrIndex) - 1;
    if (index >= 0 && index < sessionOrder.length) {
      sessionId = sessionOrder[index];
    }
  }

  if (!sessionId || !sessionOrder.includes(sessionId)) {
    console.error('Invalid session:', sessionIdOrIndex);
    return false;
  }

  // Notify sync module before switching sessions (may show confirmation)
  if (typeof handleSessionSwitch === 'function' && oldSessionId !== sessionId) {
    var shouldProceed = await handleSessionSwitch(sessionId);
    if (!shouldProceed) {
      return false; // User cancelled the switch
    }
  }

  // Load session doc if not already loaded
  await initSessionDoc(sessionId);

  // Update global doc
  getGlobalDoc().transact(function() {
    meta.set('currentSession', sessionId);
  }, 'local');

  // Set active session
  DocManager.setActiveSession(sessionId);

  // Jump to last question for this session
  const session = get_current_session();
  if (session) {
    const questions = session.get('questions');
    const lastQuestionIndex = Math.max(1, questions.length - 1);
    current_question_index = lastQuestionIndex;
  }
  
  // Log in global history
  const sessionName = session ? session.get('name') : 'Unknown';
  add_global_history_entry('history_global.actions.switch_session', 'history_global.details_templates.switched_session', { name: sessionName });

  sync_data_to_display();
  
  // Refresh history display to show current session's history
  if (typeof refresh_history_display === 'function') {
    refresh_history_display();
  }
  
  return true;
}

/**
 * Delete a session
 * @param {string|number} sessionIdOrIndex - Session UUID or 1-based index
 * @param {boolean} skipConfirm - Skip confirmation dialog (for merge operations)
 * @param {Object} [mergeContext] - Optional context when deleting due to merge
 * @param {string} mergeContext.targetName - Name of the session merged into
 * @returns {Promise<boolean>} True if deletion successful
 */
async function deleteSession(sessionIdOrIndex, skipConfirm, mergeContext) {
  const meta = getGlobalDoc().getMap('meta');
  const sessionOrder = meta.get('sessionOrder') || [];

  // Validate input - must have a valid session to delete
  if (!sessionIdOrIndex) {
    console.error('deleteSession: No session specified');
    return false;
  }

  // Must have at least 2 sessions to delete one
  if (sessionOrder.length <= 1) {
    alert(t('alerts.cannot_delete_only_session'));
    return false;
  }

  let sessionId;
  let sessionIndex;

  // Determine if we got a UUID or an index
  if (typeof sessionIdOrIndex === 'string' && sessionIdOrIndex.includes('-')) {
    sessionId = sessionIdOrIndex;
    sessionIndex = sessionOrder.indexOf(sessionId);
  } else {
    sessionIndex = Number(sessionIdOrIndex) - 1;
    if (sessionIndex >= 0 && sessionIndex < sessionOrder.length) {
      sessionId = sessionOrder[sessionIndex];
    }
  }

  if (!sessionId || sessionIndex < 0) {
    console.error('Invalid session:', sessionIdOrIndex);
    return false;
  }

  // Get session name before deleting
  const sessionDoc = getSessionDoc(sessionId);
  const sessionName = sessionDoc ? sessionDoc.getMap('session').get('name') : 'Unknown';

  if (!skipConfirm && !window.confirm(t('confirm.delete_session', { name: sessionName }))) {
    return false;
  }

  // Create backup before deletion (for undo capability)
  if (typeof createSessionBackup === 'function') {
    await createSessionBackup(sessionId, BackupReason.PRE_MERGE);
  }

  // Determine new current session
  const currentSessionId = meta.get('currentSession');
  let newCurrentId;
  
  if (currentSessionId === sessionId) {
    // Deleting current session - switch to adjacent
    if (sessionIndex > 0) {
      newCurrentId = sessionOrder[sessionIndex - 1];
    } else {
      newCurrentId = sessionOrder[1]; // There's at least one other session
    }
  } else {
    newCurrentId = currentSessionId;
  }

  // Update global doc
  getGlobalDoc().transact(function() {
    const newOrder = sessionOrder.filter(id => id !== sessionId);
    meta.set('sessionOrder', newOrder);
    meta.set('currentSession', newCurrentId);
    
    // Remove from session name cache
    const sessionNames = meta.get('sessionNames');
    if (sessionNames && sessionNames.has(sessionId)) {
      sessionNames.delete(sessionId);
    }
  }, 'local');

  // Destroy session doc and clear storage
  await destroySessionDoc(sessionId, true);

  // Disconnect from sync if we deleted the synced session
  if (typeof handleSyncedSessionDeleted === 'function') {
    handleSyncedSessionDeleted(sessionId);
  }

  // Switch to new current if needed
  if (currentSessionId === sessionId) {
    await initSessionDoc(newCurrentId);
    DocManager.setActiveSession(newCurrentId);
  }

  // Log in global history - use merge entry if this is part of a merge operation
  if (mergeContext && mergeContext.targetName) {
    add_global_history_entry('history_global.actions.merge_session', 'history_global.details_templates.merged_session', { 
      source: sessionName, 
      target: mergeContext.targetName 
    });
  } else {
    add_global_history_entry('history_global.actions.delete_session', 'history_global.details_templates.deleted_session', { name: sessionName });
  }

  if (!skipConfirm) {
    alert(t('alerts.deleted'));
  }
  sync_data_to_display();
  return true;
}

/**
 * Get all sessions as array of objects
 * @returns {Array} Array of { id, name, index }
 */
function getAllSessions() {
  const sessionOrder = get_session_order();
  const result = [];
  
  // Get cached session names from global doc
  const meta = getGlobalDoc().getMap('meta');
  const sessionNames = meta.get('sessionNames');
  const unnamedSessionText = (typeof t === 'function') ? t('defaults.unnamed_session') : 'Unnamed Session';

  for (let i = 0; i < sessionOrder.length; i++) {
    const sessionId = sessionOrder[i];
    
    // Use cached name if available
    let name = unnamedSessionText;
    if (sessionNames && sessionNames.has(sessionId)) {
      name = sessionNames.get(sessionId);
    } else {
      // Fallback: load from session doc
      let sessionDoc = getSessionDoc(sessionId);
      if (sessionDoc) {
        const session = sessionDoc.getMap('session');
        name = session.get('name') || unnamedSessionText;
        
        // Update cache for next time
        getGlobalDoc().transact(() => {
          let sessionNamesMap = meta.get('sessionNames');
          if (!sessionNamesMap) {
            sessionNamesMap = new Y.Map();
            meta.set('sessionNames', sessionNamesMap);
          }
          sessionNamesMap.set(sessionId, name);
        }, 'local');
      }
    }

    result.push({
      id: sessionId,
      index: i + 1,
      name: name
    });
  }

  return result;
}

/**
 * Update last modified timestamp for a session
 * @param {string} sessionId - Session UUID
 */
function updateSessionLastModified(sessionId) {
  sessionId = sessionId || get_current_session_id();
  if (!sessionId) return;

  const sessionDoc = getSessionDoc(sessionId);
  if (sessionDoc) {
    sessionDoc.transact(function() {
      const session = sessionDoc.getMap('session');
      session.set('lastModified', Date.now());
    }, 'local');
  }
}

/**
 * Extract session data for comparison (teams, blocks, questions names)
 * @param {string} sessionId - Session UUID
 * @returns {Promise<Object>} Data object with teams, blocks, questions arrays
 */
async function extractSessionDataForMerge(sessionId) {
  // Ensure session doc is loaded
  let sessionDoc = getSessionDoc(sessionId);
  if (!sessionDoc) {
    sessionDoc = await initSessionDoc(sessionId);
  }
  if (!sessionDoc) return { teams: [null], blocks: [null], questions: [null] };

  // Wait for session data to be available (IndexedDB sync may be in progress)
  await waitForSessionData(sessionDoc);

  const session = sessionDoc.getMap('session');
  if (!session) return { teams: [null], blocks: [null], questions: [null] };

  const result = {
    teams: [null], // Index 0 is always null
    blocks: [null], // Index 0 is always null
    questions: [null] // Index 0 is always null
  };

  // Extract team names
  const teams = session.get('teams');
  if (teams) {
    for (let i = 1; i < teams.length; i++) {
      const team = teams.get(i);
      result.teams.push(team ? team.get('name') : null);
    }
  }

  // Extract block names
  const blocks = session.get('blocks');
  if (blocks) {
    for (let i = 1; i < blocks.length; i++) {
      const block = blocks.get(i);
      result.blocks.push(block ? block.get('name') : null);
    }
  }

  // Extract question names
  const questions = session.get('questions');
  if (questions) {
    for (let i = 1; i < questions.length; i++) {
      const question = questions.get(i);
      result.questions.push(question ? question.get('name') : null);
    }
  }

  return result;
}

/**
 * Show the session manager dialog for renaming and reordering sessions
 */
function showSessionManagerDialog() {
  const sessions = getAllSessions();
  const currentSessionId = DocManager.activeSessionId;

  // Remove any existing dialog
  const existing = document.getElementById('session-manager-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'session-manager-overlay';
  overlay.className = 'sync-dialog-overlay';

  overlay.innerHTML = createSessionManagerDialogHTML(sessions, currentSessionId);
  document.body.appendChild(overlay);

  // Set up event listeners
  setupSessionManagerListeners(overlay);

  // Focus first input
  const firstInput = overlay.querySelector('.session-manager-name-input');
  if (firstInput) firstInput.focus();

  // Handle close
  overlay.querySelector('.session-manager-close-btn').addEventListener('click', function() {
    overlay.remove();
  });

  // Handle Escape key
  function onSessionManagerEscape(e) {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', onSessionManagerEscape);
      overlay.remove();
    }
  }
  document.addEventListener('keydown', onSessionManagerEscape);

  // Handle overlay click
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      document.removeEventListener('keydown', onSessionManagerEscape);
      overlay.remove();
    }
  });
}

/**
 * Show a modal confirming that a new session has been created
 * @param {string} sessionName - Name of the newly created session
 * @returns {Promise<void>} Resolves when dialog is closed
 */
function showNewSessionCreatedModal(sessionName) {
  return new Promise(function(resolve) {
    // Remove any existing dialog
    const existing = document.getElementById('new-session-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'new-session-modal-overlay';
    overlay.className = 'sync-dialog-overlay';

    const escapedName = HTMLescape(sessionName);

    overlay.innerHTML = '<div class="sync-dialog" role="dialog" aria-labelledby="new-session-modal-title" aria-modal="true">' +
      '<h2 id="new-session-modal-title">' + t('session_dialogs.new_session_created_title') + '</h2>' +
      '<p>' + t('session_dialogs.new_session_created_message', { name: escapedName }) + '</p>' +
      '<div class="button-row">' +
        '<button type="button" class="new-session-ok-btn primary">' + t('session_dialogs.new_session_ok') + '</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(overlay);

    // Focus OK button
    const okBtn = overlay.querySelector('.new-session-ok-btn');
    if (okBtn) okBtn.focus();

    function closeNewSessionModal() {
      document.removeEventListener('keydown', onNewSessionModalEscape);
      overlay.remove();
      resolve();
    }

    // Handle OK button click
    okBtn.addEventListener('click', closeNewSessionModal);

    // Handle Escape key
    function onNewSessionModalEscape(e) {
      if (e.key === 'Escape') {
        closeNewSessionModal();
      }
    }
    document.addEventListener('keydown', onNewSessionModalEscape);

    // Handle overlay click
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        closeNewSessionModal();
      }
    });
  });
}

/**
 * Check if a timestamp is from today
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {boolean} true if the timestamp is from today
 */
function isFromToday(timestamp) {
  if (!timestamp) return false;
  const date = new Date(timestamp);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
         date.getMonth() === today.getMonth() &&
         date.getDate() === today.getDate();
}

/**
 * Show dialog asking user to continue with current session or create new one
 * @param {string} currentSessionName - Name of the current session
 * @param {number} [sessionCreatedAt] - Timestamp when session was created (optional)
 * @returns {Promise<string>} 'continue' or 'new'
 */
function showContinueOrNewSessionDialog(currentSessionName, sessionCreatedAt) {
  return new Promise(function(resolve) {
    // Remove any existing dialog
    const existing = document.getElementById('continue-or-new-dialog-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'continue-or-new-dialog-overlay';
    overlay.className = 'sync-dialog-overlay';

    const escapedName = HTMLescape(currentSessionName);
    
    // Default to continue if session was created today, otherwise default to new
    const defaultToContinue = isFromToday(sessionCreatedAt);

    overlay.innerHTML = '<div class="sync-dialog" role="dialog" aria-labelledby="continue-or-new-dialog-title" aria-modal="true" style="text-align: center;">' +
      '<h2 id="continue-or-new-dialog-title">' + t('session_dialogs.continue_or_new_title') + '</h2>' +
      '<p>' + t('session_dialogs.continue_or_new_message') + '</p>' +
      '<p><strong>' + t('session_dialogs.current_session_label') + '</strong> ' + escapedName + '</p>' +
      '<div class="button-row" style="justify-content: center;">' +
        '<button type="button" class="continue-session-btn' + (defaultToContinue ? ' primary' : '') + '">' + t('session_dialogs.continue_session') + '</button>' +
        '<button type="button" class="start-new-session-btn' + (defaultToContinue ? '' : ' primary') + '">' + t('session_dialogs.start_new_session') + '</button>' +
      '</div>' +
    '</div>';

    document.body.appendChild(overlay);

    // Focus the default button
    const continueBtn = overlay.querySelector('.continue-session-btn');
    const newBtn = overlay.querySelector('.start-new-session-btn');
    const defaultBtn = defaultToContinue ? continueBtn : newBtn;
    if (defaultBtn) defaultBtn.focus();
    
    const defaultChoice = defaultToContinue ? 'continue' : 'new';

    function closeContinueOrNewDialog(choice) {
      document.removeEventListener('keydown', onContinueOrNewDialogEscape);
      overlay.remove();
      resolve(choice);
    }

    // Handle button clicks
    continueBtn.addEventListener('click', function() {
      closeContinueOrNewDialog('continue');
    });

    newBtn.addEventListener('click', function() {
      closeContinueOrNewDialog('new');
    });

    // Handle Escape key - always continue previous session
    function onContinueOrNewDialogEscape(e) {
      if (e.key === 'Escape') {
        closeContinueOrNewDialog('continue');
      }
    }
    document.addEventListener('keydown', onContinueOrNewDialogEscape);

    // Clicking overlay uses default choice
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        closeContinueOrNewDialog(defaultChoice);
      }
    });
  });
}

/**
 * Create HTML for session manager dialog
 * @param {Array} sessions - Array of session objects
 * @param {string} currentSessionId - UUID of the current session
 * @returns {string} HTML string
 */
function createSessionManagerDialogHTML(sessions, currentSessionId) {
  let listHtml = '';
  const canDelete = sessions.length > 1;
  
  // Get sync statuses for all sessions (shows if session has a saved sync room)
  const syncStatuses = (typeof getSessionSyncStatuses === 'function') ? getSessionSyncStatuses() : {};

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    const isCurrent = session.id === currentSessionId;
    const hasSyncRoom = syncStatuses[i + 1]; // 1-based index in syncStatuses
    const currentClass = isCurrent ? ' current-session' : '';
    const currentBadge = isCurrent ? '<span class="session-manager-current-badge">●</span>' : '';
    const syncIcon = hasSyncRoom ? '<span class="session-manager-sync-icon" title="' + t('sync.has_sync_room') + '">🔄</span>' : '';

    listHtml += '<li class="session-manager-item' + currentClass + '" data-session-id="' + session.id + '" data-index="' + i + '" draggable="true">' +
      '<span class="session-manager-drag-handle" aria-label="' + t('session_manager.drag_aria', { name: HTMLescape(session.name) }) + '">☰</span>' +
      '<span class="session-manager-index">' + (i + 1) + syncIcon + '</span>' +
      '<input type="text" class="session-manager-name-input" ' +
             'value="' + HTMLescape(session.name) + '" ' +
             'placeholder="' + t('session_manager.rename_placeholder') + '" ' +
             'data-session-id="' + session.id + '" ' +
             'data-original-name="' + HTMLescape(session.name) + '">' +
      currentBadge +
      '<button class="session-manager-delete-btn" ' +
              'data-session-id="' + session.id + '" ' +
              'data-session-name="' + HTMLescape(session.name) + '" ' +
              'aria-label="' + t('session_manager.delete_aria', { name: HTMLescape(session.name) }) + '"' +
              (!canDelete ? ' disabled title="' + t('alerts.cannot_delete_only_session') + '"' : '') +
      '>🗑️</button>' +
    '</li>';
  }

  // Check for duplicate sessions for auto-merge button visibility
  let hasDuplicates = false;
  try {
    if (typeof findDuplicateSessionGroups === 'function') {
      hasDuplicates = findDuplicateSessionGroups().length > 0;
    }
  } catch (e) {
    // Ignore if sessions not loaded yet
  }

  return '<div class="sync-dialog session-manager-dialog" role="dialog" aria-labelledby="session-manager-title" aria-modal="true">' +
    '<h2 id="session-manager-title">' + t('session_manager.dialog_title') + '</h2>' +
    '<p class="session-manager-hint">' + t('session_manager.reorder_hint') + '</p>' +
    '<ul class="session-manager-list" id="session-manager-list">' + listHtml + '</ul>' +
    '<div class="session-manager-footer">' +
      '<div class="session-manager-merge-buttons">' +
        '<button type="button" class="session-manager-merge-btn secondary" id="session-manager-merge">' + t('advanced.merge_sessions') + '</button>' +
        (hasDuplicates ? '<button type="button" class="session-manager-auto-merge-btn secondary" id="session-manager-auto-merge">' + t('advanced.auto_merge') + '</button>' : '') +
      '</div>' +
      '<div class="button-row">' +
        '<button type="button" class="session-manager-close-btn primary">' + t('session_manager.close_button') + '</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

/**
 * Set up event listeners for session manager dialog
 * @param {HTMLElement} overlay - The dialog overlay element
 */
function setupSessionManagerListeners(overlay) {
  const list = overlay.querySelector('#session-manager-list');

  // Handle name changes
  list.addEventListener('change', function(e) {
    if (e.target.classList.contains('session-manager-name-input')) {
      handleSessionRename(e.target);
    }
  });

  // Handle blur for name inputs
  list.addEventListener('blur', function(e) {
    if (e.target.classList.contains('session-manager-name-input')) {
      handleSessionRename(e.target);
    }
  }, true);

  // Handle delete button clicks
  list.addEventListener('click', function(e) {
    const deleteBtn = e.target.closest('.session-manager-delete-btn');
    if (deleteBtn && !deleteBtn.disabled) {
      handleSessionManagerDelete(deleteBtn, overlay);
    }
  });

  // Handle merge button click
  const mergeBtn = overlay.querySelector('#session-manager-merge');
  if (mergeBtn) {
    mergeBtn.addEventListener('click', function() {
      overlay.remove();
      showMergeSessionsDialog();
    });
  }

  // Handle auto-merge button click
  const autoMergeBtn = overlay.querySelector('#session-manager-auto-merge');
  if (autoMergeBtn) {
    autoMergeBtn.addEventListener('click', function() {
      overlay.remove();
      autoMergeDuplicateSessions();
    });
  }

  // Set up drag and drop
  setupSessionManagerDragDrop(list, overlay);
}

/**
 * Handle session rename from the manager dialog
 * @param {HTMLInputElement} input - The name input element
 */
function handleSessionRename(input) {
  const sessionId = input.getAttribute('data-session-id');
  const originalName = input.getAttribute('data-original-name');
  const newName = input.value.trim();

  if (!newName) {
    // Reset to original if empty
    input.value = originalName;
    showToast(t('session_manager.empty_name_error'));
    return;
  }

  if (newName === originalName) {
    return; // No change
  }

  // Update session name
  renameSession(sessionId, newName);
  input.setAttribute('data-original-name', newName);
}

/**
 * Rename a session by ID
 * @param {string} sessionId - Session UUID
 * @param {string} newName - New session name
 */
function renameSession(sessionId, newName) {
  const sessionDoc = getSessionDoc(sessionId);
  if (!sessionDoc) return;

  const session = sessionDoc.getMap('session');
  const oldName = session.get('name');

  sessionDoc.transact(() => {
    session.set('name', newName);
    
    // Add history entry if this is the current session
    if (sessionId === DocManager.activeSessionId) {
      add_history_entry('edit_log.actions.rename_session', 'edit_log.details_templates.renamed', { old: oldName, new: newName });
    }
  }, 'local');

  // Update session name cache in global doc
  getGlobalDoc().transact(() => {
    const meta = getGlobalDoc().getMap('meta');
    let sessionNames = meta.get('sessionNames');
    if (!sessionNames) {
      sessionNames = new Y.Map();
      meta.set('sessionNames', sessionNames);
    }
    sessionNames.set(sessionId, newName);
  }, 'local');

  // Update display if this was the current session
  if (sessionId === DocManager.activeSessionId) {
    sync_data_to_display();
    if (typeof refresh_history_display === 'function') {
      refresh_history_display();
    }
  }
}

/**
 * Handle session delete from the manager dialog
 * @param {HTMLButtonElement} button - The delete button
 * @param {HTMLElement} overlay - The dialog overlay
 */
async function handleSessionManagerDelete(button, overlay) {
  const sessionId = button.getAttribute('data-session-id');
  const sessionName = button.getAttribute('data-session-name');

  if (!window.confirm(t('confirm.delete_session', { name: sessionName }))) {
    return;
  }

  // Close dialog first to prevent stale state issues
  overlay.remove();

  // Delete the session (skipConfirm=true since we already confirmed)
  await deleteSession(sessionId, true);
  alert(t('alerts.deleted'));

  // Re-open the dialog if there are still sessions
  const sessions = getAllSessions();
  if (sessions.length > 0) {
    showSessionManagerDialog();
  }
}

/**
 * Set up drag and drop for session reordering
 * @param {HTMLElement} list - The session list element
 * @param {HTMLElement} overlay - The dialog overlay
 */
function setupSessionManagerDragDrop(list, overlay) {
  let draggingItem = null;
  let isDraggingFromHandle = false;
  const SCROLL_ZONE = 50; // pixels from edge to trigger scroll
  const SCROLL_SPEED = 8; // pixels per frame

  function getDragAfterElement(y) {
    const draggableElements = Array.from(list.querySelectorAll('.session-manager-item:not(.dragging)'));
    return draggableElements.reduce(function(closest, child) {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      }
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  function autoScroll(clientY) {
    const rect = list.getBoundingClientRect();
    const topEdge = rect.top;
    const bottomEdge = rect.bottom;

    if (clientY - topEdge < SCROLL_ZONE) {
      // Scroll up
      list.scrollTop -= SCROLL_SPEED;
    } else if (bottomEdge - clientY < SCROLL_ZONE) {
      // Scroll down
      list.scrollTop += SCROLL_SPEED;
    }
  }

  function finalizeReorder() {
    if (!draggingItem) return;

    draggingItem.classList.remove('dragging');
    draggingItem = null;
    isDraggingFromHandle = false;

    // Get new order
    const items = Array.from(list.querySelectorAll('.session-manager-item'));
    const newOrder = items.map(function(item) {
      return item.getAttribute('data-session-id');
    });

    // Check if order actually changed
    const currentOrder = get_session_order();
    const orderChanged = !newOrder.every(function(id, index) {
      return id === currentOrder[index];
    });

    if (orderChanged) {
      reorderSessions(newOrder);
      
      // Update indices in the UI
      items.forEach(function(item, index) {
        item.querySelector('.session-manager-index').textContent = index + 1;
        item.setAttribute('data-index', index);
      });
    }
  }

  // Track mousedown on drag handle to allow drag
  list.addEventListener('mousedown', function(e) {
    const handle = e.target.closest('.session-manager-drag-handle');
    if (handle) {
      isDraggingFromHandle = true;
    }
  });

  // Drag start
  list.addEventListener('dragstart', function(e) {
    if (!isDraggingFromHandle) {
      e.preventDefault();
      return;
    }
    draggingItem = e.target.closest('.session-manager-item');
    if (draggingItem) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', '');
      requestAnimationFrame(function() {
        if (draggingItem) draggingItem.classList.add('dragging');
      });
    }
  });

  // Drag over
  list.addEventListener('dragover', function(e) {
    if (!draggingItem) return;
    e.preventDefault();
    autoScroll(e.clientY);
    const afterElement = getDragAfterElement(e.clientY);
    if (afterElement == null) {
      list.appendChild(draggingItem);
    } else {
      list.insertBefore(draggingItem, afterElement);
    }
  });

  // Drop
  list.addEventListener('drop', function(e) {
    if (!draggingItem) return;
    e.preventDefault();
    finalizeReorder();
  });

  // Drag end
  list.addEventListener('dragend', function() {
    if (draggingItem) {
      draggingItem.classList.remove('dragging');
      draggingItem = null;
    }
    isDraggingFromHandle = false;
  });

  // Touch support via pointer events
  let touchDragging = null;
  const supportsNativeDrag = 'draggable' in document.createElement('span');

  list.addEventListener('pointerdown', function(e) {
    const handle = e.target.closest('.session-manager-drag-handle');
    if (!handle) return;
    if (supportsNativeDrag && e.pointerType === 'mouse') return;

    const item = handle.closest('.session-manager-item');
    if (!item) return;

    e.preventDefault();
    touchDragging = item;
    item.classList.add('dragging');
    handle.setPointerCapture(e.pointerId);
  });

  list.addEventListener('pointermove', function(e) {
    if (!touchDragging) return;
    if (supportsNativeDrag && e.pointerType === 'mouse') return;

    autoScroll(e.clientY);
    const afterElement = getDragAfterElement(e.clientY);
    if (afterElement == null) {
      list.appendChild(touchDragging);
    } else {
      list.insertBefore(touchDragging, afterElement);
    }
  });

  list.addEventListener('pointerup', function(e) {
    if (!touchDragging) return;
    if (supportsNativeDrag && e.pointerType === 'mouse') return;

    touchDragging.classList.remove('dragging');
    
    // Get new order and apply
    const items = Array.from(list.querySelectorAll('.session-manager-item'));
    const newOrder = items.map(function(item) {
      return item.getAttribute('data-session-id');
    });

    const currentOrder = get_session_order();
    const orderChanged = !newOrder.every(function(id, index) {
      return id === currentOrder[index];
    });

    if (orderChanged) {
      reorderSessions(newOrder);
      items.forEach(function(item, index) {
        item.querySelector('.session-manager-index').textContent = index + 1;
        item.setAttribute('data-index', index);
      });
    }

    touchDragging = null;
  });

  list.addEventListener('pointercancel', function() {
    if (touchDragging) {
      touchDragging.classList.remove('dragging');
      touchDragging = null;
    }
  });
}

/**
 * Reorder sessions to a new order
 * @param {Array<string>} newOrder - Array of session UUIDs in new order
 */
function reorderSessions(newOrder) {
  const meta = getGlobalDoc().getMap('meta');

  // Ensure we have a plain array of strings for Yjs
  const plainOrder = Array.from(newOrder).map(function(id) {
    return String(id);
  });

  getGlobalDoc().transact(() => {
    meta.set('sessionOrder', plainOrder);
  }, 'local');

  // Log in global history
  add_global_history_entry('history_global.actions.reorder_sessions', 'history_global.details_templates.reordered_sessions', {});

  // Update display
  sync_data_to_display();
}

/**
 * Show the merge sessions dialog
 */
function showMergeSessionsDialog() {
  const sessions = getAllSessions();

  // Need at least 2 sessions to merge
  if (sessions.length < 2) {
    showToast(t('merge.no_sessions_error'));
    return;
  }

  // Remove any existing dialog
  const existing = document.getElementById('merge-dialog-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'merge-dialog-overlay';
  overlay.className = 'sync-dialog-overlay';

  overlay.innerHTML = createMergeDialogHTML(sessions);
  document.body.appendChild(overlay);

  // Focus first focusable element
  const firstSelect = overlay.querySelector('select');
  if (firstSelect) firstSelect.focus();

  // Handle cancel
  overlay.querySelector('.cancel-merge-btn').addEventListener('click', function() {
    overlay.remove();
  });

  // Handle merge
  overlay.querySelector('.confirm-merge-btn').addEventListener('click', async function() {
    const sourceSelect = document.getElementById('merge-source-session');
    const targetSelect = document.getElementById('merge-target-session');

    const sourceId = sourceSelect.value;
    const targetId = targetSelect.value;

    if (sourceId === targetId) {
      showToast(t('merge.same_session_error'));
      return;
    }

    overlay.remove();
    await performSessionMerge(sourceId, targetId);
  });

  // Handle Escape key
  function onMergeEscape(e) {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', onMergeEscape);
      overlay.remove();
    }
  }
  document.addEventListener('keydown', onMergeEscape);

  // Handle overlay click
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      document.removeEventListener('keydown', onMergeEscape);
      overlay.remove();
    }
  });
}

/**
 * Create HTML for merge sessions dialog
 * @param {Array} sessions - Array of session objects
 * @returns {string} HTML string
 */
function createMergeDialogHTML(sessions) {
  let optionsHtml = '';
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    optionsHtml += '<option value="' + session.id + '">' + escapeHtml(session.name) + ' (#' + session.index + ')</option>';
  }

  return '<div class="sync-dialog" role="dialog" aria-labelledby="merge-dialog-title" aria-modal="true">' +
    '<h2 id="merge-dialog-title">' + t('merge.dialog_title') + '</h2>' +
    '<div class="form-group">' +
      '<label for="merge-source-session">' + t('merge.select_source') + '</label>' +
      '<select id="merge-source-session">' + optionsHtml + '</select>' +
      '<small class="form-hint">' + t('merge.source_help') + '</small>' +
    '</div>' +
    '<div class="form-group">' +
      '<label for="merge-target-session">' + t('merge.select_target') + '</label>' +
      '<select id="merge-target-session">' + optionsHtml + '</select>' +
      '<small class="form-hint">' + t('merge.target_help') + '</small>' +
    '</div>' +
    '<div class="button-row">' +
      '<button type="button" class="cancel-merge-btn">' + t('merge.cancel_button') + '</button>' +
      '<button type="button" class="confirm-merge-btn primary">' + t('merge.merge_button') + '</button>' +
    '</div>' +
  '</div>';
}

/**
 * Perform the actual session merge
 * @param {string} sourceId - Source session UUID
 * @param {string} targetId - Target session UUID
 */
async function performSessionMerge(sourceId, targetId) {
  try {
    // Create backups before merge (for undo capability)
    if (typeof createSessionBackup === 'function') {
      await createSessionBackup(sourceId, BackupReason.PRE_MERGE);
      await createSessionBackup(targetId, BackupReason.PRE_MERGE);
    }

    // Extract data from both sessions
    const sourceData = extractSessionDataForMerge(sourceId);
    const targetData = extractSessionDataForMerge(targetId);

    // Get target session name for history entry
    const targetDoc = getSessionDoc(targetId);
    const targetName = targetDoc ? targetDoc.getMap('session').get('name') : 'Unknown';

    // Compare the sessions
    const comparison = compareSessionData(sourceData, targetData);
    const stats = getMatchStats(comparison);

    // If there are differences that need review, show the matching dialog
    if (stats.overallNeedsReview || 
        comparison.teams.unmatched.remote.length > 0 ||
        comparison.blocks.unmatched.remote.length > 0 ||
        comparison.questions.unmatched.remote.length > 0) {
      
      // Show matching dialog - reuse sync matching but with different labels
      const mappings = await showMergeMatchingDialog(comparison);
      
      if (!mappings) {
        // User cancelled
        return;
      }

      // Apply the merge with mappings
      await applySessionMerge(sourceId, targetId, mappings);
    } else {
      // All exact matches, merge directly
      await applySessionMerge(sourceId, targetId, null);
    }

    // Delete the source session after successful merge, with merge context for history
    await deleteSession(sourceId, true, { targetName: targetName });

    showToast(t('merge.merge_success'));

    // Switch to target session to show results
    await switchSession(targetId);

  } catch (error) {
    console.error('Merge failed:', error);
    showToast(t('merge.merge_failed', { error: error.message }));
  }
}

/**
 * Check if a session name contains a date/time pattern
 * @param {string} name - Session name
 * @returns {boolean} True if name contains date/time
 */
function sessionNameHasDateTime(name) {
  if (!name) return false;
  // Match common date patterns: MM/DD/YYYY, YYYY-MM-DD, DD/MM/YYYY, etc.
  // Also match time patterns: HH:MM, HH:MM:SS
  const datePatterns = [
    /\d{1,2}\/\d{1,2}\/\d{2,4}/, // MM/DD/YYYY or DD/MM/YYYY
    /\d{4}-\d{2}-\d{2}/, // YYYY-MM-DD
    /\d{1,2}:\d{2}(:\d{2})?/, // HH:MM or HH:MM:SS
    /\d{1,2}\s+(AM|PM)/i // 12-hour time
  ];
  return datePatterns.some(pattern => pattern.test(name));
}

/**
 * Find groups of sessions with identical names that contain date/time
 * @returns {Array} Array of groups, each group is array of session objects with same name
 */
function findDuplicateSessionGroups() {
  const sessions = getAllSessions();
  const nameGroups = {};

  // Group sessions by name
  for (const session of sessions) {
    // Only consider sessions with date/time in name
    if (!sessionNameHasDateTime(session.name)) continue;

    const name = session.name.trim().toLowerCase();
    if (!nameGroups[name]) {
      nameGroups[name] = [];
    }
    nameGroups[name].push(session);
  }

  // Filter to only groups with duplicates
  const duplicateGroups = [];
  for (const name in nameGroups) {
    if (nameGroups[name].length > 1) {
      duplicateGroups.push(nameGroups[name]);
    }
  }

  return duplicateGroups;
}

/**
 * Update the visibility of the Auto Merge button based on duplicate sessions
 */
function updateAutoMergeButtonVisibility() {
  // Guard against test environment without full DOM
  if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
  
  const button = document.getElementById('auto_merge_sessions');
  if (!button) return;

  // Guard against being called before sessions are loaded
  try {
    const duplicateGroups = findDuplicateSessionGroups();
    button.style.display = duplicateGroups.length > 0 ? 'inline-block' : 'none';
  } catch (e) {
    // Sessions not loaded yet, keep button hidden
    button.style.display = 'none';
  }
}

/**
 * Auto merge all duplicate sessions
 */
async function autoMergeDuplicateSessions() {
  const duplicateGroups = findDuplicateSessionGroups();

  if (duplicateGroups.length === 0) {
    showToast(t('merge.auto_merge_no_duplicates'));
    return;
  }

  // Show loading indicator immediately
  const totalDuplicates = duplicateGroups.reduce((sum, g) => sum + g.length - 1, 0);
  showLoading(t('merge.auto_merge_processing', { count: totalDuplicates }));

  // Track merge results for summary
  const mergeResults = [];
  const mergeFailures = [];

  for (let i = 0; i < duplicateGroups.length; i++) {
    const group = duplicateGroups[i];
    
    // Sort by index - use first session as target (oldest)
    group.sort((a, b) => a.index - b.index);
    const target = group[0];
    const mergedSources = [];
    const deletedEmpty = [];

    // Merge all others into target
    for (let j = 1; j < group.length; j++) {
      const source = group[j];
      try {
        // Get fresh session data since IDs may have changed after deletions
        const currentSessions = getAllSessions();
        const sourceExists = currentSessions.find(s => s.id === source.id);
        const targetExists = currentSessions.find(s => s.id === target.id);

        if (!sourceExists || !targetExists) {
          console.log('Session no longer exists, skipping:', source.name);
          mergeFailures.push({ source: source.name, target: target.name, reason: 'Session not found' });
          continue;
        }

        // Create backups before auto-merge (for undo capability)
        if (typeof createSessionBackup === 'function') {
          await createSessionBackup(source.id, BackupReason.PRE_MERGE);
          await createSessionBackup(target.id, BackupReason.PRE_MERGE);
        }

        // Check if source session has data before trying to merge
        let sourceDoc = getSessionDoc(source.id);
        if (!sourceDoc) {
          sourceDoc = await initSessionDoc(source.id);
        }
        
        // Wait for data to load
        const sourceHasData = await waitForSessionData(sourceDoc);
        
        if (!sourceHasData) {
          // Source is an empty/ghost session - just delete it
          console.log('Source session is empty, deleting:', source.name);
          await deleteSession(source.id, true);
          deletedEmpty.push(source.name);
          continue;
        }

        // Extract and compare
        const sourceData = await extractSessionDataForMerge(source.id);
        const targetData = await extractSessionDataForMerge(target.id);
        const comparison = compareSessionData(sourceData, targetData);

        // For auto-merge, we don't show the matching dialog
        // We use the auto-matched results directly
        await applySessionMerge(source.id, target.id, null);
        await deleteSession(source.id, true, { targetName: target.name });
        mergedSources.push(source.name);
      } catch (error) {
        console.error('Auto merge failed for session:', source.name, error);
        mergeFailures.push({ source: source.name, target: target.name, reason: error.message || 'Unknown error' });
        // Continue with next session
      }
    }

    if (mergedSources.length > 0 || deletedEmpty.length > 0) {
      mergeResults.push({
        target: target.name,
        sources: mergedSources,
        deleted: deletedEmpty
      });
    }
  }

  // Update button visibility
  // Update button visibility
  updateAutoMergeButtonVisibility();

  // Refresh display
  sync_data_to_display();

  // Hide loading indicator
  hideLoading();

  // Show summary dialog
  showAutoMergeSummary(mergeResults, mergeFailures);
}

/**
 * Show summary dialog after auto merge
 * @param {Array} mergeResults - Array of {target, sources} objects
 * @param {Array} mergeFailures - Array of {source, target, reason} objects
 */
function showAutoMergeSummary(mergeResults, mergeFailures = []) {
  // Remove any existing dialog
  const existing = document.getElementById('merge-summary-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'merge-summary-overlay';
  overlay.className = 'sync-dialog-overlay';
  overlay.style.display = 'flex';

  const totalMerged = mergeResults.reduce((sum, r) => sum + r.sources.length, 0);
  const totalDeleted = mergeResults.reduce((sum, r) => sum + (r.deleted ? r.deleted.length : 0), 0);

  let successTableRows = '';
  for (const result of mergeResults) {
    for (let i = 0; i < result.sources.length; i++) {
      successTableRows += `<tr>
        <td>${HTMLescape(result.sources[i])}</td>
        <td>→</td>
        <td>${HTMLescape(result.target)}</td>
      </tr>`;
    }
  }

  let deletedTableRows = '';
  for (const result of mergeResults) {
    if (result.deleted) {
      for (let i = 0; i < result.deleted.length; i++) {
        deletedTableRows += `<tr>
          <td>${HTMLescape(result.deleted[i])}</td>
          <td>${t('merge.empty_session_deleted')}</td>
        </tr>`;
      }
    }
  }

  let failureTableRows = '';
  for (const failure of mergeFailures) {
    failureTableRows += `<tr>
      <td>${HTMLescape(failure.source)}</td>
      <td>→</td>
      <td>${HTMLescape(failure.target)}</td>
      <td style="color: #f44336;">${HTMLescape(failure.reason)}</td>
    </tr>`;
  }

  let content = '';
  
  if (totalMerged > 0) {
    content += `
      <p>${t('merge.auto_merge_summary', { count: totalMerged })}</p>
      <table class="merge-summary-table">
        <thead>
          <tr>
            <th>${t('merge.source_session')}</th>
            <th></th>
            <th>${t('merge.target_session')}</th>
          </tr>
        </thead>
        <tbody>
          ${successTableRows}
        </tbody>
      </table>
    `;
  }

  if (totalDeleted > 0) {
    content += `
      <p style="color: #ff9800; margin-top: 1rem;">${t('merge.empty_sessions_deleted', { count: totalDeleted })}</p>
      <table class="merge-summary-table">
        <thead>
          <tr>
            <th>${t('merge.source_session')}</th>
            <th>${t('merge.status')}</th>
          </tr>
        </thead>
        <tbody>
          ${deletedTableRows}
        </tbody>
      </table>
    `;
  }

  if (mergeFailures.length > 0) {
    content += `
      <p style="color: #f44336; margin-top: 1rem;">${t('merge.auto_merge_failures', { count: mergeFailures.length })}</p>
      <table class="merge-summary-table">
        <thead>
          <tr>
            <th>${t('merge.source_session')}</th>
            <th></th>
            <th>${t('merge.target_session')}</th>
            <th>${t('merge.failure_reason')}</th>
          </tr>
        </thead>
        <tbody>
          ${failureTableRows}
        </tbody>
      </table>
    `;
  }

  if (totalMerged === 0 && totalDeleted === 0 && mergeFailures.length === 0) {
    content = `<p>${t('merge.auto_merge_no_duplicates')}</p>`;
  }

  overlay.innerHTML = `
    <div class="sync-dialog" role="dialog" aria-modal="true" aria-labelledby="merge-summary-title">
      <h2 id="merge-summary-title">${t('merge.auto_merge_complete_title')}</h2>
      ${content}
      <div class="sync-dialog-buttons">
        <button type="button" id="merge-summary-ok" class="sync-dialog-btn sync-dialog-btn-primary">${t('merge.ok_button')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const okBtn = document.getElementById('merge-summary-ok');
  okBtn.focus();

  okBtn.addEventListener('click', function() {
    overlay.remove();
  });

  // Close on Escape
  overlay.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      overlay.remove();
    }
  });

  // Close on overlay click
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
}

/**
 * Show matching dialog for merge (adapted from sync matching)
 * @param {Object} comparison - Comparison result
 * @returns {Promise<Object|null>} Mappings or null if cancelled
 */
async function showMergeMatchingDialog(comparison) {
  return new Promise(function(resolve) {
    // Remove any existing dialog
    const existing = document.getElementById('merge-dialog-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'merge-dialog-overlay';
    overlay.className = 'sync-dialog-overlay';

    overlay.innerHTML = createMergeMatchingDialogHTML(comparison);
    document.body.appendChild(overlay);

    // Focus first button
    const firstButton = overlay.querySelector('button');
    if (firstButton) firstButton.focus();

    // Handle cancel
    overlay.querySelector('.cancel-matching-btn').addEventListener('click', function() {
      overlay.remove();
      resolve(null);
    });

    // Handle confirm
    overlay.querySelector('.confirm-matching-btn').addEventListener('click', function() {
      const mappings = collectMergeMappings();
      overlay.remove();
      resolve(mappings);
    });

    // Handle Escape
    function onEscape(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onEscape);
        overlay.remove();
        resolve(null);
      }
    }
    document.addEventListener('keydown', onEscape);

    // Handle overlay click
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        document.removeEventListener('keydown', onEscape);
        overlay.remove();
        resolve(null);
      }
    });
  });
}

/**
 * Create HTML for merge matching dialog
 * @param {Object} comparison - Comparison result
 * @returns {string} HTML string
 */
function createMergeMatchingDialogHTML(comparison) {
  let html = '<div class="sync-dialog matching-dialog" role="dialog" aria-labelledby="matching-dialog-title" aria-modal="true">' +
    '<h2 id="matching-dialog-title">' + t('sync.matching_title') + '</h2>' +
    '<p>' + t('sync.matching_description') + '</p>';

  // Teams section
  html += createMergeMatchingSection('teams', t('sync.matching_teams_header'), comparison.teams);

  // Blocks section
  html += createMergeMatchingSection('blocks', t('sync.matching_blocks_header'), comparison.blocks);

  // Questions section
  html += createMergeMatchingSection('questions', t('sync.matching_questions_header'), comparison.questions);

  html += '<div class="button-row">' +
    '<button type="button" class="cancel-matching-btn">' + t('merge.cancel_button') + '</button>' +
    '<button type="button" class="confirm-matching-btn primary">' + t('merge.confirm_merge') + '</button>' +
  '</div></div>';

  return html;
}

/**
 * Create HTML for a matching section in merge dialog
 * @param {string} type - Category type (teams, blocks, questions)
 * @param {string} title - Section title
 * @param {Object} data - Matching data
 * @returns {string} HTML string
 */
function createMergeMatchingSection(type, title, data) {
  if (data.matches.length === 0 && data.unmatched.remote.length === 0) {
    return '';
  }

  let html = '<h3>' + title + '</h3>' +
    '<table class="matching-table">' +
    '<thead><tr>' +
    '<th>#</th>' +
    '<th>' + t('merge.matching_source') + '</th>' +
    '<th></th>' +
    '<th>' + t('merge.matching_target') + '</th>' +
    '</tr></thead><tbody>';

  // Show matches
  for (let i = 0; i < data.matches.length; i++) {
    const match = data.matches[i];
    const isExact = match.confidence === 'exact';
    html += '<tr data-type="' + type + '" data-remote-index="' + match.remoteIndex + '">' +
      '<td>' + match.remoteIndex + '</td>' +
      '<td>' + escapeHtml(match.remoteName) + '</td>' +
      '<td>→</td>' +
      '<td>' +
        (isExact ?
          '<span class="auto-matched">' + escapeHtml(match.localName) + ' ✓</span>' :
          createMergeLocalSelector(type, match.remoteIndex, match.localIndex, data.unmatched.local)
        ) +
      '</td></tr>';
  }

  // Show unmatched source items
  for (let i = 0; i < data.unmatched.remote.length; i++) {
    const item = data.unmatched.remote[i];
    html += '<tr data-type="' + type + '" data-remote-index="' + item.index + '">' +
      '<td>' + item.index + '</td>' +
      '<td>' + escapeHtml(item.name) + '</td>' +
      '<td>→</td>' +
      '<td>' + createMergeLocalSelector(type, item.index, 'new', data.unmatched.local) + '</td>' +
    '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

/**
 * Create dropdown selector for merge matching
 * @param {string} type - Category type
 * @param {number} remoteIndex - Source item index
 * @param {*} selectedValue - Currently selected value
 * @param {Array} unmatchedLocal - Unmatched target items
 * @returns {string} HTML for select
 */
function createMergeLocalSelector(type, remoteIndex, selectedValue, unmatchedLocal) {
  let html = '<select class="matching-select" data-type="' + type + '" data-remote-index="' + remoteIndex + '">';

  // Option to create new
  html += '<option value="new" ' + (selectedValue === 'new' ? 'selected' : '') + '>' + t('sync.matching_create_new') + '</option>';

  // Options for unmatched target items
  for (let i = 0; i < unmatchedLocal.length; i++) {
    const item = unmatchedLocal[i];
    html += '<option value="' + item.index + '" ' + (selectedValue === item.index ? 'selected' : '') + '>' + escapeHtml(item.name) + '</option>';
  }

  html += '</select>';
  return html;
}

/**
 * Collect mappings from merge matching dialog
 * @returns {Object} Mappings object
 */
function collectMergeMappings() {
  const mappings = {
    teams: {},
    blocks: {},
    questions: {}
  };

  // Collect from dropdowns
  const selects = document.querySelectorAll('.matching-select');
  selects.forEach(function(select) {
    const type = select.dataset.type;
    const remoteIndex = parseInt(select.dataset.remoteIndex);
    const value = select.value;

    if (value === 'new') {
      mappings[type][remoteIndex] = 'new';
    } else {
      mappings[type][remoteIndex] = parseInt(value);
    }
  });

  // Collect auto-matched (exact matches shown as text, not dropdown)
  const autoMatched = document.querySelectorAll('tr[data-type][data-remote-index]');
  autoMatched.forEach(function(row) {
    const type = row.dataset.type;
    const remoteIndex = parseInt(row.dataset.remoteIndex);
    
    // Skip if already in mappings (from dropdown)
    if (mappings[type][remoteIndex] !== undefined) return;

    // Auto-matched means source and target indices match
    const autoMatchSpan = row.querySelector('.auto-matched');
    if (autoMatchSpan) {
      mappings[type][remoteIndex] = remoteIndex;
    }
  });

  return mappings;
}

/**
 * Wait for session data to be available
 * @param {Y.Doc} sessionDoc - The session document
 * @param {number} maxWait - Maximum wait time in ms
 * @returns {Promise<boolean>} True if data is available
 */
async function waitForSessionData(sessionDoc, maxWait = 5000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    const session = sessionDoc.getMap('session');
    if (session && session.get('teams') && session.get('blocks') && session.get('questions')) {
      return true;
    }
    // Wait 100ms and try again
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Log what we found for debugging
  const session = sessionDoc.getMap('session');
  console.warn('waitForSessionData timeout. Session map exists:', !!session, 
    'teams:', session ? !!session.get('teams') : false,
    'blocks:', session ? !!session.get('blocks') : false,
    'questions:', session ? !!session.get('questions') : false);
  
  return false;
}

/**
 * Apply the merge from source to target session
 * @param {string} sourceId - Source session UUID
 * @param {string} targetId - Target session UUID
 * @param {Object|null} mappings - User-confirmed mappings or null for auto
 */
async function applySessionMerge(sourceId, targetId, mappings) {
  // Ensure session docs are loaded
  let sourceDoc = getSessionDoc(sourceId);
  if (!sourceDoc) {
    sourceDoc = await initSessionDoc(sourceId);
  }
  let targetDoc = getSessionDoc(targetId);
  if (!targetDoc) {
    targetDoc = await initSessionDoc(targetId);
  }

  if (!sourceDoc || !targetDoc) {
    throw new Error('Session not found');
  }

  // Wait for session data to be available (IndexedDB sync may be in progress)
  const sourceReady = await waitForSessionData(sourceDoc);
  const targetReady = await waitForSessionData(targetDoc);
  
  if (!sourceReady) {
    // Check what's missing for a more helpful error
    const ss = sourceDoc.getMap('session');
    const missing = [];
    if (!ss) missing.push('session map');
    else {
      if (!ss.get('teams')) missing.push('teams');
      if (!ss.get('blocks')) missing.push('blocks');
      if (!ss.get('questions')) missing.push('questions');
    }
    throw new Error('Source session missing: ' + missing.join(', '));
  }
  if (!targetReady) {
    const ts = targetDoc.getMap('session');
    const missing = [];
    if (!ts) missing.push('session map');
    else {
      if (!ts.get('teams')) missing.push('teams');
      if (!ts.get('blocks')) missing.push('blocks');
      if (!ts.get('questions')) missing.push('questions');
    }
    throw new Error('Target session missing: ' + missing.join(', '));
  }

  const sourceSession = sourceDoc.getMap('session');
  const targetSession = targetDoc.getMap('session');

  if (!sourceSession || !targetSession) {
    throw new Error('Session data not found');
  }

  // Get the data arrays and validate they exist
  const sourceTeams = sourceSession.get('teams');
  const sourceBlocks = sourceSession.get('blocks');
  const sourceQuestions = sourceSession.get('questions');
  const targetTeams = targetSession.get('teams');
  const targetBlocks = targetSession.get('blocks');
  const targetQuestions = targetSession.get('questions');

  // Validate required arrays exist
  if (!sourceTeams || !sourceBlocks || !sourceQuestions) {
    throw new Error('Source session data is incomplete');
  }
  if (!targetTeams || !targetBlocks || !targetQuestions) {
    throw new Error('Target session data is incomplete');
  }

  targetDoc.transact(function() {
    // Build mapping lookups
    const teamMap = mappings ? mappings.teams : {};
    const blockMap = mappings ? mappings.blocks : {};
    const questionMap = mappings ? mappings.questions : {};

    // For items mapped to 'new', we need to add them to target
    // For items mapped to existing indices, we merge scores

    // Process teams - add new ones
    const newTeamIndices = {}; // Maps source index to new target index
    for (let i = 1; i < sourceTeams.length; i++) {
      const sourceTeam = sourceTeams.get(i);
      if (!sourceTeam) continue;

      if (teamMap[i] === 'new') {
        // Add new team to target
        const newTeam = new Y.Map();
        newTeam.set('name', sourceTeam.get('name'));
        targetTeams.push([newTeam]);
        newTeamIndices[i] = targetTeams.length - 1;

        // Add placeholder scores for existing target questions
        for (let q = 1; q < targetQuestions.length; q++) {
          const targetQ = targetQuestions.get(q);
          if (targetQ) {
            const teamScores = targetQ.get('teams');
            const newScore = new Y.Map();
            newScore.set('score', 0);
            newScore.set('extraCredit', 0);
            teamScores.push([newScore]);
          }
        }
      }
    }

    // Process blocks - add new ones
    const newBlockIndices = {};
    for (let i = 1; i < sourceBlocks.length; i++) {
      const sourceBlock = sourceBlocks.get(i);
      if (!sourceBlock) continue;

      if (blockMap[i] === 'new') {
        const newBlock = new Y.Map();
        newBlock.set('name', sourceBlock.get('name'));
        targetBlocks.push([newBlock]);
        newBlockIndices[i] = targetBlocks.length - 1;
      }
    }

    // Process questions - add new ones and merge scores
    for (let i = 1; i < sourceQuestions.length; i++) {
      const sourceQ = sourceQuestions.get(i);
      if (!sourceQ) continue;

      if (questionMap[i] === 'new') {
        // Add new question
        const newQuestion = new Y.Map();
        newQuestion.set('name', sourceQ.get('name'));
        newQuestion.set('score', sourceQ.get('score'));
        
        // Map block index
        const sourceBlockIdx = sourceQ.get('block');
        let targetBlockIdx = sourceBlockIdx;
        if (blockMap[sourceBlockIdx] === 'new') {
          targetBlockIdx = newBlockIndices[sourceBlockIdx] || sourceBlockIdx;
        } else if (typeof blockMap[sourceBlockIdx] === 'number') {
          targetBlockIdx = blockMap[sourceBlockIdx];
        }
        newQuestion.set('block', targetBlockIdx);
        newQuestion.set('ignore', sourceQ.get('ignore') || false);

        // Create team scores array
        const newTeamScores = new Y.Array();
        newTeamScores.push([null]); // Index 0 is null

        // Add scores for each target team
        for (let t = 1; t < targetTeams.length; t++) {
          const teamScore = new Y.Map();
          
          // Find if this target team maps from a source team
          let found = false;
          for (let st = 1; st < sourceTeams.length; st++) {
            if (teamMap[st] === t || (!mappings && st === t && st < sourceTeams.length)) {
              // This source team maps to this target team
              const sourceTeamScores = sourceQ.get('teams');
              if (sourceTeamScores && sourceTeamScores.get(st)) {
                teamScore.set('score', sourceTeamScores.get(st).get('score') || 0);
                teamScore.set('extraCredit', sourceTeamScores.get(st).get('extraCredit') || 0);
                found = true;
                break;
              }
            }
          }
          
          if (!found) {
            teamScore.set('score', 0);
            teamScore.set('extraCredit', 0);
          }
          
          newTeamScores.push([teamScore]);
        }

        newQuestion.set('teams', newTeamScores);
        targetQuestions.push([newQuestion]);

      } else if (typeof questionMap[i] === 'number') {
        // Merge scores into existing question
        const targetQIdx = questionMap[i];
        const targetQ = targetQuestions.get(targetQIdx);
        if (!targetQ) continue;

        const sourceTeamScores = sourceQ.get('teams');
        const targetTeamScores = targetQ.get('teams');

        // Merge scores for mapped teams
        for (let st = 1; st < sourceTeams.length; st++) {
          let targetTeamIdx;
          if (teamMap[st] === 'new') {
            targetTeamIdx = newTeamIndices[st];
          } else if (typeof teamMap[st] === 'number') {
            targetTeamIdx = teamMap[st];
          } else if (!mappings && st < targetTeams.length) {
            targetTeamIdx = st;
          } else {
            continue;
          }

          if (targetTeamIdx && sourceTeamScores && sourceTeamScores.get(st)) {
            const sourceScore = sourceTeamScores.get(st);
            if (targetTeamScores && targetTeamScores.get(targetTeamIdx)) {
              // Add scores together (merge)
              const targetScore = targetTeamScores.get(targetTeamIdx);
              const newScore = (targetScore.get('score') || 0) + (sourceScore.get('score') || 0);
              const newExtra = (targetScore.get('extraCredit') || 0) + (sourceScore.get('extraCredit') || 0);
              targetScore.set('score', newScore);
              targetScore.set('extraCredit', newExtra);
            }
          }
        }
      }
    }

    // Add history entry
    add_history_entry('edit_log.actions.merge', 'edit_log.details_templates.merged_sessions', { 
      source: sourceSession.get('name'),
      target: targetSession.get('name')
    });

  }, 'local');
}
