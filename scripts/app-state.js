// State Management for PBE Score Keeper
// Multi-doc architecture: Global doc for metadata + Per-session Y.Docs

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
      
      // Repair sessionNames cache if needed (for users who migrated before fix)
      if (is_multi_doc()) {
        const wasRepaired = await repairSessionNamesCache();
        
        // If cache was repaired, update session name display immediately
        if (wasRepaired) {
          // Wait for DOM to be ready and update the session name
          const updateSessionName = function() {
            if (typeof $ === 'undefined' || typeof get_session_names !== 'function') {
              setTimeout(updateSessionName, 50);
              return;
            }
            const session_names = get_session_names();
            const currentSessionIndex = get_current_session_index();
            $("#session_name").text(session_names[currentSessionIndex]);
          };
          updateSessionName();
        }
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
      await migrate_localStorage_to_v3(data_version);
      await load_from_yjs();
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
        session.set('currentQuestion', Number(JSON.parse(upgradedData['session_' + s + '_current_question'])));

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
    session.set('currentQuestion', 1);

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

  // Log in global history
  add_global_history_entry(t('history_global.actions.create_session'), t('history_global.details_templates.created_session', { name: sessionName }));

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

  // Load session doc if not already loaded
  await initSessionDoc(sessionId);

  // Update global doc
  getGlobalDoc().transact(function() {
    meta.set('currentSession', sessionId);
  }, 'local');

  // Set active session
  DocManager.setActiveSession(sessionId);

  // Log in global history
  const session = get_current_session();
  const sessionName = session ? session.get('name') : 'Unknown';
  add_global_history_entry(t('history_global.actions.switch_session'), t('history_global.details_templates.switched_session', { name: sessionName }));

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
 * @returns {Promise<boolean>} True if deletion successful
 */
async function deleteSession(sessionIdOrIndex) {
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

  if (!window.confirm(t('confirm.delete_session', { name: sessionName }))) {
    return false;
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

  // Switch to new current if needed
  if (currentSessionId === sessionId) {
    await initSessionDoc(newCurrentId);
    DocManager.setActiveSession(newCurrentId);
  }

  // Log in global history
  add_global_history_entry(t('history_global.actions.delete_session'), t('history_global.details_templates.deleted_session', { name: sessionName }));

  alert(t('alerts.deleted'));
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


