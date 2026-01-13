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
          
          // Set up history listener for this session
          if (typeof setupSessionHistoryListener === 'function') {
            setupSessionHistoryListener(sessionId);
          }
          
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
  var formattedDate = (typeof format_date === 'function') ? format_date(d) : d.toLocaleString();
  var sessionName = (typeof t === 'function') ? t('defaults.session_name', { date: formattedDate }) : 'Session ' + formattedDate;

  // Initialize global doc structure
  getGlobalDoc().transact(function() {
    const meta = getGlobalDoc().getMap('meta');
    meta.set('dataVersion', 3.0);
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
  
  sessionDoc.transact(function() {
    const session = sessionDoc.getMap('session');
    session.set('id', sessionId);
    session.set('name', sessionName);
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
    team1.set('name', (typeof t === 'function') ? t('defaults.team_name', { number: 1 }) : 'Team 1');
    teams.push([team1]);
    session.set('teams', teams);

    // Blocks
    const blocks = new Y.Array();
    const block0 = new Y.Map();
    block0.set('name', (typeof t === 'function') ? t('defaults.no_block') : 'No Block/Group');
    blocks.push([block0]);
    const block1 = new Y.Map();
    block1.set('name', (typeof t === 'function') ? t('defaults.block_name', { number: 1 }) : 'Block/Group 1');
    blocks.push([block1]);
    session.set('blocks', blocks);

    // Questions
    const questions = new Y.Array();
    questions.push([null]); // Placeholder at index 0

    const question1 = new Y.Map();
    question1.set('name', (typeof t === 'function') ? t('defaults.question_name', { number: 1 }) : 'Question 1');
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

  // Log creation in global history
  const initSessionName = (typeof t === 'function') ? t('defaults.session_name', { date: date }) : 'Session ' + date;
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
    
    // After migration, switch to new database key and clean up old one
    await switch_to_new_database_key();
  }

  // Load v3.0 format
  const currentSessionId = meta.get('currentSession');
  
  // Ensure session doc is loaded
  await initSessionDoc(currentSessionId);
  DocManager.setActiveSession(currentSessionId);
  console.log('Loaded from Yjs v3.0, current session:', currentSessionId);
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
 * Get team names for current session
 * @returns {Array<string>} Array of team names (index 0 is empty string)
 */
function get_team_names() {
  const team1Text = (typeof t === 'function') ? t('defaults.team_name', {number: 1}) : 'Team 1';
  const session = get_current_session();
  if (!session) return ['', team1Text];
  
  const teams = session.get('teams');
  if (!teams) return ['', team1Text];
  
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
  const noBlockText = (typeof t === 'function') ? t('defaults.no_block') : 'No Block/Group';
  const block1Text = (typeof t === 'function') ? t('defaults.block_name', {number: 1}) : 'Block/Group 1';
  const session = get_current_session();
  if (!session) return [noBlockText, block1Text];
  
  const blocks = session.get('blocks');
  if (!blocks) return [noBlockText, block1Text];
  
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
  const question1Text = (typeof t === 'function') ? t('defaults.question_name', {number: 1}) : 'Question 1';
  const session = get_current_session();
  if (!session) return ['', question1Text];
  
  const questions = session.get('questions');
  if (!questions) return ['', question1Text];
  
  const names = [];
  for (let i = 0; i < questions.length; i++) {
    const question = questions.get(i);
    names.push(question ? question.get('name') : '');
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
