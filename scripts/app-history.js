// History Viewer for PBE Score Keeper
// Displays a log of all changes made during the current session

/**
 * Initialize the history viewer
 * Sets up the display and populates with current history
 */
function initialize_history_viewer() {
  if (!ydoc) {
    console.warn('Yjs document not initialized, history viewer unavailable');
    return;
  }

  // Set up listener for document updates to refresh history display
  ydoc.on('update', function(_update, origin) {
    // Refresh on local changes or history logging
    if (origin === 'local' || origin === 'history') {
      refresh_history_display();
    }
  });

  // Populate initial history
  refresh_history_display();
}

/**
 * Refresh the history display by reading from the persistent Yjs history log
 */
function refresh_history_display() {
  if (!ydoc) return;

  const historyList = document.getElementById('history_list');
  if (!historyList) return;

  // Clear existing history
  historyList.innerHTML = '';

  // Get the current session to filter history
  const currentSession = get_current_session();
  if (!currentSession) {
    historyList.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #666;">No session found</td></tr>';
    return;
  }

  // Get the history log from Yjs (stored per session)
  const historyLog = currentSession.get('historyLog');

  if (!historyLog || historyLog.length === 0) {
    historyList.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #666;">No changes recorded yet. Make some changes to see them here!</td></tr>';
    return;
  }

  // Display entries (most recent first)
  for (let i = historyLog.length - 1; i >= 0; i--) {
    const entry = historyLog.get(i);
    const row = document.createElement('tr');

    const timestamp = entry.get('timestamp');
    const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString() : 'Unknown';
    const sessionName = entry.get('session') || 'Unknown';
    const action = entry.get('action') || 'Change';
    const details = entry.get('details') || '';

    row.innerHTML =
      '<td>' + timeStr + '</td>' +
      '<td>' + HTMLescape(sessionName) + '</td>' +
      '<td>' + HTMLescape(action) + '</td>' +
      '<td>' + HTMLescape(details) + '</td>';

    historyList.appendChild(row);
  }
}

/**
 * Add a history entry to the current session's history log
 * @param {string} action - The action performed (e.g., "Rename Team")
 * @param {string} details - Details about the action
 * @param {boolean} isUndone - Whether this entry has been undone (default: false)
 */
function add_history_entry(action, details, isUndone) {
  const session = get_current_session();
  if (!session) return;

  // Get or create the history log for this session
  let historyLog = session.get('historyLog');
  if (!historyLog) {
    historyLog = new Y.Array();
    session.set('historyLog', historyLog);
  }

  // Create a new history entry
  const entry = new Y.Map();
  entry.set('timestamp', Date.now());
  entry.set('session', session.get('name'));
  entry.set('action', action);
  entry.set('details', details);
  entry.set('undone', isUndone || false);

  // Add to history log (will be persisted automatically by Yjs)
  historyLog.push([entry]);
}

/**
 * Get description of what was undone for logging
 * @returns {string} Description of the most recent non-undo/redo action
 */
function get_last_action_description() {
  const session = get_current_session();
  if (!session) return 'an action';

  const historyLog = session.get('historyLog');
  if (!historyLog) return 'an action';

  // Find the most recent entry that isn't an undo or redo
  for (let i = historyLog.length - 1; i >= 0; i--) {
    const entry = historyLog.get(i);
    const action = entry.get('action');
    if (action !== 'Undo' && action !== 'Redo') {
      const details = entry.get('details') || '';
      return action + (details ? ': ' + details : '');
    }
  }

  return 'an action';
}

