// WebRTC Sync Module for PBE Score Keeper
// Provides peer-to-peer real-time synchronization using y-webrtc

/**
 * Maximum length for display names (enforced in UI and validation)
 */
var MAX_DISPLAY_NAME_LENGTH = 30;

/**
 * Error types for sync operations
 */
var SyncError = {
  CONNECTION_FAILED: 'connection_failed',
  TIMEOUT: 'timeout',
  INVALID_ROOM: 'invalid_room',
  SESSION_NOT_FOUND: 'session_not_found',
  NETWORK_ERROR: 'network_error',
  PASSWORD_REQUIRED: 'password_required',
  PASSWORD_INCORRECT: 'password_incorrect',
  SERVER_DOWN: 'server_down'
};

/**
 * SyncManager - Central controller for WebRTC synchronization
 * 
 * States: 'offline' | 'connecting' | 'connected' | 'error'
 */
var SyncManager = {
  // Connection state
  state: 'offline',
  roomCode: null,
  displayName: null,
  password: null,
  syncedSessionId: null,
  provider: null,
  awareness: null,
  previousFocus: null,
  sessionUpdateListener: null,  // Reference to session doc update listener
  
  // Peers tracking
  peers: new Map(),  // peerId -> { displayName, color, lastSeen }
  
  // Callbacks
  onStateChange: null,
  onPeersChange: null,
  onError: null,
  
  // Retry state
  retryAttempt: 0,
  retryTimeout: null,
  
  // Configuration
  config: {
    signalingServers: [
      'wss://y-webrtc-pbe.fly.dev',           // Primary (dedicated)
      'wss://signaling.yjs.dev',              // Backup 1 (official Yjs server)
      'wss://y-webrtc-signaling-us.herokuapp.com',  // Backup 2 (Heroku US - may be down)
      'wss://y-webrtc-signaling-eu.herokuapp.com'   // Backup 3 (Heroku EU - may be down)
    ],
    minSignalingServers: 3,  // Minimum required for reliability
    roomPrefix: 'pbe-sync-',
    reconnectInterval: 5000,
    maxReconnectAttempts: 10
  }
};

/**
 * Get saved display name from global Yjs doc
 * @returns {string|null} Saved display name or null
 */
function getSavedDisplayName() {
  var globalDoc = getGlobalDoc();
  if (!globalDoc) return null;
  return globalDoc.getMap('meta').get('syncDisplayName') || null;
}

/**
 * Save display name to global Yjs doc
 * @param {string} name - Display name to save
 */
function saveDisplayName(name) {
  var globalDoc = getGlobalDoc();
  if (!globalDoc) return;
  globalDoc.getMap('meta').set('syncDisplayName', name);
}

/**
 * Get sync room code from a session doc
 * @param {string} sessionId - Session UUID (optional, uses current if not provided)
 * @returns {string|null} Room code or null if not synced
 */
function getSessionSyncRoom(sessionId) {
  var doc = sessionId ? getSessionDoc(sessionId) : getActiveSessionDoc();
  if (!doc) return null;
  
  // Config is nested inside session map, not at doc root
  var session = doc.getMap('session');
  if (!session) {
    return null;
  }
  
  var config = session.get('config');
  if (config) {
    var room = config.get('syncRoom');
    return room || null;
  }
  return null;
}

/**
 * Get sync status for all sessions (for dropdown display)
 * @returns {Object} Map of session index (1-based) to boolean (has syncRoom)
 */
function getSessionSyncStatuses() {
  var statuses = {};
  var sessionOrder = typeof get_session_order === 'function' ? get_session_order() : [];
  
  for (var i = 0; i < sessionOrder.length; i++) {
    var sessionId = sessionOrder[i];
    var syncRoom = getSessionSyncRoom(sessionId);
    statuses[i + 1] = !!syncRoom;  // 1-based index
  }
  
  return statuses;
}

/**
 * Save sync room code to session doc
 * @param {string} roomCode - Room code to save (null to clear)
 * @param {string} sessionId - Session UUID (optional, uses current if not provided)
 */
function saveSessionSyncRoom(roomCode, sessionId) {
  var doc = sessionId ? getSessionDoc(sessionId) : getActiveSessionDoc();
  if (!doc) return;
  
  // Config is nested inside session map, not at doc root
  var session = doc.getMap('session');
  if (!session) {
    return;
  }
  
  var config = session.get('config');
  if (config) {
    if (roomCode) {
      config.set('syncRoom', roomCode);
    } else {
      config.delete('syncRoom');
    }
  }
}

/**
 * Initialize the sync manager
 * Call once on app startup
 */
function initSyncManager() {
  // Load saved display name
  var savedName = getSavedDisplayName();
  if (savedName) {
    SyncManager.displayName = savedName;
  }
  
  // Set up event handlers
  setupVisibilityHandler();
  setupNetworkHandlers();
  
  // Attempt auto-reconnect after ensuring session doc is ready
  waitForSessionDocAndReconnect();
  
  console.log('SyncManager initialized');
}

/**
 * Wait for session doc to be synced from IndexedDB, then try auto-reconnect
 * Polls every 500ms up to 10 times (5 seconds max)
 */
function waitForSessionDocAndReconnect() {
  var attempts = 0;
  var maxAttempts = 10;
  
  function checkAndReconnect() {
    attempts++;
    
    // Check if we have an active session and its doc is loaded
    var sessionId = typeof get_current_session_id === 'function' ? get_current_session_id() : null;
    console.log('waitForSessionDocAndReconnect - attempt', attempts, 'sessionId:', sessionId);
    
    if (!sessionId) {
      if (attempts < maxAttempts) {
        setTimeout(checkAndReconnect, 500);
      } else {
        console.log('waitForSessionDocAndReconnect - gave up waiting for session');
      }
      return;
    }
    
    // Check if the session provider is synced
    var provider = DocManager.sessionProviders ? DocManager.sessionProviders.get(sessionId) : null;
    var isSynced = provider ? provider.synced : false;
    console.log('waitForSessionDocAndReconnect - provider:', provider ? 'exists' : 'null', 'synced:', isSynced);
    
    if (isSynced) {
      // Provider is synced, try auto-reconnect
      tryAutoReconnectForCurrentSession();
    } else if (attempts < maxAttempts) {
      // Not synced yet, try again
      setTimeout(checkAndReconnect, 500);
    } else {
      // Give up after max attempts, try anyway
      console.log('waitForSessionDocAndReconnect - max attempts reached, trying anyway');
      tryAutoReconnectForCurrentSession();
    }
  }
  
  // Start checking after a short initial delay
  setTimeout(checkAndReconnect, 500);
}

/**
 * Try to auto-reconnect for the current session if it has sync info
 * @returns {Promise<boolean>} True if reconnection successful
 */
async function tryAutoReconnectForCurrentSession() {
  var savedName = getSavedDisplayName();
  console.log('tryAutoReconnectForCurrentSession - savedName:', savedName);
  if (!savedName) {
    console.log('No saved display name, skipping auto-reconnect');
    return false;
  }
  
  // Check current session for sync room
  var sessionRoom = getSessionSyncRoom();
  console.log('tryAutoReconnectForCurrentSession - sessionRoom:', sessionRoom);
  if (!sessionRoom) {
    console.log('No sync room saved in session, skipping auto-reconnect');
    return false;
  }
  
  console.log('Auto-reconnecting to room from session:', sessionRoom);
  
  try {
    // Use 'merge' join choice since this is the original session
    await startSync(savedName, sessionRoom, null, 'merge');
    showToast(t('sync.auto_reconnected', { code: sessionRoom }));
    return true;
  } catch (error) {
    console.warn('Auto-reconnect failed:', error);
    return false;
  }
}

/**
 * Generate a 6-character room code
 * @returns {string} Room code (uppercase alphanumeric)
 */
function generateRoomCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous: 0,O,1,I
  var code = '';
  for (var i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Validate room code format
 * @param {string} code - Room code to validate
 * @returns {boolean} True if valid format
 */
function isValidRoomCode(code) {
  if (typeof code !== 'string') return false;
  return /^[A-Z0-9]{6}$/i.test(code.trim());
}

/**
 * Get current sync state
 * @returns {string} Current state: 'offline' | 'connecting' | 'connected' | 'error'
 */
function getSyncState() {
  return SyncManager.state;
}

/**
 * Get current room code
 * @returns {string|null} Room code or null if not in a room
 */
function getSyncRoomCode() {
  return SyncManager.roomCode;
}

/**
 * Get current display name
 * @returns {string|null} Display name or null if not set
 */
function getSyncDisplayName() {
  return SyncManager.displayName;
}

/**
 * Get list of connected peers
 * @returns {Array} Array of { peerId, displayName, color }
 */
function getSyncPeers() {
  return Array.from(SyncManager.peers.values());
}

/**
 * Get count of connected peers (including self)
 * @returns {number} Peer count
 */
function getSyncPeerCount() {
  return SyncManager.peers.size + 1; // +1 for self
}

/**
 * Start sync - connect to or create a room
 * @param {string} displayName - User's display name
 * @param {string} [roomCode] - Room to join, or null to create new
 * @param {string} [password] - Optional room password for encryption
 * @param {string} [joinChoice] - 'create' | 'new' | 'merge' (how to handle joining)
 * @returns {Promise<string>} Room code on success
 */
async function startSync(displayName, roomCode, password, joinChoice) {
  if (!displayName || displayName.trim().length === 0) {
    throw new Error('Display name is required');
  }
  
  // Enforce max display name length (truncate if too long)
  displayName = displayName.trim().substring(0, MAX_DISPLAY_NAME_LENGTH);
  
  // Validate room code if joining
  if (roomCode && !isValidRoomCode(roomCode)) {
    throw new Error('Invalid room code');
  }
  
  // Generate room code if creating
  var finalRoomCode = roomCode ? roomCode.toUpperCase() : generateRoomCode();
  
  // Handle join choice - create new session or merge into current
  var sessionDoc;
  if (joinChoice === 'new') {
    // Create a new session for this sync (uses default name)
    await createNewSession();
    sessionDoc = getActiveSessionDoc();
  } else {
    // Use current session (for 'create' or 'merge')
    sessionDoc = getActiveSessionDoc();
  }
  
  if (!sessionDoc) {
    throw new Error('No active session');
  }
  
  // Update state
  SyncManager.state = 'connecting';
  SyncManager.displayName = displayName;
  SyncManager.roomCode = finalRoomCode;
  SyncManager.password = password || null;
  SyncManager.syncedSessionId = typeof get_current_session_id === 'function' ? get_current_session_id() : null;
  
  // Persist display name to global Yjs doc
  saveDisplayName(displayName);
  // Save room code to session doc for auto-reconnect
  saveSessionSyncRoom(finalRoomCode);
  
  updateSyncUI();
  
  try {
    // Check if WebrtcProvider is available
    if (typeof WebrtcProvider === 'undefined') {
      throw new Error('WebrtcProvider not available - rebuild yjs-bundle.min.js with y-webrtc');
    }
    
    // Create WebRTC provider
    // Room name is just the code (1 room = 1 session)
    var roomName = SyncManager.config.roomPrefix + finalRoomCode;
    
    SyncManager.provider = new WebrtcProvider(roomName, sessionDoc, {
      signaling: SyncManager.config.signalingServers,
      password: password || null,  // Used as encryption key if provided
      maxConns: 20,
      filterBcConns: true,
      peerOpts: {}
    });
    
    // Set up awareness
    setupAwareness(SyncManager.provider.awareness);
    
    // Listen for remote updates on session doc to refresh display
    SyncManager.sessionUpdateListener = function(updateData, origin) {
      // Only refresh on remote updates (not local changes)
      // WebRTC provider uses 'null' or provider instance as origin for remote updates
      if (origin !== 'local' && origin !== sessionDoc.clientID) {
        console.log('Remote update on session doc, refreshing display');
        if (typeof sync_data_to_display === 'function') {
          sync_data_to_display();
        }
      }
    };
    sessionDoc.on('update', SyncManager.sessionUpdateListener);
    
    // Listen for connection events
    SyncManager.provider.on('status', function(event) {
      console.log('WebRTC status:', event.status);
      
      if (event.status === 'connected') {
        SyncManager.state = 'connected';
        updateSyncUI();
        
        if (SyncManager.onStateChange) {
          SyncManager.onStateChange('connected');
        }
      }
    });
    
    SyncManager.provider.on('synced', function(event) {
      console.log('WebRTC synced:', event.synced);
      
      // This is where we'd trigger the name matching dialog
      // if there are differences between local and remote data
      if (event.synced && SyncManager.state === 'connecting') {
        checkForNameMatching();
      }
    });
    
    SyncManager.provider.on('peers', function(event) {
      console.log('WebRTC peers changed:', event.webrtcPeers);
      updatePeersFromAwareness();
      updateSyncUI();
    });
    
    // Wait for initial connection (with timeout)
    await waitForConnection(10000);
    
    SyncManager.state = 'connected';
    updateSyncUI();
    
    if (SyncManager.onStateChange) {
      SyncManager.onStateChange('connected');
    }
    
    return finalRoomCode;
    
  } catch (error) {
    console.error('Failed to start sync:', error);
    SyncManager.state = 'error';
    updateSyncUI();
    
    if (SyncManager.onError) {
      SyncManager.onError(error);
    }
    
    throw error;
  }
}

/**
 * Wait for WebRTC connection with timeout
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
function waitForConnection(timeout) {
  return new Promise(function(resolve, reject) {
    var startTime = Date.now();
    
    var checkConnection = function() {
      if (SyncManager.provider && SyncManager.provider.connected) {
        resolve();
        return;
      }
      
      if (Date.now() - startTime > timeout) {
        reject(new Error('Connection timeout'));
        return;
      }
      
      setTimeout(checkConnection, 100);
    };
    
    checkConnection();
  });
}

/**
 * Stop sync - disconnect from current room
 * @param {boolean} clearSessionRoom - Whether to clear the room code from session doc (default true)
 */
function stopSync(clearSessionRoom) {
  // Default to true if not specified
  if (clearSessionRoom === undefined) {
    clearSessionRoom = true;
  }
  
  // Remove session doc update listener
  if (SyncManager.sessionUpdateListener && SyncManager.syncedSessionId) {
    var sessionDoc = getSessionDoc(SyncManager.syncedSessionId);
    if (sessionDoc) {
      sessionDoc.off('update', SyncManager.sessionUpdateListener);
    }
    SyncManager.sessionUpdateListener = null;
  }
  
  // Clear sync room from session doc if requested
  if (clearSessionRoom && SyncManager.syncedSessionId) {
    saveSessionSyncRoom(null, SyncManager.syncedSessionId);
  }
  
  // Destroy WebRTC provider
  if (SyncManager.provider) {
    SyncManager.provider.destroy();
    SyncManager.provider = null;
  }
  
  // Clear awareness
  SyncManager.awareness = null;
  
  // Reset state
  SyncManager.state = 'offline';
  SyncManager.roomCode = null;
  SyncManager.syncedSessionId = null;
  SyncManager.peers.clear();
  
  updateSyncUI();
  
  if (SyncManager.onStateChange) {
    SyncManager.onStateChange('offline');
  }
}

/**
 * Attempt to auto-reconnect to saved room
 * Called on page load if room was saved
 * @returns {Promise<boolean>} True if reconnection successful
 * @deprecated Use tryAutoReconnectForCurrentSession instead
 */
async function autoReconnect() {
  // Delegate to session-based auto-reconnect
  return tryAutoReconnectForCurrentSession();
}

/**
 * Handle visibility change for reconnection
 */
function setupVisibilityHandler() {
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      // Page became visible again - try to reconnect if we were connected
      if (SyncManager.state === 'error' || 
          (SyncManager.roomCode && SyncManager.state === 'offline')) {
        tryAutoReconnectForCurrentSession();
      }
    }
  });
}

/**
 * Handle online/offline events
 */
function setupNetworkHandlers() {
  window.addEventListener('online', function() {
    console.log('Network online');
    if (SyncManager.roomCode && SyncManager.state !== 'connected') {
      // Clear any pending retry and attempt reconnect
      clearRetryTimeout();
      retryConnection(0);
    }
  });
  
  window.addEventListener('offline', function() {
    console.log('Network offline');
    // Provider will handle disconnection
    // Keep state so we can reconnect when online
    if (SyncManager.state === 'connected') {
      SyncManager.state = 'error';
      updateSyncUI();
      showToast(t('sync.error_network'));
      announceToScreenReader(t('sync.error_network'), 'assertive');
    }
  });
}

/**
 * Handle sync errors gracefully
 * @param {Error} error - Error object
 * @param {string} context - Where the error occurred
 */
function handleSyncError(error, context) {
  console.error('Sync error in ' + context + ':', error);
  
  SyncManager.state = 'error';
  updateSyncUI();
  
  // Determine error type and show appropriate message
  var message = t('sync.connection_failed');
  var errorType = SyncError.CONNECTION_FAILED;
  
  if (error.message.includes('timeout')) {
    message = t('sync.error_timeout');
    errorType = SyncError.TIMEOUT;
  } else if (error.message.includes('network') || !navigator.onLine) {
    message = t('sync.error_network');
    errorType = SyncError.NETWORK_ERROR;
  } else if (error.message.includes('password')) {
    message = t('sync.password_required');
    errorType = SyncError.PASSWORD_REQUIRED;
  } else if (error.message.includes('signaling') || error.message.includes('server')) {
    message = t('sync.error_server_down');
    errorType = SyncError.SERVER_DOWN;
  }
  
  // Show error to user
  showToast(message);
  announceToScreenReader(message, 'assertive');
  
  // Call error callback if set
  if (SyncManager.onError) {
    SyncManager.onError(error, context, errorType);
  }
  
  return errorType;
}

/**
 * Clear any pending retry timeout
 */
function clearRetryTimeout() {
  if (SyncManager.retryTimeout) {
    clearTimeout(SyncManager.retryTimeout);
    SyncManager.retryTimeout = null;
  }
}

/**
 * Retry connection with exponential backoff
 * @param {number} attempt - Current attempt number
 */
async function retryConnection(attempt) {
  var maxAttempts = SyncManager.config.maxReconnectAttempts;
  
  if (attempt >= maxAttempts) {
    console.log('Max reconnection attempts reached');
    SyncManager.state = 'error';
    SyncManager.retryAttempt = 0;
    updateSyncUI();
    showToast(t('sync.reconnect_failed'));
    announceToScreenReader(t('sync.reconnect_failed'), 'assertive');
    return;
  }
  
  // Calculate delay with exponential backoff (max 30 seconds)
  var delay = Math.min(1000 * Math.pow(2, attempt), 30000);
  console.log('Retry attempt ' + (attempt + 1) + ' in ' + delay + 'ms');
  
  SyncManager.retryAttempt = attempt;
  
  // Show reconnecting status
  if (attempt > 0) {
    showToast(t('sync.reconnecting'));
    announceToScreenReader(t('sync.reconnecting'));
  }
  
  SyncManager.retryTimeout = setTimeout(async function() {
    try {
      // Check if we're still offline
      if (!navigator.onLine) {
        retryConnection(attempt + 1);
        return;
      }
      
      await startSync(SyncManager.displayName, SyncManager.roomCode, SyncManager.password);
      SyncManager.retryAttempt = 0;
    } catch (error) {
      console.warn('Retry attempt ' + (attempt + 1) + ' failed:', error);
      retryConnection(attempt + 1);
    }
  }, delay);
}

/**
 * Check if name matching is needed and trigger dialog
 */
async function checkForNameMatching() {
  // Get remote state from peers
  var sessionDoc = typeof getActiveSessionDoc === 'function' ? getActiveSessionDoc() : null;
  if (!sessionDoc) return;
  
  // Check if we have any peers with data
  var peerCount = getSyncPeerCount();
  if (peerCount <= 1) {
    // We're alone, no matching needed
    return;
  }
  
  // Name matching will be implemented in Phase 4
  // For now, just log
  console.log('Connected with peers, name matching may be needed');
}

/**
 * Show the join/create room dialog
 */
function showSyncDialog() {
  // Remove any existing dialog
  var existing = document.getElementById('sync-dialog-overlay');
  if (existing) existing.remove();
  
  var isConnected = SyncManager.state === 'connected';
  
  var overlay = document.createElement('div');
  overlay.id = 'sync-dialog-overlay';
  overlay.className = 'sync-dialog-overlay';
  
  if (isConnected) {
    // Show disconnect dialog
    overlay.innerHTML = createDisconnectDialogHTML();
  } else {
    // Show connect dialog
    overlay.innerHTML = createConnectDialogHTML();
  }
  
  document.body.appendChild(overlay);
  
  // Store previously focused element
  SyncManager.previousFocus = document.activeElement;
  
  // Set up event listeners
  setupSyncDialogListeners();
  setupPasswordToggle();
  
  // Focus first input
  var firstInput = overlay.querySelector('input[type="text"]');
  if (firstInput) firstInput.focus();
  
  // Trap focus within dialog
  trapFocus(overlay);
  
  // Close on overlay click
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      closeSyncDialog();
    }
  });
  
  // Close on Escape key
  document.addEventListener('keydown', handleSyncDialogKeydown);
}

/**
 * Create HTML for connect dialog
 * @returns {string} Dialog HTML
 */
function createConnectDialogHTML() {
  var savedName = getSavedDisplayName() || '';
  
  return '<div class="sync-dialog" role="dialog" aria-labelledby="sync-dialog-title" aria-modal="true">' +
    '<h2 id="sync-dialog-title">' + t('sync.dialog_title') + '</h2>' +
    '<div id="sync-error-message"></div>' +
    '<div class="form-group">' +
      '<label for="sync-display-name">' + t('sync.display_name_label') + '</label>' +
      '<input type="text" id="sync-display-name" ' +
             'placeholder="' + t('sync.display_name_placeholder') + '" ' +
             'value="' + escapeHtml(savedName) + '" ' +
             'maxlength="' + MAX_DISPLAY_NAME_LENGTH + '" ' +
             'aria-required="true">' +
    '</div>' +
    '<fieldset class="radio-group">' +
      '<legend class="visually-hidden">' + t('sync.mode_selection') + '</legend>' +
      '<label>' +
        '<input type="radio" name="sync-mode" value="create" checked> ' +
        t('sync.create_room') +
      '</label>' +
      '<label>' +
        '<input type="radio" name="sync-mode" value="join"> ' +
        t('sync.join_room') +
      '</label>' +
    '</fieldset>' +
    '<div class="form-group" id="sync-room-code-group" style="display: none;">' +
      '<label for="sync-room-code">' + t('sync.room_code_label') + '</label>' +
      '<input type="text" id="sync-room-code" ' +
             'class="room-code-input" ' +
             'placeholder="' + t('sync.room_code_placeholder') + '" ' +
             'maxlength="6" ' +
             'autocomplete="off" ' +
             'autocorrect="off" ' +
             'autocapitalize="characters" ' +
             'aria-describedby="room-code-hint">' +
      '<span id="room-code-hint" class="hint-text">' + t('sync.room_code_hint') + '</span>' +
    '</div>' +
    '<div class="form-group checkbox-group" id="sync-password-toggle">' +
      '<label>' +
        '<input type="checkbox" id="sync-use-password"> ' +
        t('sync.use_password') +
      '</label>' +
    '</div>' +
    '<div class="form-group" id="sync-password-group" style="display: none;">' +
      '<label for="sync-password">' + t('sync.password_label') + '</label>' +
      '<input type="password" id="sync-password" ' +
             'placeholder="' + t('sync.password_placeholder') + '" ' +
             'maxlength="50" ' +
             'aria-describedby="password-hint">' +
      '<span id="password-hint" class="hint-text">' + t('sync.password_hint') + '</span>' +
    '</div>' +
    '<div class="button-row">' +
      '<button type="button" onclick="closeSyncDialog()">' + t('sync.cancel_button') + '</button>' +
      '<button type="button" onclick="handleSyncConnect()" class="primary">' + t('sync.connect_button') + '</button>' +
    '</div>' +
  '</div>';
}

/**
 * Create HTML for disconnect dialog (when already connected)
 * @returns {string} Dialog HTML
 */
function createDisconnectDialogHTML() {
  var peers = getSyncPeers();
  var peerNames = peers.map(function(p) { return p.displayName; }).join(', ');
  var passwordNote = SyncManager.password 
    ? '<p class="password-note"><span aria-hidden="true">🔒</span> ' + t('sync.share_password_note') + '</p>' 
    : '';
  
  return '<div class="sync-dialog" role="dialog" aria-labelledby="sync-dialog-title" aria-modal="true">' +
    '<h2 id="sync-dialog-title">' + t('sync.dialog_title') + '</h2>' +
    '<p>' + t('sync.status_connected') + '</p>' +
    '<p class="sync-your-name">' + t('sync.your_name_label') + ' ' +
      '<span id="sync-current-name-display"><strong>' + escapeHtml(SyncManager.displayName || '') + '</strong></span>' +
      '<button type="button" id="sync-edit-name-btn" onclick="handleEditNameClick()" class="link-button" title="' + t('sync.edit_name_title') + '">' +
        '<span aria-hidden="true">✏️</span> ' + t('sync.edit_name') +
      '</button>' +
      '<span id="sync-edit-name-container" class="sync-edit-name-container" style="display: none;">' +
        '<input type="text" id="sync-edit-name-input" maxlength="' + MAX_DISPLAY_NAME_LENGTH + '" ' +
               'aria-label="' + t('sync.display_name_label') + '">' +
        '<button type="button" onclick="handleSaveNameClick()" class="small-btn primary" title="' + t('sync.save_name') + '">✓</button>' +
        '<button type="button" onclick="handleCancelEditName()" class="small-btn" title="' + t('sync.cancel_button') + '">✗</button>' +
      '</span>' +
    '</p>' +
    '<div class="room-code-display" aria-label="Room code: ' + SyncManager.roomCode.split('').join(' ') + '">' + SyncManager.roomCode + '</div>' +
    '<p>' + t('sync.share_instructions') + '</p>' +
    passwordNote +
    '<p><strong>' + t_plural('sync.peer_count', getSyncPeerCount(), { count: getSyncPeerCount() }) + '</strong></p>' +
    (peerNames ? '<p>' + escapeHtml(peerNames) + '</p>' : '') +
    '<div class="button-row">' +
      '<button type="button" onclick="copyRoomCode(\'' + SyncManager.roomCode + '\')" class="secondary">' +
        '<span aria-hidden="true">📋</span> ' + t('sync.copy_code') +
      '</button>' +
      '<button type="button" onclick="closeSyncDialog()">' + t('sync.cancel_button') + '</button>' +
      '<button type="button" onclick="handleSyncDisconnect()" class="danger">' + t('sync.disconnect_button') + '</button>' +
    '</div>' +
  '</div>';
}

/**
 * Set up password checkbox toggle
 */
function setupPasswordToggle() {
  var checkbox = document.getElementById('sync-use-password');
  var passwordGroup = document.getElementById('sync-password-group');
  
  if (checkbox && passwordGroup) {
    checkbox.addEventListener('change', function() {
      passwordGroup.style.display = this.checked ? 'block' : 'none';
      if (this.checked) {
        document.getElementById('sync-password').focus();
      }
    });
  }
}

/**
 * Close the sync dialog
 */
function closeSyncDialog() {
  var overlay = document.getElementById('sync-dialog-overlay');
  if (overlay) overlay.remove();
  document.removeEventListener('keydown', handleSyncDialogKeydown);
  
  // Return focus to trigger
  if (SyncManager.previousFocus) {
    SyncManager.previousFocus.focus();
    SyncManager.previousFocus = null;
  }
}

/**
 * Handle keydown events in sync dialog
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleSyncDialogKeydown(e) {
  if (e.key === 'Escape') {
    closeSyncDialog();
  }
}

/**
 * Handle mode toggle in connect dialog
 */
function setupSyncDialogListeners() {
  var radios = document.querySelectorAll('input[name="sync-mode"]');
  var roomCodeGroup = document.getElementById('sync-room-code-group');
  
  radios.forEach(function(radio) {
    radio.addEventListener('change', function() {
      if (this.value === 'join') {
        roomCodeGroup.style.display = 'block';
        document.getElementById('sync-room-code').focus();
      } else {
        roomCodeGroup.style.display = 'none';
      }
    });
  });
}

/**
 * Handle connect button click
 */
async function handleSyncConnect() {
  var displayName = document.getElementById('sync-display-name').value.trim();
  var mode = document.querySelector('input[name="sync-mode"]:checked').value;
  var roomCodeInput = document.getElementById('sync-room-code');
  var roomCode = mode === 'join' ? roomCodeInput.value.trim().toUpperCase() : null;
  
  // Get password if enabled
  var usePassword = document.getElementById('sync-use-password') ? document.getElementById('sync-use-password').checked : false;
  var password = usePassword ? document.getElementById('sync-password').value : null;
  
  // Validate display name
  if (!displayName) {
    showSyncError(t('sync.invalid_display_name'));
    document.getElementById('sync-display-name').focus();
    return;
  }
  
  // Validate room code for join mode
  if (mode === 'join' && !isValidRoomCode(roomCode)) {
    showSyncError(t('sync.invalid_room_code'));
    roomCodeInput.focus();
    return;
  }
  
  try {
    // For join mode, show session choice dialog first
    if (mode === 'join') {
      closeSyncDialog();
      var joinChoice = await showJoinChoiceDialog();
      if (!joinChoice) return; // User cancelled
      
      await startSync(displayName, roomCode, password, joinChoice);
    } else {
      await startSync(displayName, roomCode, password, 'create');
      closeSyncDialog();
      
      // Show the room code for sharing
      showRoomCodeDialog(SyncManager.roomCode, usePassword);
    }
  } catch (error) {
    console.error('Sync connection failed:', error);
    if (error.message === 'password_required') {
      showSyncError(t('sync.password_required'));
    } else if (error.message === 'password_incorrect') {
      showSyncError(t('sync.password_incorrect'));
    } else {
      showSyncError(t('sync.connection_failed'));
    }
  }
}

/**
 * Show accessible error message in dialog
 * @param {string} message - Error message to display
 */
function showSyncError(message) {
  var errorEl = document.getElementById('sync-error-message');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    errorEl.setAttribute('role', 'alert');
  } else {
    alert(message);
  }
}

/**
 * Handle disconnect button click
 */
function handleSyncDisconnect() {
  stopSync();
  closeSyncDialog();
}

/**
 * Show room code after creating a room
 * @param {string} roomCode - The generated room code
 * @param {boolean} hasPassword - Whether room is password-protected
 */
function showRoomCodeDialog(roomCode, hasPassword) {
  var existing = document.getElementById('sync-dialog-overlay');
  if (existing) existing.remove();
  
  var overlay = document.createElement('div');
  overlay.id = 'sync-dialog-overlay';
  overlay.className = 'sync-dialog-overlay';
  
  var passwordNote = hasPassword 
    ? '<p class="password-note"><span aria-hidden="true">🔒</span> ' + t('sync.share_password_note') + '</p>' 
    : '';
  
  overlay.innerHTML = '<div class="sync-dialog" role="dialog" aria-labelledby="room-code-title" aria-modal="true">' +
    '<h2 id="room-code-title">' + t('sync.dialog_title') + '</h2>' +
    '<p>' + t('sync.share_instructions') + '</p>' +
    '<div class="room-code-display" aria-label="Room code: ' + roomCode.split('').join(' ') + '">' + roomCode + '</div>' +
    passwordNote +
    '<div class="button-row">' +
      '<button type="button" onclick="copyRoomCode(\'' + roomCode + '\')" class="secondary">' +
        '<span aria-hidden="true">📋</span> ' + t('sync.copy_code') +
      '</button>' +
      '<button type="button" onclick="closeSyncDialog()" class="primary">OK</button>' +
    '</div>' +
  '</div>';
  
  document.body.appendChild(overlay);
  
  // Announce to screen readers
  announceToScreenReader(t('sync.aria_room_created', { code: roomCode }));
}

/**
 * Copy room code to clipboard
 * @param {string} code - Room code to copy
 */
async function copyRoomCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    showToast(t('sync.code_copied'));
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

/**
 * Show join choice dialog when joining an existing room
 * User chooses between creating new session or merging into current
 * @returns {Promise<string|null>} 'new' | 'merge' | null (cancelled)
 */
async function showJoinChoiceDialog() {
  return new Promise(function(resolve) {
    var overlay = document.createElement('div');
    overlay.id = 'sync-dialog-overlay';
    overlay.className = 'sync-dialog-overlay';
    
    overlay.innerHTML = '<div class="sync-dialog" role="dialog" aria-labelledby="join-choice-title" aria-modal="true">' +
      '<h2 id="join-choice-title">' + t('sync.join_choice_title') + '</h2>' +
      '<p>' + t('sync.join_choice_description') + '</p>' +
      '<fieldset class="choice-group">' +
        '<legend class="visually-hidden">' + t('sync.join_choice_title') + '</legend>' +
        '<label class="choice-option">' +
          '<input type="radio" name="join-choice" value="new" checked>' +
          '<div class="choice-content">' +
            '<strong>' + t('sync.join_choice_new_session') + '</strong>' +
            '<span class="choice-desc">' + t('sync.join_choice_new_session_desc') + '</span>' +
          '</div>' +
        '</label>' +
        '<label class="choice-option">' +
          '<input type="radio" name="join-choice" value="merge">' +
          '<div class="choice-content">' +
            '<strong>' + t('sync.join_choice_merge_session') + '</strong>' +
            '<span class="choice-desc">' + t('sync.join_choice_merge_session_desc') + '</span>' +
          '</div>' +
        '</label>' +
      '</fieldset>' +
      '<div class="button-row">' +
        '<button type="button" class="cancel-btn">' + t('sync.cancel_button') + '</button>' +
        '<button type="button" class="confirm-btn primary">' + t('sync.connect_button') + '</button>' +
      '</div>' +
    '</div>';
    
    document.body.appendChild(overlay);
    
    // Focus first radio
    overlay.querySelector('input[type="radio"]').focus();
    
    // Handle cancel
    overlay.querySelector('.cancel-btn').addEventListener('click', function() {
      overlay.remove();
      resolve(null);
    });
    
    // Handle confirm
    overlay.querySelector('.confirm-btn').addEventListener('click', function() {
      var choice = overlay.querySelector('input[name="join-choice"]:checked').value;
      overlay.remove();
      resolve(choice);
    });
    
    // Handle Escape key
    function onJoinChoiceEscape(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onJoinChoiceEscape);
        overlay.remove();
        resolve(null);
      }
    }
    document.addEventListener('keydown', onJoinChoiceEscape);
    
    // Handle overlay click
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        overlay.remove();
        resolve(null);
      }
    });
  });
}

/**
 * Announce message to screen readers using ARIA live region
 * @param {string} message - Message to announce
 * @param {string} [priority] - 'polite' or 'assertive'
 */
function announceToScreenReader(message, priority) {
  priority = priority || 'polite';
  var announcer = document.getElementById('sync-sr-announcer');
  
  if (!announcer) {
    announcer = document.createElement('div');
    announcer.id = 'sync-sr-announcer';
    announcer.setAttribute('aria-live', priority);
    announcer.setAttribute('aria-atomic', 'true');
    announcer.className = 'visually-hidden';
    document.body.appendChild(announcer);
  }
  
  // Clear and set message to trigger announcement
  announcer.textContent = '';
  setTimeout(function() {
    announcer.textContent = message;
  }, 100);
}

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {number} [duration] - Duration in milliseconds
 */
function showToast(message, duration) {
  duration = duration || 3000;
  var toast = document.getElementById('sync-toast');
  
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'sync-toast';
    toast.className = 'sync-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }
  
  toast.textContent = message;
  toast.classList.add('visible');
  
  setTimeout(function() {
    toast.classList.remove('visible');
  }, duration);
}

/**
 * Trap focus within an element
 * @param {HTMLElement} element - Container to trap focus within
 */
function trapFocus(element) {
  var focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  var firstFocusable = focusableElements[0];
  var lastFocusable = focusableElements[focusableElements.length - 1];
  
  element.addEventListener('keydown', function(e) {
    if (e.key !== 'Tab') return;
    
    if (e.shiftKey) {
      if (document.activeElement === firstFocusable) {
        lastFocusable.focus();
        e.preventDefault();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        firstFocusable.focus();
        e.preventDefault();
      }
    }
  });
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  var div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Update the sync UI elements based on current state
 */
function updateSyncUI() {
  var syncButton = document.getElementById('sync_button');
  var syncPeers = document.getElementById('sync_peers');
  var syncStatus = syncButton ? syncButton.querySelector('.sync-status') : null;
  
  if (!syncButton) return;
  
  // Update button state
  syncButton.classList.remove('offline', 'connecting', 'connected', 'error');
  syncButton.classList.add(SyncManager.state);
  
  // Update button text
  if (syncStatus) {
    switch (SyncManager.state) {
      case 'connecting':
        syncStatus.textContent = t('sync.status_connecting');
        break;
      case 'connected':
        syncStatus.textContent = SyncManager.roomCode || t('sync.status_connected');
        break;
      case 'error':
        syncStatus.textContent = t('sync.status_error');
        break;
      default:
        syncStatus.textContent = t('sync.button');
    }
  }
  
  // Update peer count indicator
  if (syncPeers) {
    if (SyncManager.state === 'connected') {
      syncPeers.style.display = 'inline-flex';
      
      var peerCount = getSyncPeerCount();
      var peerCountEl = syncPeers.querySelector('.peer-count');
      var tooltipEl = syncPeers.querySelector('.peer-tooltip');
      
      if (peerCountEl) {
        peerCountEl.textContent = t_plural('sync.peer_count', peerCount, { count: peerCount });
      }
      
      if (tooltipEl) {
        var allNames = [SyncManager.displayName + ' (you)'].concat(getSyncPeers().map(function(p) { return p.displayName; }));
        tooltipEl.innerHTML = allNames.map(function(name) { return '<div>' + escapeHtml(name) + '</div>'; }).join('');
      }
    } else {
      syncPeers.style.display = 'none';
    }
  }
}

/**
 * Set up awareness handlers for presence
 * @param {Object} awareness - Yjs awareness instance
 */
function setupAwareness(awareness) {
  SyncManager.awareness = awareness;
  
  // Set local state
  awareness.setLocalState({
    displayName: SyncManager.displayName,
    color: generateUserColor(SyncManager.displayName),
    lastSeen: Date.now()
  });
  
  // Listen for changes
  awareness.on('change', function() {
    updatePeersFromAwareness();
    checkDisplayNameCollision();
    updateSyncUI();
    
    if (SyncManager.onPeersChange) {
      SyncManager.onPeersChange(getSyncPeers());
    }
  });
}

/**
 * Change display name while connected
 * Updates awareness state and persists to global doc
 * @param {string} newName - New display name
 * @returns {boolean} True if name was changed successfully
 */
function changeDisplayName(newName) {
  if (!newName || newName.trim().length === 0) {
    return false;
  }
  
  // Enforce max length
  newName = newName.trim().substring(0, MAX_DISPLAY_NAME_LENGTH);
  
  // Check for collision and get unique name
  var uniqueName = getUniqueDisplayName(newName);
  
  // Update SyncManager state
  SyncManager.displayName = uniqueName;
  
  // Update awareness if connected
  if (SyncManager.awareness) {
    SyncManager.awareness.setLocalState({
      displayName: uniqueName,
      color: generateUserColor(uniqueName),
      lastSeen: Date.now()
    });
  }
  
  // Persist to global doc
  saveDisplayName(uniqueName);
  
  // Update UI
  updateSyncUI();
  
  // Notify if name was changed due to collision
  if (uniqueName !== newName) {
    showToast(t('sync.name_changed', { name: uniqueName }));
  } else {
    showToast(t('sync.name_updated', { name: uniqueName }));
  }
  
  return true;
}

/**
 * Handle edit name button click - show inline editor
 */
function handleEditNameClick() {
  var nameDisplay = document.getElementById('sync-current-name-display');
  var editButton = document.getElementById('sync-edit-name-btn');
  var editContainer = document.getElementById('sync-edit-name-container');
  var editInput = document.getElementById('sync-edit-name-input');
  
  if (!nameDisplay || !editContainer || !editInput) return;
  
  // Hide display, show editor
  nameDisplay.style.display = 'none';
  if (editButton) editButton.style.display = 'none';
  editContainer.style.display = 'flex';
  
  // Set current value and focus
  editInput.value = SyncManager.displayName || '';
  editInput.focus();
  editInput.select();
}

/**
 * Handle save name button click
 */
function handleSaveNameClick() {
  var editInput = document.getElementById('sync-edit-name-input');
  if (!editInput) return;
  
  var newName = editInput.value.trim();
  if (newName) {
    changeDisplayName(newName);
  }
  
  // Refresh the dialog to show updated name
  closeSyncDialog();
  showSyncDialog();
}

/**
 * Handle cancel edit name
 */
function handleCancelEditName() {
  var nameDisplay = document.getElementById('sync-current-name-display');
  var editButton = document.getElementById('sync-edit-name-btn');
  var editContainer = document.getElementById('sync-edit-name-container');
  
  if (!nameDisplay || !editContainer) return;
  
  // Show display, hide editor
  nameDisplay.style.display = 'inline';
  if (editButton) editButton.style.display = 'inline';
  editContainer.style.display = 'none';
}

/**
 * Update peers map from awareness states
 */
function updatePeersFromAwareness() {
  if (!SyncManager.awareness) return;
  
  SyncManager.peers.clear();
  
  var states = SyncManager.awareness.getStates();
  var localClientId = SyncManager.awareness.clientID;
  
  states.forEach(function(state, clientId) {
    if (clientId !== localClientId && state.displayName) {
      SyncManager.peers.set(clientId, {
        displayName: state.displayName,
        color: state.color || '#888',
        lastSeen: state.lastSeen || Date.now()
      });
    }
  });
}

/**
 * Generate a consistent color for a user based on their name
 * @param {string} name - User's display name
 * @returns {string} Hex color
 */
function generateUserColor(name) {
  var colors = [
    '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', 
    '#E91E63', '#00BCD4', '#795548', '#607D8B'
  ];
  
  var hash = 0;
  for (var i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Get a unique display name by appending suffix if needed
 * Checks existing peers and returns modified name if collision detected
 * @param {string} baseName - Desired display name
 * @returns {string} Unique display name (possibly with suffix)
 */
function getUniqueDisplayName(baseName) {
  if (!SyncManager.awareness) return baseName;
  
  var existingNames = new Set();
  var states = SyncManager.awareness.getStates();
  var localClientId = SyncManager.awareness.clientID;
  
  states.forEach(function(state, clientId) {
    if (clientId !== localClientId && state.displayName) {
      existingNames.add(state.displayName.toLowerCase());
    }
  });
  
  // Check if base name is available
  if (!existingNames.has(baseName.toLowerCase())) {
    return baseName;
  }
  
  // Find available suffix
  var counter = 2;
  while (existingNames.has((baseName.toLowerCase() + ' (' + counter + ')'))) {
    counter++;
    if (counter > 99) break; // Safety limit
  }
  
  // Calculate suffix and truncate base name if needed to stay within max length
  var suffix = ' (' + counter + ')';
  var maxBaseLength = MAX_DISPLAY_NAME_LENGTH - suffix.length;
  var truncatedBase = baseName.substring(0, maxBaseLength);
  
  return truncatedBase + suffix;
}

/**
 * Update display name if collision detected after peers change
 * Called when awareness changes to handle late-joining duplicates
 * Only the user with the HIGHER client ID changes their name to prevent ping-pong
 */
function checkDisplayNameCollision() {
  if (!SyncManager.awareness || !SyncManager.displayName) return;
  
  var localClientId = SyncManager.awareness.clientID;
  var states = SyncManager.awareness.getStates();
  var myName = SyncManager.displayName.toLowerCase();
  
  // Check if any peer has the same name AND a lower client ID
  // If so, they have priority and we need to change
  var shouldChange = false;
  
  states.forEach(function(state, clientId) {
    if (clientId !== localClientId && state.displayName) {
      if (state.displayName.toLowerCase() === myName && clientId < localClientId) {
        // Peer with same name has lower ID, they have priority
        shouldChange = true;
      }
    }
  });
  
  if (!shouldChange) return;
  
  var uniqueName = getUniqueDisplayName(SyncManager.displayName);
  
  if (uniqueName !== SyncManager.displayName) {
    console.log('Display name collision detected, changing to: ' + uniqueName);
    SyncManager.displayName = uniqueName;
    
    // Update awareness with new name
    SyncManager.awareness.setLocalState({
      displayName: uniqueName,
      color: generateUserColor(uniqueName),
      lastSeen: Date.now()
    });
    
    // Persist new name
    saveDisplayName(uniqueName);
    
    // Notify user
    showToast(t('sync.name_changed', { name: uniqueName }));
  }
}

/**
 * Handle session switch while synced
 * Shows confirmation dialog and disconnects if user proceeds
 * @param {string} newSessionId - New session's UUID
 * @returns {Promise<boolean>} True if switch should proceed, false to cancel
 */
async function handleSessionSwitch(newSessionId) {
  // Not synced - always allow switch, but check if new session has sync info
  if (SyncManager.state !== 'connected') {
    // After switch completes, try to auto-reconnect to new session's room
    setTimeout(function() {
      tryAutoReconnectForCurrentSession();
    }, 500);
    return true;
  }
  
  // Show confirmation dialog
  return new Promise(function(resolve) {
    var overlay = document.createElement('div');
    overlay.className = 'sync-dialog-overlay';
    overlay.innerHTML = createSessionSwitchConfirmHTML();
    document.body.appendChild(overlay);
    
    // Focus trap
    var confirmBtn = overlay.querySelector('#sync-switch-confirm');
    var cancelBtn = overlay.querySelector('#sync-switch-cancel');
    
    confirmBtn.focus();
    
    function cleanup() {
      overlay.remove();
    }
    
    confirmBtn.addEventListener('click', function() {
      cleanup();
      
      // Disconnect from current room (don't clear room code - session retains it)
      stopSync(false);
      
      showToast(t('sync.session_switch_disconnect'));
      announceToScreenReader(t('sync.session_switch_disconnect'));
      
      // After switch, try to reconnect to new session's room
      setTimeout(function() {
        tryAutoReconnectForCurrentSession();
      }, 500);
      
      resolve(true);
    });
    
    cancelBtn.addEventListener('click', function() {
      cleanup();
      resolve(false);
    });
    
    // Escape to cancel
    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        cleanup();
        resolve(false);
      }
    });
  });
}

/**
 * Create HTML for session switch confirmation dialog
 * @returns {string} Dialog HTML
 */
function createSessionSwitchConfirmHTML() {
  return '<div class="sync-dialog" role="alertdialog" aria-labelledby="switch-confirm-title" aria-describedby="switch-confirm-desc" aria-modal="true">' +
    '<h2 id="switch-confirm-title">' + t('sync.switch_confirm_title') + '</h2>' +
    '<p id="switch-confirm-desc">' + t('sync.switch_confirm_message', { code: SyncManager.roomCode }) + '</p>' +
    '<div class="button-row">' +
      '<button type="button" id="sync-switch-cancel" class="ui-button">' + t('sync.switch_cancel') + '</button>' +
      '<button type="button" id="sync-switch-confirm" class="ui-button ui-button-primary">' + t('sync.switch_confirm') + '</button>' +
    '</div>' +
  '</div>';
}

/**
 * Handle deletion of the synced session
 * Called when a session is deleted - checks if it was the synced session
 * @param {string} deletedSessionId - ID of the deleted session
 */
function handleSyncedSessionDeleted(deletedSessionId) {
  if (SyncManager.state !== 'connected') {
    return; // Not synced, nothing to do
  }
  
  if (SyncManager.syncedSessionId !== deletedSessionId) {
    return; // Different session was deleted
  }
  
  console.log('Synced session was deleted, disconnecting...');
  
  // Notify user
  showToast(t('sync.error_session_deleted'));
  announceToScreenReader(t('sync.error_session_deleted'), 'assertive');
  
  // Disconnect from current room
  stopSync();
}

/**
 * Check if we should sync the current session
 * @returns {boolean} True if sync should be active
 */
function shouldSyncCurrentSession() {
  return SyncManager.state === 'connected' && 
         SyncManager.provider !== null;
}

/**
 * Get the synced session's ID
 * @returns {string|null} Session ID being synced, or null
 */
function getSyncedSessionId() {
  if (!shouldSyncCurrentSession()) return null;
  return SyncManager.syncedSessionId;
}

/**
 * Get current synced session name for display
 * @returns {string|null} Session name or null if not synced
 */
function getSyncSessionName() {
  if (!shouldSyncCurrentSession()) return null;
  
  var sessionDoc = typeof getActiveSessionDoc === 'function' ? getActiveSessionDoc() : null;
  if (!sessionDoc) return null;
  
  var session = sessionDoc.getMap('session');
  return session ? session.get('name') : null;
}

// ============================================
// Phase 4: Name & Question Matching
// ============================================

/**
 * Compare two arrays of names and find matches
 * @param {Array} localNames - Local names array (index 0 is null/placeholder)
 * @param {Array} remoteNames - Remote names array (index 0 is null/placeholder)
 * @param {string} type - Type for logging ('team', 'block', 'question')
 * @returns {Object} Matching result
 */
function compareArrays(localNames, remoteNames, type) {
  var result = {
    matches: [],      // Array of { remoteIndex, localIndex, confidence, remoteName, localName }
    unmatched: {
      local: [],      // Indices that exist only locally
      remote: []      // Indices that exist only remotely
    },
    needsReview: false
  };
  
  var localUsed = new Set();
  var remoteUsed = new Set();
  
  // Pass 1: Exact name matches (case-insensitive)
  for (var r = 1; r < remoteNames.length; r++) {
    if (!remoteNames[r]) continue;
    
    var remoteName = remoteNames[r].toLowerCase().trim();
    
    for (var l = 1; l < localNames.length; l++) {
      if (localUsed.has(l) || !localNames[l]) continue;
      
      var localName = localNames[l].toLowerCase().trim();
      
      if (remoteName === localName) {
        result.matches.push({
          remoteIndex: r,
          localIndex: l,
          confidence: 'exact',
          remoteName: remoteNames[r],
          localName: localNames[l]
        });
        localUsed.add(l);
        remoteUsed.add(r);
        break;
      }
    }
  }
  
  // Pass 2: Position matches for remaining (same index, different name)
  for (var r = 1; r < remoteNames.length; r++) {
    if (remoteUsed.has(r) || !remoteNames[r]) continue;
    
    // Check if same position is available locally
    if (r < localNames.length && localNames[r] && !localUsed.has(r)) {
      result.matches.push({
        remoteIndex: r,
        localIndex: r,
        confidence: 'position',
        remoteName: remoteNames[r],
        localName: localNames[r]
      });
      localUsed.add(r);
      remoteUsed.add(r);
      result.needsReview = true;
    }
  }
  
  // Pass 3: Collect unmatched remote items
  for (var r = 1; r < remoteNames.length; r++) {
    if (!remoteUsed.has(r) && remoteNames[r]) {
      result.unmatched.remote.push({
        index: r,
        name: remoteNames[r]
      });
      result.needsReview = true;
    }
  }
  
  // Pass 4: Collect unmatched local items
  for (var l = 1; l < localNames.length; l++) {
    if (!localUsed.has(l) && localNames[l]) {
      result.unmatched.local.push({
        index: l,
        name: localNames[l]
      });
    }
  }
  
  return result;
}

/**
 * Compare local and remote session data to find matches
 * @param {Object} localData - Local session data { teams, blocks, questions }
 * @param {Object} remoteData - Remote session data { teams, blocks, questions }
 * @returns {Object} Matching results for teams, blocks, questions
 */
function compareSessionData(localData, remoteData) {
  return {
    teams: compareArrays(localData.teams || [null], remoteData.teams || [null], 'team'),
    blocks: compareArrays(localData.blocks || [null], remoteData.blocks || [null], 'block'),
    questions: compareArrays(localData.questions || [null], remoteData.questions || [null], 'question')
  };
}

/**
 * Calculate overall match statistics
 * @param {Object} comparison - Result from compareSessionData
 * @returns {Object} Statistics
 */
function getMatchStats(comparison) {
  var stats = {
    teams: {
      total: comparison.teams.matches.length + comparison.teams.unmatched.remote.length,
      exact: comparison.teams.matches.filter(function(m) { return m.confidence === 'exact'; }).length,
      needsReview: comparison.teams.needsReview
    },
    blocks: {
      total: comparison.blocks.matches.length + comparison.blocks.unmatched.remote.length,
      exact: comparison.blocks.matches.filter(function(m) { return m.confidence === 'exact'; }).length,
      needsReview: comparison.blocks.needsReview
    },
    questions: {
      total: comparison.questions.matches.length + comparison.questions.unmatched.remote.length,
      exact: comparison.questions.matches.filter(function(m) { return m.confidence === 'exact'; }).length,
      needsReview: comparison.questions.needsReview
    }
  };
  
  stats.overallNeedsReview = stats.teams.needsReview || 
                             stats.blocks.needsReview || 
                             stats.questions.needsReview;
  
  return stats;
}

/**
 * Create dropdown selector HTML for local match options
 * @param {string} type - Category type (teams, blocks, questions)
 * @param {number} remoteIndex - Remote item index
 * @param {*} selectedValue - Currently selected value
 * @param {Array} unmatchedLocal - Unmatched local items
 * @returns {string} HTML for select dropdown
 */
function createLocalSelector(type, remoteIndex, selectedValue, unmatchedLocal) {
  var html = '<select class="matching-select" data-type="' + type + '" data-remote-index="' + remoteIndex + '">';
  
  // Option to create new
  html += '<option value="new" ' + (selectedValue === 'new' ? 'selected' : '') + '>' + t('sync.matching_create_new') + '</option>';
  
  // Options for unmatched local items
  for (var i = 0; i < unmatchedLocal.length; i++) {
    var item = unmatchedLocal[i];
    html += '<option value="' + item.index + '" ' + (selectedValue === item.index ? 'selected' : '') + '>' + escapeHtml(item.name) + '</option>';
  }
  
  html += '</select>';
  return html;
}

/**
 * Create HTML for a matching section (teams, blocks, or questions)
 * @param {string} type - Category type
 * @param {string} title - Section title
 * @param {Object} data - Matching data for this category
 * @returns {string} HTML for section
 */
function createMatchingSection(type, title, data) {
  if (data.matches.length === 0 && data.unmatched.remote.length === 0) {
    return ''; // Nothing to show
  }
  
  var html = '<h3>' + title + '</h3>' +
    '<table class="matching-table">' +
    '<thead><tr>' +
    '<th>#</th>' +
    '<th>' + t('sync.matching_remote') + '</th>' +
    '<th></th>' +
    '<th>' + t('sync.matching_local') + '</th>' +
    '</tr></thead><tbody>';
  
  // Show matches
  for (var i = 0; i < data.matches.length; i++) {
    var match = data.matches[i];
    var isExact = match.confidence === 'exact';
    html += '<tr data-type="' + type + '" data-remote-index="' + match.remoteIndex + '">' +
      '<td>' + match.remoteIndex + '</td>' +
      '<td>' + escapeHtml(match.remoteName) + '</td>' +
      '<td>→</td>' +
      '<td>' + 
        (isExact ? 
          '<span class="auto-matched">' + escapeHtml(match.localName) + ' ✓</span>' :
          createLocalSelector(type, match.remoteIndex, match.localIndex, data.unmatched.local)
        ) +
      '</td></tr>';
  }
  
  // Show unmatched remote items
  for (var i = 0; i < data.unmatched.remote.length; i++) {
    var item = data.unmatched.remote[i];
    html += '<tr data-type="' + type + '" data-remote-index="' + item.index + '">' +
      '<td>' + item.index + '</td>' +
      '<td>' + escapeHtml(item.name) + '</td>' +
      '<td>→</td>' +
      '<td>' + createLocalSelector(type, item.index, 'new', data.unmatched.local) + '</td>' +
      '</tr>';
  }
  
  html += '</tbody></table>';
  return html;
}

/**
 * Create HTML for matching dialog
 * @param {Object} comparison - Comparison result from compareSessionData
 * @returns {string} Dialog HTML
 */
function createMatchingDialogHTML(comparison) {
  return '<div class="sync-dialog matching-dialog" role="dialog" aria-labelledby="matching-dialog-title" aria-modal="true">' +
    '<h2 id="matching-dialog-title">' + t('sync.matching_title') + '</h2>' +
    '<p>' + t('sync.matching_description') + '</p>' +
    createMatchingSection('teams', t('sync.matching_teams_header'), comparison.teams) +
    createMatchingSection('blocks', t('sync.matching_blocks_header'), comparison.blocks) +
    createMatchingSection('questions', t('sync.matching_questions_header'), comparison.questions) +
    '<div class="button-row">' +
      '<button type="button" class="cancel-matching-btn">' + t('sync.matching_skip') + '</button>' +
      '<button type="button" class="confirm-matching-btn primary">' + t('sync.matching_confirm') + '</button>' +
    '</div>' +
  '</div>';
}

/**
 * Collect user-selected mappings from matching dialog
 * @returns {Object} Mappings object { teams: {}, blocks: {}, questions: {} }
 */
function collectMappings() {
  var mappings = {
    teams: {},
    blocks: {},
    questions: {}
  };
  
  // Collect from dropdown selects
  var selects = document.querySelectorAll('.matching-select');
  selects.forEach(function(select) {
    var type = select.dataset.type;
    var remoteIndex = parseInt(select.dataset.remoteIndex);
    var localValue = select.value;
    
    mappings[type][remoteIndex] = localValue === 'new' ? 'new' : parseInt(localValue);
  });
  
  // Include auto-matched items (exact matches)
  var autoMatched = document.querySelectorAll('.auto-matched');
  autoMatched.forEach(function(el) {
    var row = el.closest('tr');
    if (row) {
      var type = row.dataset.type;
      var remoteIndex = parseInt(row.dataset.remoteIndex);
      // For exact matches, remote and local indices match what was stored in data
      mappings[type][remoteIndex] = remoteIndex;
    }
  });
  
  return mappings;
}

/**
 * Show the name matching dialog
 * @param {Object} comparison - Result from compareSessionData
 * @returns {Promise<Object|null>} User-confirmed mappings or null if cancelled
 */
async function showNameMatchingDialog(comparison) {
  return new Promise(function(resolve) {
    // Remove any existing dialog
    var existing = document.getElementById('sync-dialog-overlay');
    if (existing) existing.remove();
    
    var overlay = document.createElement('div');
    overlay.id = 'sync-dialog-overlay';
    overlay.className = 'sync-dialog-overlay';
    
    overlay.innerHTML = createMatchingDialogHTML(comparison);
    document.body.appendChild(overlay);
    
    // Focus first focusable element
    var firstButton = overlay.querySelector('button');
    if (firstButton) firstButton.focus();
    
    // Handle cancel
    overlay.querySelector('.cancel-matching-btn').addEventListener('click', function() {
      overlay.remove();
      resolve(null);
      // Disconnect since user cancelled
      stopSync();
    });
    
    // Handle confirm
    overlay.querySelector('.confirm-matching-btn').addEventListener('click', function() {
      var mappings = collectMappings();
      overlay.remove();
      resolve(mappings);
    });
    
    // Handle Escape key
    function onMatchingEscape(e) {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onMatchingEscape);
        overlay.remove();
        resolve(null);
        stopSync();
      }
    }
    document.addEventListener('keydown', onMatchingEscape);
    
    // Handle overlay click
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        document.removeEventListener('keydown', onMatchingEscape);
        overlay.remove();
        resolve(null);
        stopSync();
      }
    });
  });
}

/**
 * Apply name mappings to synchronize data structure
 * @param {Object} mappings - User-confirmed mappings
 * @param {Y.Doc} sessionDoc - Session document to modify
 */
function applyMappings(mappings, sessionDoc) {
  if (!sessionDoc || !mappings) return;
  
  sessionDoc.transact(function() {
    var session = sessionDoc.getMap('session');
    
    // Apply team mappings
    if (mappings.teams && Object.keys(mappings.teams).length > 0) {
      console.log('Applying team mappings:', mappings.teams);
      // For 'new' items, the CRDT will handle creation
      // For mapped items, the positions are already aligned by Yjs sync
    }
    
    // Apply block mappings
    if (mappings.blocks && Object.keys(mappings.blocks).length > 0) {
      console.log('Applying block mappings:', mappings.blocks);
    }
    
    // Apply question mappings
    if (mappings.questions && Object.keys(mappings.questions).length > 0) {
      console.log('Applying question mappings:', mappings.questions);
    }
  }, 'local');
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SyncManager: SyncManager,
    SyncError: SyncError,
    initSyncManager: initSyncManager,
    generateRoomCode: generateRoomCode,
    isValidRoomCode: isValidRoomCode,
    getSyncState: getSyncState,
    getSyncRoomCode: getSyncRoomCode,
    getSyncDisplayName: getSyncDisplayName,
    getSyncPeers: getSyncPeers,
    getSyncPeerCount: getSyncPeerCount,
    startSync: startSync,
    stopSync: stopSync,
    showSyncDialog: showSyncDialog,
    showNameMatchingDialog: showNameMatchingDialog,
    updateSyncUI: updateSyncUI,
    generateUserColor: generateUserColor,
    getUniqueDisplayName: getUniqueDisplayName,
    handleSessionSwitch: handleSessionSwitch,
    handleSyncedSessionDeleted: handleSyncedSessionDeleted,
    handleSyncError: handleSyncError,
    retryConnection: retryConnection,
    clearRetryTimeout: clearRetryTimeout,
    getSyncedSessionId: getSyncedSessionId,
    getSyncSessionName: getSyncSessionName,
    compareArrays: compareArrays,
    compareSessionData: compareSessionData,
    getMatchStats: getMatchStats,
    applyMappings: applyMappings,
    changeDisplayName: changeDisplayName,
    handleEditNameClick: handleEditNameClick,
    handleSaveNameClick: handleSaveNameClick,
    handleCancelEditName: handleCancelEditName
  };
}
