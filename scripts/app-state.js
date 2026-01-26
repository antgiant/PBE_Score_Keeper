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
  add_global_history_entry('history_global.actions.create_session', 'history_global.details_templates.created_session', { name: sessionName });

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

  // Notify sync module before switching sessions
  if (typeof handleSessionSwitch === 'function' && oldSessionId !== sessionId) {
    handleSessionSwitch(sessionId);
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
 * @returns {Promise<boolean>} True if deletion successful
 */
async function deleteSession(sessionIdOrIndex, skipConfirm) {
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

  // Log in global history
  add_global_history_entry('history_global.actions.delete_session', 'history_global.details_templates.deleted_session', { name: sessionName });

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
    // Extract data from both sessions
    const sourceData = extractSessionDataForMerge(sourceId);
    const targetData = extractSessionDataForMerge(targetId);

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

    // Delete the source session after successful merge
    await deleteSession(sourceId, true); // Skip confirm since user already initiated merge

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

  const duplicateGroups = findDuplicateSessionGroups();
  button.style.display = duplicateGroups.length > 0 ? 'inline-block' : 'none';
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

  // Track merge results for summary
  const mergeResults = [];

  for (let i = 0; i < duplicateGroups.length; i++) {
    const group = duplicateGroups[i];
    
    // Sort by index - use first session as target (oldest)
    group.sort((a, b) => a.index - b.index);
    const target = group[0];
    const mergedSources = [];

    // Merge all others into target
    for (let j = 1; j < group.length; j++) {
      const source = group[j];
      try {
        // Get fresh session data since IDs may have changed after deletions
        const currentSessions = getAllSessions();
        const sourceExists = currentSessions.find(s => s.id === source.id);
        const targetExists = currentSessions.find(s => s.id === target.id);

        if (!sourceExists || !targetExists) {
          console.log('Session no longer exists, skipping');
          continue;
        }

        // Extract and compare
        const sourceData = await extractSessionDataForMerge(source.id);
        const targetData = await extractSessionDataForMerge(target.id);
        const comparison = compareSessionData(sourceData, targetData);

        // For auto-merge, we don't show the matching dialog
        // We use the auto-matched results directly
        await applySessionMerge(source.id, target.id, null);
        await deleteSession(source.id, true);
        mergedSources.push(source.name);
      } catch (error) {
        console.error('Auto merge failed for session:', source.name, error);
        // Continue with next session
      }
    }

    if (mergedSources.length > 0) {
      mergeResults.push({
        target: target.name,
        sources: mergedSources
      });
    }
  }

  // Update button visibility
  updateAutoMergeButtonVisibility();

  // Refresh display
  sync_data_to_display();

  // Show summary dialog
  showAutoMergeSummary(mergeResults);
}

/**
 * Show summary dialog after auto merge
 * @param {Array} mergeResults - Array of {target, sources} objects
 */
function showAutoMergeSummary(mergeResults) {
  // Remove any existing dialog
  const existing = document.getElementById('merge-summary-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'merge-summary-overlay';
  overlay.className = 'sync-dialog-overlay';
  overlay.style.display = 'flex';

  const totalMerged = mergeResults.reduce((sum, r) => sum + r.sources.length, 0);

  let tableRows = '';
  for (const result of mergeResults) {
    for (let i = 0; i < result.sources.length; i++) {
      tableRows += `<tr>
        <td>${HTMLescape(result.sources[i])}</td>
        <td>→</td>
        <td>${HTMLescape(result.target)}</td>
      </tr>`;
    }
  }

  const content = mergeResults.length > 0 ? `
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
        ${tableRows}
      </tbody>
    </table>
  ` : `<p>${t('merge.auto_merge_no_duplicates')}</p>`;

  overlay.innerHTML = `
    <div class="sync-dialog" role="dialog" aria-modal="true" aria-labelledby="merge-summary-title">
      <h2 id="merge-summary-title">${t('merge.auto_merge_complete_title')}</h2>
      ${content}
      <div class="sync-dialog-buttons">
        <button type="button" id="merge-summary-ok" class="sync-dialog-btn sync-dialog-btn-primary">${t('buttons.ok')}</button>
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
async function waitForSessionData(sessionDoc, maxWait = 2000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWait) {
    const session = sessionDoc.getMap('session');
    if (session && session.get('teams') && session.get('blocks') && session.get('questions')) {
      return true;
    }
    // Wait 50ms and try again
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
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
    throw new Error('Source session data not available');
  }
  if (!targetReady) {
    throw new Error('Target session data not available');
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
    add_history_entry('history.actions.merge', 'history.details_templates.merged_sessions', { 
      source: sourceSession.get('name'),
      target: targetSession.get('name')
    });

  }, 'local');
}
