// Yjs CRDT Implementation for PBE Score Keeper
// This file handles Yjs initialization, IndexedDB persistence, and undo/redo functionality

// DocManager - Central manager for all Y.Doc instances (single-doc or multi-doc)
// For now, operates in single-doc mode; refactored for multi-doc in future phases
var DocManager = {
  globalDoc: null,
  globalProvider: null,
  globalUndoManager: null,
  sessionDocs: new Map(),
  sessionProviders: new Map(),
  sessionUndoManagers: new Map(),
  activeSessionId: null,
  yjsReady: false,

  /**
   * Get the currently active session doc
   * In single-doc mode: returns the global doc (sessions array accessor)
   * @returns {Y.Doc} Current session doc or null
   */
  getActiveSessionDoc: function() {
    return this.globalDoc;
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
   * @returns {Y.UndoManager} Current session undo manager
   */
  getActiveSessionUndoManager: function() {
    return this.globalUndoManager;
  },

  /**
   * Get global undo manager
   * @returns {Y.UndoManager} Global undo manager
   */
  getGlobalUndoManager: function() {
    return this.globalUndoManager;
  }
};

// Legacy global variables - kept for compatibility during transition
// These are now backed by DocManager
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
 * [FUTURE: Multi-doc] Initialize a session-specific Y.Doc
 * For now, this is a placeholder that returns the global doc
 * @param {string} sessionId - UUID of the session
 * @returns {Y.Doc} The session Y.Doc
 */
async function initSessionDoc(sessionId) {
  // Future: Create separate doc for each session
  // For now: return global doc (single-doc mode)
  return Promise.resolve(getGlobalDoc());
}

/**
 * [FUTURE: Multi-doc] Get or load a session-specific doc
 * @param {string} sessionId - UUID of the session
 * @returns {Y.Doc} The session Y.Doc
 */
function getSessionDoc(sessionId) {
  // Future: retrieve from sessionDocs map
  // For now: return global doc (single-doc mode)
  return getGlobalDoc();
}

/**
 * [FUTURE: Multi-doc] Destroy a session doc and clean up resources
 * @param {string} sessionId - UUID of the session
 * @returns {Promise<void>}
 */
async function destroySessionDoc(sessionId) {
  // Future: clean up session-specific doc
  // For now: no-op in single-doc mode
  return Promise.resolve();
}

/**
 * [FUTURE: Multi-doc] Clean up all session docs
 * Used mainly for testing
 * @returns {Promise<void>}
 */
async function destroyAllDocs() {
  // Future: destroy all session docs
  // For now: no-op in single-doc mode
  return Promise.resolve();
}

/**
 * [FUTURE: Multi-doc] Get or create an undo manager for a specific session
 * @param {string} sessionId - UUID of the session
 * @returns {Y.UndoManager} UndoManager for the session
 */
function getOrCreateSessionUndoManager(sessionId) {
  // Future: retrieve or create per-session undo manager
  // For now: return global undo manager (single-doc mode)
  return getGlobalUndoManager();
}

/**
 * [FUTURE: Multi-doc] Destroy an undo manager for a session
 * @param {string} sessionId - UUID of the session
 */
function destroySessionUndoManager(sessionId) {
  // Future: clean up session-specific undo manager
  // For now: no-op in single-doc mode
}


function initialize_yjs() {
  // Check if IndexedDB is available
  if (!window.indexedDB) {
    console.warn('IndexedDB not available. Falling back to localStorage.');
    return false;
  }

  try {
    // Create Yjs document
    setYdoc(new Y.Doc());

    // Setup IndexedDB persistence
    setYProvider(new IndexeddbPersistence('pbe-score-keeper', getGlobalDoc()));

    yProvider.on('synced', function() {
      console.log('Yjs synced with IndexedDB');
      setYjsReady(true);

      // Check if document is empty (first run or migration needed)
      const meta = getGlobalDoc().getMap('meta');
      if (meta.size === 0) {
        console.log('Empty Yjs document detected');
        // Will be handled by initialize_state()
      } else {
        console.log('Existing Yjs data found, version:', meta.get('dataVersion'));
      }
    });

    // Setup undo manager (will be fully configured after data is loaded)
    setYUndoManager(new Y.UndoManager([
      getGlobalDoc().getMap('meta'),
      getGlobalDoc().getArray('sessions')
    ], {
      trackedOrigins: new Set(['local']),
      captureTimeout: 500  // Group rapid changes within 500ms
    }));

    // Listen for undo/redo stack changes to update button states
    yUndoManager.on('stack-item-added', update_undo_redo_buttons);
    yUndoManager.on('stack-item-popped', update_undo_redo_buttons);
    yUndoManager.on('stack-cleared', update_undo_redo_buttons);

    // Listen for remote changes (for future multi-device sync)
    getGlobalDoc().on('update', function(updateData, origin) {
      if (origin !== 'local' && origin !== 'migration' && origin !== 'import') {
        // Remote change detected, refresh display
        console.log('Remote update detected, refreshing display');
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
 * Check if Yjs has data (version 2.0)
 * @returns {boolean} True if Yjs data exists
 */
function has_yjs_data() {
  if (!yjsReady || !getGlobalDoc()) return false;
  const meta = getGlobalDoc().getMap('meta');
  return meta.size > 0 && meta.get('dataVersion') === 2.0;
}

/**
 * Initialize new Yjs state for first-time users
 * Creates the initial data structure in Yjs format
 */
function initialize_new_yjs_state() {
  if (!getGlobalDoc()) {
    console.error('Yjs not initialized');
    return;
  }

  var d = new Date();
  var date = d.toLocaleString();

  getGlobalDoc().transact(function() {
    // Set metadata
    const meta = getGlobalDoc().getMap('meta');
    meta.set('dataVersion', 2.0);
    meta.set('currentSession', 1);

    // Create sessions array
    const sessions = getGlobalDoc().getArray('sessions');
    sessions.push([null]); // Placeholder at index 0

    // Create first session
    const session = new Y.Map();
    session.set('name', 'Session ' + date);

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

    // Add session to sessions array
    sessions.push([session]);

  }, 'init');

  console.log('Initialized new Yjs state');
}

/**
 * Load global variables from Yjs state
 * Sets current_session variable used throughout the app
 */
function load_from_yjs() {
  if (!has_yjs_data()) {
    console.error('No Yjs data to load');
    return;
  }

  const meta = getGlobalDoc().getMap('meta');
  // Set global current_session variable (declared in app-globals.js)
  if (typeof current_session !== 'undefined') {
    current_session = meta.get('currentSession');
  } else {
    // Fallback: create global if not defined
    window.current_session = meta.get('currentSession');
  }

  console.log('Loaded from Yjs, current session:', current_session);
}

/**
 * Perform undo operation
 */
function perform_undo() {
  if (yUndoManager && yUndoManager.canUndo()) {
    // Get description of what we're about to undo before undoing it
    const actionDescription = get_last_action_description();

    yUndoManager.undo();

    // Log the undo action with 'history' origin so it doesn't get tracked by UndoManager
    // This prevents clearing the redo stack
    getGlobalDoc().transact(() => {
      add_history_entry('Undo', 'Undid: ' + actionDescription);
    }, 'history');

    sync_data_to_display();
    refresh_history_display();
  }
}

/**
 * Perform redo operation
 */
function perform_redo() {
  if (yUndoManager && yUndoManager.canRedo()) {
    yUndoManager.redo();

    // Log the redo action with 'history' origin so it doesn't get tracked by UndoManager
    getGlobalDoc().transact(() => {
      add_history_entry('Redo', 'Redid the previously undone action');
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

  if (undoButton) {
    undoButton.disabled = !yUndoManager || !yUndoManager.canUndo();
  }
  if (redoButton) {
    redoButton.disabled = !yUndoManager || !yUndoManager.canRedo();
  }
}

/**
 * Get value from Yjs structure using dot notation path
 * @param {string} path - Dot notation path (e.g., "sessions.1.teams.2.name")
 * @returns {any} The value at the path, or undefined if not found
 */
function get_yjs_value(path) {
  if (!getGlobalDoc()) return undefined;

  const parts = path.split('.');
  let current = getGlobalDoc();

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part === 'meta' || part === 'sessions') {
      current = i === 0 ? (part === 'meta' ? getGlobalDoc().getMap(part) : getGlobalDoc().getArray(part)) : current.get(part);
    } else if (!isNaN(part)) {
      const index = Number(part);
      current = current.get(index);
    } else {
      current = current.get(part);
    }

    if (current === undefined || current === null) {
      return undefined;
    }
  }

  return current;
}

/**
 * Set value in Yjs structure using dot notation path
 * @param {string} path - Dot notation path (e.g., "sessions.1.teams.2.name")
 * @param {any} value - The value to set
 * @param {string} origin - Origin tag for the transaction (default: 'local')
 */
function set_yjs_value(path, value, origin = 'local') {
  if (!getGlobalDoc()) {
    console.error('Yjs not initialized');
    return;
  }

  const parts = path.split('.');
  const lastPart = parts.pop();

  getGlobalDoc().transact(function() {
    // Navigate to parent
    let current = getGlobalDoc();
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (part === 'meta' || part === 'sessions') {
        current = i === 0 ? (part === 'meta' ? getGlobalDoc().getMap(part) : getGlobalDoc().getArray(part)) : current.get(part);
      } else if (!isNaN(part)) {
        const index = Number(part);
        current = current.get(index);
      } else {
        current = current.get(part);
      }

      if (!current) {
        console.error('Path not found:', parts.slice(0, i + 1).join('.'));
        return;
      }
    }

    // Set value at final key
    if (!isNaN(lastPart)) {
      // Array index - not supported for setting individual indices
      console.error('Cannot set array index directly, use array operations');
      return;
    } else {
      current.set(lastPart, value);
    }
  }, origin);
}

/**
 * Get current session object from Yjs
 * @returns {Y.Map} Current session map
 */
function get_current_session() {
  if (!getGlobalDoc()) return null;
  const sessions = getGlobalDoc().getArray('sessions');
  const meta = getGlobalDoc().getMap('meta');
  const currentSessionNum = meta.get('currentSession');
  return sessions.get(currentSessionNum);
}

/**
 * Get session names array from Yjs
 * @returns {Array<string>} Array of session names (index 0 is empty string)
 */
function get_session_names() {
  if (!getGlobalDoc()) return ['', ''];
  const sessions = getGlobalDoc().getArray('sessions');
  const names = [''];  // Index 0 is empty
  for (let i = 1; i < sessions.length; i++) {
    const session = sessions.get(i);
    names.push(session ? session.get('name') : '');
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
  const names = [];
  for (let i = 0; i < teams.length; i++) {
    const team = teams.get(i);
    names.push(team ? team.get('name') : '');
  }
  return names;
}

/**
 * Get block names for current session
 * @returns {Array<string>} Array of block names (index 0 is valid)
 */
function get_block_names() {
  const session = get_current_session();
  if (!session) return ['No Block/Group', 'Block/Group 1'];
  const blocks = session.get('blocks');
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
  const names = [];
  for (let i = 0; i < questions.length; i++) {
    const question = questions.get(i);
    names.push(question ? question.get('name') : '');
  }
  return names;
}
