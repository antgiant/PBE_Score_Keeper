// WebRTC Sync Module for PBE Score Keeper
// Provides peer-to-peer real-time synchronization using y-webrtc
// Also supports server-based sync for large events using y-websocket

/**
 * Maximum length for display names (enforced in UI and validation)
 */
var MAX_DISPLAY_NAME_LENGTH = 30;

/**
 * Sync room expiration time in milliseconds (12 hours)
 * Room codes older than this are automatically cleared on page load
 */
var SYNC_ROOM_EXPIRATION_MS = 12 * 60 * 60 * 1000;  // 12 hours

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
  SERVER_DOWN: 'server_down',
  ROOM_EXISTS: 'room_exists',
  ROOM_NOT_FOUND: 'room_not_found'
};

/**
 * SyncManager - Central controller for WebRTC and WebSocket synchronization
 * 
 * States: 'offline' | 'connecting' | 'connected' | 'error'
 * Connection Types: 'webrtc' (P2P) | 'websocket' (server-based for large events)
 */
var SyncManager = {
  // Connection state
  state: 'offline',
  connectionType: 'webrtc',  // 'webrtc' for P2P, 'websocket' for large events
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
    // Combined server URL (handles both signaling and websocket)
    syncServer: 'wss://y-webrtc-pbe.fly.dev',
    
    // Signaling servers - use ROOT PATH for backwards compatibility with backups
    signalingServers: [
      'wss://y-webrtc-pbe.fly.dev',              // Primary (combined server, root path)
      'wss://signaling.yjs.dev',                 // Backup 1 (official, root path)
      'wss://y-webrtc-signaling-us.herokuapp.com'  // Backup 2 (root path)
    ],
    minSignalingServers: 3,  // Minimum required for reliability
    
    // Room prefixes
    roomPrefix: 'pbe-sync-',         // P2P rooms
    roomPrefixLarge: 'pbe-ws-'       // Large event rooms (server-based)
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
 * Update the session name cache in global doc from session doc
 * Called when remote updates come in to ensure cache reflects synced name
 * @param {string} sessionId - Session UUID
 * @param {Y.Doc} sessionDoc - Session document (optional, will load if not provided)
 */
function updateSessionNameCache(sessionId, sessionDoc) {
  if (!sessionId) return;
  
  var doc = sessionDoc || (typeof getSessionDoc === 'function' ? getSessionDoc(sessionId) : null);
  if (!doc) return;
  
  var session = doc.getMap('session');
  if (!session) return;
  
  var name = session.get('name');
  if (!name) return;
  
  var globalDoc = typeof getGlobalDoc === 'function' ? getGlobalDoc() : null;
  if (!globalDoc) return;
  
  var meta = globalDoc.getMap('meta');
  var sessionNames = meta.get('sessionNames');
  
  if (sessionNames) {
    var cachedName = sessionNames.get(sessionId);
    if (cachedName !== name) {
      // Cache is out of date, update it
      globalDoc.transact(function() {
        sessionNames.set(sessionId, name);
      }, 'local');
    }
  }
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
 * Uses global cache so works even for unloaded sessions
 * @returns {Object} Map of session index (1-based) to boolean (has syncRoom)
 */
function getSessionSyncStatuses() {
  var statuses = {};
  var sessionOrder = typeof get_session_order === 'function' ? get_session_order() : [];
  
  // Try to use global cache first (works for unloaded sessions)
  var globalDoc = typeof getGlobalDoc === 'function' ? getGlobalDoc() : null;
  var sessionSyncRooms = null;
  if (globalDoc) {
    var meta = globalDoc.getMap('meta');
    sessionSyncRooms = meta.get('sessionSyncRooms');
  }
  
  for (var i = 0; i < sessionOrder.length; i++) {
    var sessionId = sessionOrder[i];
    var hasSyncRoom = false;
    
    if (sessionSyncRooms) {
      // Use cache for fast lookup
      hasSyncRoom = sessionSyncRooms.has(sessionId) && !!sessionSyncRooms.get(sessionId);
    } else {
      // Fallback to session doc (only works if loaded)
      var syncRoom = getSessionSyncRoom(sessionId);
      hasSyncRoom = !!syncRoom;
    }
    
    statuses[i + 1] = hasSyncRoom;  // 1-based index
  }
  
  return statuses;
}

/**
 * Save sync room code to session doc and global cache
 * CRITICAL: Enforces uniqueness - only ONE session can have a given room code
 * @param {string} roomCode - Room code to save (null to clear)
 * @param {string} sessionId - Session UUID (optional, uses current if not provided)
 */
function saveSessionSyncRoom(roomCode, sessionId) {
  var effectiveSessionId = sessionId || (typeof get_current_session_id === 'function' ? get_current_session_id() : null);
  var doc = sessionId ? getSessionDoc(sessionId) : getActiveSessionDoc();
  if (!doc) return;
  
  // DEFENSE: If setting a room code, first remove it from ALL other sessions
  // This ensures exactly one session can have a given room code
  if (roomCode) {
    clearRoomCodeFromOtherSessions(roomCode, effectiveSessionId);
  }
  
  // Config is nested inside session map, not at doc root
  var session = doc.getMap('session');
  if (!session) {
    return;
  }
  
  var config = session.get('config');
  if (config) {
    if (roomCode) {
      config.set('syncRoom', roomCode);
      config.set('syncCreatedAt', Date.now());  // Track when sync was created for expiration
      config.set('syncSessionId', effectiveSessionId);  // Store session ID for collision detection
    } else {
      config.delete('syncRoom');
      config.delete('syncCreatedAt');
      config.delete('syncSessionId');
    }
  }
  
  // Also update global cache for sync status display
  updateSessionSyncRoomCache(effectiveSessionId, roomCode);
}

/**
 * DEFENSE: Clear a room code from all sessions EXCEPT the specified one
 * Ensures room code uniqueness across all sessions
 * @param {string} roomCode - Room code to clear from other sessions
 * @param {string} keepSessionId - Session that should keep the room code
 */
function clearRoomCodeFromOtherSessions(roomCode, keepSessionId) {
  if (!roomCode) return;
  
  var globalDoc = typeof getGlobalDoc === 'function' ? getGlobalDoc() : null;
  if (!globalDoc) return;
  
  var meta = globalDoc.getMap('meta');
  var sessionSyncRooms = meta.get('sessionSyncRooms');
  
  if (!sessionSyncRooms) return;
  
  var sessionsToClean = [];
  
  // Find all sessions with this room code (except the one we're keeping)
  sessionSyncRooms.forEach(function(room, sessionId) {
    if (room === roomCode && sessionId !== keepSessionId) {
      sessionsToClean.push(sessionId);
    }
  });
  
  // Clear the room code from those sessions
  if (sessionsToClean.length > 0) {
    console.warn('DEFENSE: Clearing duplicate room code "' + roomCode + '" from ' + 
                 sessionsToClean.length + ' other session(s)');
    
    for (var i = 0; i < sessionsToClean.length; i++) {
      var sessionId = sessionsToClean[i];
      
      // Clear from session doc
      var sessionDoc = typeof getSessionDoc === 'function' ? getSessionDoc(sessionId) : null;
      if (sessionDoc) {
        var session = sessionDoc.getMap('session');
        if (session) {
          var config = session.get('config');
          if (config && config.get('syncRoom') === roomCode) {
            config.delete('syncRoom');
            config.delete('syncCreatedAt');
            config.delete('syncSessionId');
          }
        }
      }
      
      // Clear from cache
      globalDoc.transact(function() {
        sessionSyncRooms.delete(sessionId);
      }, 'local');
    }
  }
}

/**
 * Update the session sync room cache in global doc
 * @param {string} sessionId - Session UUID
 * @param {string|null} roomCode - Room code or null to clear
 */
function updateSessionSyncRoomCache(sessionId, roomCode) {
  if (!sessionId) return;
  
  var globalDoc = typeof getGlobalDoc === 'function' ? getGlobalDoc() : null;
  if (!globalDoc) return;
  
  var meta = globalDoc.getMap('meta');
  var sessionSyncRooms = meta.get('sessionSyncRooms');
  
  if (!sessionSyncRooms) {
    // Create the map if it doesn't exist
    globalDoc.transact(function() {
      sessionSyncRooms = new Y.Map();
      if (roomCode) {
        sessionSyncRooms.set(sessionId, roomCode);
      }
      meta.set('sessionSyncRooms', sessionSyncRooms);
    }, 'local');
  } else {
    globalDoc.transact(function() {
      if (roomCode) {
        sessionSyncRooms.set(sessionId, roomCode);
      } else {
        sessionSyncRooms.delete(sessionId);
      }
    }, 'local');
  }
}

/**
 * Check if a sync room has expired (older than SYNC_ROOM_EXPIRATION_MS)
 * @param {number} createdAt - Timestamp when sync was created
 * @returns {boolean} True if expired
 */
function isSyncRoomExpired(createdAt) {
  if (!createdAt) return false;  // No timestamp = legacy, don't expire
  var now = Date.now();
  return (now - createdAt) > SYNC_ROOM_EXPIRATION_MS;
}

/**
 * Get sync session ID stored with the room code
 * @param {string} [sessionId] - Session to check (defaults to current)
 * @returns {string|null} Session ID or null
 */
function getSyncSessionId(sessionId) {
  var doc = sessionId ? getSessionDoc(sessionId) : getActiveSessionDoc();
  if (!doc) return null;
  
  var session = doc.getMap('session');
  if (!session) return null;
  
  var config = session.get('config');
  if (config) {
    return config.get('syncSessionId') || null;
  }
  return null;
}

/**
 * Get the session ID from a Y.Doc (the 'id' field in the session map)
 * This is the actual session UUID, different from syncSessionId which is what we expect
 * @param {Y.Doc} doc - Session Y.Doc
 * @returns {string|null} Session ID or null
 */
function getRemoteSessionIdFromDoc(doc) {
  if (!doc) return null;
  
  var session = doc.getMap('session');
  if (!session) return null;
  
  return session.get('id') || null;
}

/**
 * Handle session ID collision - different user with same room code
 * Automatically clears the stored room code and allows the sync to proceed normally
 * @param {string} expectedId - The session ID we expected
 * @param {string} actualId - The session ID we received
 * @param {Y.Doc} sessionDoc - The session doc that was synced
 */
function handleSessionIdCollision(expectedId, actualId, sessionDoc) {
  console.warn('Session ID collision detected: expected', expectedId, 'but got', actualId);
  console.log('Auto-clearing stored room code and proceeding with sync');
  
  // Clear the stored room code since this room now belongs to a different session
  // This prevents future auto-reconnect attempts from detecting the collision again
  saveSessionSyncRoom(null);
  
  // The sync is already connected and working - just let it continue
  // The user is now effectively joining as a new participant in the remote session
  // Normal sync messages will be shown by the regular sync flow
}

/**
 * Repair/build the sessionSyncRooms cache from individual session docs
 * Called during init to ensure cache is populated for dropdown display
 * DEFENSE: Also detects and cleans up duplicate room codes and expired rooms
 * @returns {Promise<boolean>} True if repair was performed
 */
async function repairSessionSyncRoomsCache() {
  var globalDoc = typeof getGlobalDoc === 'function' ? getGlobalDoc() : null;
  if (!globalDoc) return false;
  
  var meta = globalDoc.getMap('meta');
  var sessionOrder = typeof get_session_order === 'function' ? get_session_order() : [];
  
  if (!sessionOrder || sessionOrder.length === 0) {
    return false; // No sessions to repair
  }
  
  // Check if cache exists
  var sessionSyncRooms = meta.get('sessionSyncRooms');
  
  // Always rebuild cache to ensure it's current
  console.log('Building sessionSyncRooms cache...');
  
  var syncRoomMap = new Map();
  // DEFENSE: Track room codes to detect duplicates
  var roomToSessionMap = new Map(); // room code -> first session that had it
  var duplicatesToClean = []; // { sessionId, roomCode } entries to clean
  var expiredToClean = []; // { sessionId, roomCode } entries to clean
  
  for (var i = 0; i < sessionOrder.length; i++) {
    var sessionId = sessionOrder[i];
    
    // Load the session doc from IndexedDB if not already loaded
    var sessionDoc = typeof initSessionDoc === 'function' ? await initSessionDoc(sessionId) : null;
    if (!sessionDoc) continue;
    
    var session = sessionDoc.getMap('session');
    if (!session) continue;
    
    var config = session.get('config');
    if (!config) continue;
    
    var syncRoom = config.get('syncRoom');
    var syncCreatedAt = config.get('syncCreatedAt');
    
    if (syncRoom) {
      // DEFENSE: Check if this room code has expired (12 hours)
      if (isSyncRoomExpired(syncCreatedAt)) {
        console.warn('DEFENSE: Detected expired room code "' + syncRoom + 
                    '" in session ' + sessionId + ' (created ' + 
                    Math.round((Date.now() - syncCreatedAt) / 3600000) + ' hours ago)');
        expiredToClean.push({ sessionId: sessionId, roomCode: syncRoom, sessionDoc: sessionDoc, config: config });
        continue; // Don't add to map
      }
      
      // DEFENSE: Check if this room code was already seen in another session
      if (roomToSessionMap.has(syncRoom)) {
        // This is a duplicate! Mark for cleanup
        console.warn('DEFENSE: Detected duplicate room code "' + syncRoom + 
                    '" in session ' + sessionId + ' (already in ' + 
                    roomToSessionMap.get(syncRoom) + ')');
        duplicatesToClean.push({ sessionId: sessionId, roomCode: syncRoom, sessionDoc: sessionDoc, config: config });
      } else {
        // First occurrence - keep it
        roomToSessionMap.set(syncRoom, sessionId);
        syncRoomMap.set(sessionId, syncRoom);
      }
    }
  }
  
  // DEFENSE: Clean up expired rooms
  if (expiredToClean.length > 0) {
    console.warn('DEFENSE: Cleaning up ' + expiredToClean.length + ' expired room code(s)');
    for (var k = 0; k < expiredToClean.length; k++) {
      var exp = expiredToClean[k];
      exp.config.delete('syncRoom');
      exp.config.delete('syncCreatedAt');
      exp.config.delete('syncSessionId');
      console.log('Cleared expired room code from session ' + exp.sessionId);
    }
  }
  
  // DEFENSE: Clean up duplicates
  if (duplicatesToClean.length > 0) {
    console.warn('DEFENSE: Cleaning up ' + duplicatesToClean.length + ' duplicate room code(s)');
    for (var j = 0; j < duplicatesToClean.length; j++) {
      var dup = duplicatesToClean[j];
      dup.config.delete('syncRoom');
      dup.config.delete('syncCreatedAt');
      dup.config.delete('syncSessionId');
      console.log('Cleared duplicate room code from session ' + dup.sessionId);
    }
  }
  
  // Update global doc with cache (only non-duplicate, non-expired entries)
  if (syncRoomMap.size > 0 || sessionSyncRooms) {
    globalDoc.transact(function() {
      var newSessionSyncRooms = new Y.Map();
      syncRoomMap.forEach(function(room, sessionId) {
        newSessionSyncRooms.set(sessionId, room);
      });
      meta.set('sessionSyncRooms', newSessionSyncRooms);
    }, 'repair');
    
    var cleanedCount = expiredToClean.length + duplicatesToClean.length;
    console.log('Built sessionSyncRooms cache with ' + syncRoomMap.size + ' entries' +
               (cleanedCount > 0 ? ' (cleaned ' + cleanedCount + ' expired/duplicates)' : ''));
  }
  
  return syncRoomMap.size > 0;
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
  
  // Check for expired large event sync (connected on a previous day)
  if (isLargeEventSyncExpired()) {
    clearExpiredLargeEventSync();
    console.log('Cleared expired large event sync metadata');
  }
  
  // Build sync rooms cache for dropdown display
  // IMPORTANT: Wait for this to complete before auto-reconnect
  // This ensures duplicate room codes are cleaned up first (DEFENSE 2)
  repairSessionSyncRoomsCache().then(function(wasBuilt) {
    if (wasBuilt && typeof sync_data_to_display === 'function') {
      sync_data_to_display(); // Refresh display to show sync icons
    }
    
    // Attempt auto-reconnect AFTER cache repair completes
    // This ensures DEFENSE 2 has cleaned up duplicates first
    waitForSessionDocAndReconnect();
  }).catch(function(err) {
    console.error('Error building sessionSyncRooms cache:', err);
    // Still try to auto-reconnect even if cache repair failed
    waitForSessionDocAndReconnect();
  });
  
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
    // Use 'create' join choice since this session already has the synced data
    // 'create' uses the current session as-is (no new session creation)
    // 'merge' would incorrectly create a new empty session
    // Pass isReconnect: true to skip saving room code (avoids clearing from other sessions)
    await startSync(savedName, sessionRoom, null, 'create', { isReconnect: true });
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
 * @param {string} [joinChoice] - 'create' | 'join' | 'merge' (how to handle joining)
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.isReconnect] - True if this is an auto-reconnect (skip saving room code)
 * @param {number} [options._retryCount] - Internal: number of room code regeneration attempts
 * @returns {Promise<string>} Room code on success
 */
async function startSync(displayName, roomCode, password, joinChoice, options) {
  var isReconnect = options && options.isReconnect;
  var retryCount = (options && options._retryCount) || 0;
  var MAX_ROOM_RETRIES = 5;  // Max attempts to find an unused room code
  
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
  
  // Handle join choice - determine which session doc to use
  var sessionDoc;
  var isJoiningExistingRoom = !!roomCode && (joinChoice === 'join' || joinChoice === 'merge');
  
  if (joinChoice === 'join') {
    // SAFE JOIN: Create an empty session that will receive remote data
    // This prevents the LWW data loss bug by connecting an empty doc
    var newSessionId = await createEmptySessionForSync();
    if (!newSessionId) {
      throw new Error('Failed to create session for sync');
    }
    sessionDoc = getActiveSessionDoc();
    
    // Show loading state while waiting for sync data
    if (typeof showSyncLoadingState === 'function') {
      showSyncLoadingState();
    }
  } else if (joinChoice === 'merge') {
    // MERGE: User wants to add their local data to the synced session
    // First capture current session data before we switch to an empty session
    SyncManager.pendingMergeData = captureSessionDataForMerge();
    
    // Create an empty session that will receive remote data first
    var newSessionId = await createEmptySessionForSync();
    if (!newSessionId) {
      throw new Error('Failed to create session for sync');
    }
    sessionDoc = getActiveSessionDoc();
    
    // Show loading state while waiting for sync data
    if (typeof showSyncLoadingState === 'function') {
      showSyncLoadingState();
    }
  } else {
    // CREATE: User is creating a new room with their current session
    // 'create' or undefined - use current session as-is
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
  SyncManager.joinChoice = joinChoice || 'create';  // Store for reconnection
  
  // Persist display name to global Yjs doc
  saveDisplayName(displayName);
  
  // Save room code to session doc for auto-reconnect
  // SKIP on reconnect to avoid DEFENSE 1 clearing from other sessions
  // (the room code is already saved from the original sync)
  if (!isReconnect) {
    saveSessionSyncRoom(finalRoomCode);
    // Save join choice for reconnection
    saveSessionJoinChoice(joinChoice || 'create');
  }
  
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
        
        // Clear the awaiting sync flag if we received data
        clearAwaitingSyncFlag(sessionDoc);
        
        // Update session name cache from session doc (in case name changed remotely)
        updateSessionNameCache(SyncManager.syncedSessionId, sessionDoc);
        
        // Hide loading state
        if (typeof hideSyncLoadingState === 'function') {
          hideSyncLoadingState();
        }
        
        // Use debounced refresh to batch rapid updates and avoid interrupting user input
        if (typeof sync_data_to_display_debounced === 'function') {
          sync_data_to_display_debounced();
        } else if (typeof sync_data_to_display === 'function') {
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
      
      if (event.synced) {
        // Clear the awaiting sync flag
        clearAwaitingSyncFlag(sessionDoc);
        
        // Hide loading state
        if (typeof hideSyncLoadingState === 'function') {
          hideSyncLoadingState();
        }
        
        // DEFENSE: Check for session ID collision (different user with same room code)
        // Only check on reconnect (when we have a stored session ID to compare against)
        if (isReconnect) {
          var storedSessionId = getSyncSessionId();
          var remoteSessionId = getRemoteSessionIdFromDoc(sessionDoc);
          
          if (storedSessionId && remoteSessionId && storedSessionId !== remoteSessionId) {
            console.warn('DEFENSE: Session ID collision detected!',
                        'Expected:', storedSessionId, 'Got:', remoteSessionId);
            handleSessionIdCollision(storedSessionId, remoteSessionId, sessionDoc);
            // Continue with sync - handleSessionIdCollision just clears the stored room code
          }
        }
        
        // Handle merge if that was the join choice
        if (SyncManager.state === 'connecting' && joinChoice === 'merge') {
          handleMergeAfterSync();
        }
        
        // Refresh display with synced data
        if (typeof sync_data_to_display === 'function') {
          sync_data_to_display();
        }
      }
    });
    
    SyncManager.provider.on('peers', function(event) {
      console.log('WebRTC peers changed:', event.webrtcPeers);
      updatePeersFromAwareness();
      updateSyncUI();
      
      // Detect when all WebRTC peers disconnect and proactively trigger reconnection
      // This handles cases where peers disconnect but signaling is still connected
      if (event.webrtcPeers && event.webrtcPeers.length === 0 && 
          SyncManager.state === 'connected' && SyncManager.roomCode) {
        console.log('All WebRTC peers disconnected, triggering reconnection');
        // Don't fully disconnect - just trigger reconnection attempt
        // to re-announce ourselves to the signaling server
        clearRetryTimeout();
        retryConnection(0);
      }
    });
    
    // Wait for initial connection (with timeout)
    await waitForConnection(10000);
    
    // DEFENSE 3: Check for room code collision when CREATING a room
    // If we're creating (not joining) and find other peers, the room code is already in use
    // Regenerate a new code and try again
    var isCreating = !roomCode && (joinChoice === 'create' || !joinChoice);
    if (isCreating && !isReconnect) {
      // Wait a brief moment for peer discovery
      await new Promise(function(resolve) { setTimeout(resolve, 500); });
      
      // Check if there are other peers in the room (excluding ourselves)
      var otherPeersCount = SyncManager.peers.size;
      if (otherPeersCount > 0) {
        console.warn('DEFENSE 3: Room code collision! Found', otherPeersCount, 
                    'existing peer(s) in room', finalRoomCode);
        
        if (retryCount >= MAX_ROOM_RETRIES) {
          console.error('DEFENSE 3: Max retries reached, using room anyway');
          showToast(t('sync.room_collision_warning'));
        } else {
          console.log('DEFENSE 3: Regenerating room code, attempt', retryCount + 1);
          
          // Disconnect from this room
          if (SyncManager.provider) {
            SyncManager.provider.destroy();
            SyncManager.provider = null;
          }
          
          // Generate a new room code and try again
          var newOptions = { isReconnect: isReconnect, _retryCount: retryCount + 1 };
          return startSync(displayName, null, password, joinChoice, newOptions);
        }
      }
    }
    
    SyncManager.state = 'connected';
    updateSyncUI();
    
    if (SyncManager.onStateChange) {
      SyncManager.onStateChange('connected');
    }
    
    return finalRoomCode;
    
  } catch (error) {
    console.error('Failed to start sync:', error);
    SyncManager.state = 'error';
    
    // Hide loading state on error
    if (typeof hideSyncLoadingState === 'function') {
      hideSyncLoadingState();
    }
    
    updateSyncUI();
    
    if (SyncManager.onError) {
      SyncManager.onError(error);
    }
    
    throw error;
  }
}

/**
 * Clear the isAwaitingSync flag from a session doc
 * Called when remote data is received
 * @param {Y.Doc} sessionDoc - Session document
 */
function clearAwaitingSyncFlag(sessionDoc) {
  if (!sessionDoc) return;
  
  var session = sessionDoc.getMap('session');
  if (session && session.get('isAwaitingSync')) {
    sessionDoc.transact(function() {
      session.delete('isAwaitingSync');
    }, 'local');
  }
}

/**
 * Save join choice to session doc for reconnection
 * @param {string} joinChoice - 'create' | 'join' | 'merge'
 * @param {string} [sessionId] - Session UUID (optional, uses current if not provided)
 */
function saveSessionJoinChoice(joinChoice, sessionId) {
  var doc = sessionId ? getSessionDoc(sessionId) : getActiveSessionDoc();
  if (!doc) return;
  
  var session = doc.getMap('session');
  if (!session) return;
  
  var config = session.get('config');
  if (config) {
    config.set('syncJoinChoice', joinChoice);
  }
}

/**
 * Get saved join choice from session doc
 * @param {string} [sessionId] - Session UUID (optional, uses current if not provided)
 * @returns {string|null} Join choice or null
 */
function getSessionJoinChoice(sessionId) {
  var doc = sessionId ? getSessionDoc(sessionId) : getActiveSessionDoc();
  if (!doc) return null;
  
  var session = doc.getMap('session');
  if (!session) return null;
  
  var config = session.get('config');
  if (config) {
    return config.get('syncJoinChoice') || null;
  }
  return null;
}

/**
 * Show loading state while waiting for sync data
 */
function showSyncLoadingState() {
  // Show a loading overlay or update the UI to indicate waiting for data
  var loadingOverlay = document.getElementById('sync-loading-overlay');
  if (!loadingOverlay) {
    loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'sync-loading-overlay';
    loadingOverlay.className = 'sync-loading-overlay';
    loadingOverlay.innerHTML = '<div class="sync-loading-content">' +
      '<div class="sync-loading-spinner"></div>' +
      '<p>' + t('sync.receiving_data') + '</p>' +
    '</div>';
    document.body.appendChild(loadingOverlay);
  }
  loadingOverlay.style.display = 'flex';
}

/**
 * Hide loading state after sync data received
 */
function hideSyncLoadingState() {
  var loadingOverlay = document.getElementById('sync-loading-overlay');
  if (loadingOverlay) {
    loadingOverlay.style.display = 'none';
  }
}

/**
 * Handle merge after initial sync is complete
 * Creates backup of synced session and then performs additive merge
 */
async function handleMergeAfterSync() {
  // This is where the advanced merge would be triggered
  // For now, just log - the full merge implementation will be added
  console.log('Merge after sync - would trigger safeAdditiveMerge');
  
  // The merge happens through pendingMergeData stored before connecting
  if (SyncManager.pendingMergeData) {
    await performSafeAdditiveMerge(SyncManager.pendingMergeData);
    SyncManager.pendingMergeData = null;
  }
}

/**
 * Capture current session data for merge (before connecting to room)
 * Supports both v3 (index-based) and v4 (UUID-based) sessions.
 * @returns {Object|null} Captured data or null if session is empty
 */
function captureSessionDataForMerge() {
  var sessionDoc = getActiveSessionDoc();
  if (!sessionDoc) return null;
  
  var session = sessionDoc.getMap('session');
  if (!session) return null;
  
  // Check if v4 (UUID-based) session
  if (typeof isUUIDSession === 'function' && isUUIDSession(session)) {
    var orderedTeams = getOrderedTeams(session);
    var orderedBlocks = getOrderedBlocks(session);
    var orderedQuestions = getOrderedQuestions(session);
    
    var hasTeams = orderedTeams.length > 0;
    var hasQuestions = orderedQuestions.length > 0;
    
    if (!hasTeams && !hasQuestions) {
      return null;
    }
    
    return {
      isV4: true,
      teams: orderedTeams,
      blocks: orderedBlocks,
      questions: orderedQuestions
    };
  }
  
  // V3 (index-based) session
  var teams = session.get('teams');
  var blocks = session.get('blocks');
  var questions = session.get('questions');
  
  // Check if session has meaningful data
  var hasTeams = teams && teams.length > 1;
  var hasQuestions = questions && questions.length > 1;
  
  if (!hasTeams && !hasQuestions) {
    return null; // Nothing to merge
  }
  
  return {
    isV4: false,
    teams: teams ? teams.toArray() : [],
    blocks: blocks ? blocks.toArray() : [],
    questions: questions ? questions.toArray() : []
  };
}

/**
 * Perform safe additive merge - adds only unmatched items from local to synced session
 * Creates backup before merging and shows preview dialog
 * Supports both v3 (index-based) and v4 (UUID-based) sessions.
 * @param {Object} localData - Captured local data (teams, blocks, questions)
 * @returns {Promise<boolean>} True if merge completed
 */
async function performSafeAdditiveMerge(localData) {
  if (!localData) return false;
  
  var sessionId = typeof get_current_session_id === 'function' ? get_current_session_id() : null;
  if (!sessionId) return false;
  
  // Step 1: Create backup of synced session BEFORE merge
  if (typeof createSessionBackup === 'function') {
    var backup = await createSessionBackup(sessionId, BackupReason.PRE_MERGE);
    if (!backup) {
      console.warn('performSafeAdditiveMerge: Failed to create backup');
      // Continue anyway - data is still in Yjs
    }
  }
  
  var sessionDoc = getActiveSessionDoc();
  var session = sessionDoc.getMap('session');
  
  // Check if current session is v4 (UUID-based)
  var isCurrentSessionV4 = typeof isUUIDSession === 'function' && isUUIDSession(session);
  
  // Step 2: Compare names to find unmatched items
  var existingTeamNames = new Set();
  var existingBlockNames = new Set();
  
  if (isCurrentSessionV4) {
    // V4: Use ordered getter functions
    var orderedTeams = getOrderedTeams(session);
    for (var i = 0; i < orderedTeams.length; i++) {
      var teamName = orderedTeams[i].data.get('name');
      if (teamName) {
        existingTeamNames.add(teamName.toLowerCase());
      }
    }
    
    var orderedBlocks = getOrderedBlocks(session);
    for (var i = 0; i < orderedBlocks.length; i++) {
      var blockName = orderedBlocks[i].data.get('name');
      if (blockName) {
        existingBlockNames.add(blockName.toLowerCase());
      }
    }
  } else {
    // V3: Use index-based arrays
    var remoteTeams = session.get('teams');
    var remoteBlocks = session.get('blocks');
    
    if (remoteTeams) {
      for (var i = 1; i < remoteTeams.length; i++) {
        var t = remoteTeams.get(i);
        if (t && t.get('name')) {
          existingTeamNames.add(t.get('name').toLowerCase());
        }
      }
    }
    
    if (remoteBlocks) {
      for (var i = 0; i < remoteBlocks.length; i++) {
        var b = remoteBlocks.get(i);
        if (b && b.get('name')) {
          existingBlockNames.add(b.get('name').toLowerCase());
        }
      }
    }
  }
  
  // Find unmatched local items (handle both v4 and v3 local data)
  var unmatchedTeams = [];
  var unmatchedBlocks = [];
  
  if (localData.isV4) {
    // V4 local data: teams is array of {id, data} objects
    for (var i = 0; i < localData.teams.length; i++) {
      var team = localData.teams[i];
      var name = team.data.get('name');
      if (name && !existingTeamNames.has(name.toLowerCase())) {
        unmatchedTeams.push({ index: i, name: name, data: team.data, id: team.id });
      }
    }
    
    for (var i = 0; i < localData.blocks.length; i++) {
      var block = localData.blocks[i];
      var name = block.data.get('name');
      if (name && !existingBlockNames.has(name.toLowerCase())) {
        unmatchedBlocks.push({ index: i, name: name, data: block.data, id: block.id });
      }
    }
  } else {
    // V3 local data: teams is array of Y.Maps
    for (var i = 1; i < localData.teams.length; i++) {
      var team = localData.teams[i];
      if (team && team.get && team.get('name')) {
        var name = team.get('name');
        if (!existingTeamNames.has(name.toLowerCase())) {
          unmatchedTeams.push({ index: i, name: name, data: team });
        }
      }
    }
    
    for (var i = 0; i < localData.blocks.length; i++) {
      var block = localData.blocks[i];
      if (block && block.get && block.get('name')) {
        var name = block.get('name');
        if (!existingBlockNames.has(name.toLowerCase())) {
          unmatchedBlocks.push({ index: i, name: name, data: block });
        }
      }
    }
  }
  
  // If nothing to merge, show message and return
  if (unmatchedTeams.length === 0 && unmatchedBlocks.length === 0) {
    if (typeof showToast === 'function') {
      showToast(t('sync.merge_nothing_to_add'));
    }
    return true;
  }
  
  // Step 3: Show preview dialog
  var confirmed = await showMergePreviewDialog(unmatchedTeams, unmatchedBlocks, []);
  if (!confirmed) {
    if (typeof showToast === 'function') {
      showToast(t('sync.merge_cancelled'));
    }
    return false;
  }
  
  // Step 4: Apply the merge (add unmatched items)
  sessionDoc.transact(function() {
    if (isCurrentSessionV4) {
      // V4: Add to teamsById/blocksById and order arrays
      var teamsById = session.get('teamsById');
      var teamOrder = session.get('teamOrder');
      var blocksById = session.get('blocksById');
      var blockOrder = session.get('blockOrder');
      
      for (var i = 0; i < unmatchedTeams.length; i++) {
        var teamData = unmatchedTeams[i].data;
        var teamId = generateTeamId();
        var newTeam = new Y.Map();
        newTeam.set('id', teamId);
        newTeam.set('name', teamData.get ? teamData.get('name') : teamData.name);
        newTeam.set('createdAt', Date.now());
        newTeam.set('deleted', false);
        newTeam.set('sortOrder', teamOrder.length);
        teamsById.set(teamId, newTeam);
        teamOrder.push([teamId]);
      }
      
      for (var i = 0; i < unmatchedBlocks.length; i++) {
        var blockData = unmatchedBlocks[i].data;
        var blockId = generateBlockId();
        var newBlock = new Y.Map();
        newBlock.set('id', blockId);
        newBlock.set('name', blockData.get ? blockData.get('name') : blockData.name);
        newBlock.set('isDefault', false);
        newBlock.set('createdAt', Date.now());
        newBlock.set('deleted', false);
        newBlock.set('sortOrder', blockOrder.length);
        blocksById.set(blockId, newBlock);
        blockOrder.push([blockId]);
      }
    } else {
      // V3: Add to arrays
      var remoteTeams = session.get('teams');
      var remoteBlocks = session.get('blocks');
      
      for (var i = 0; i < unmatchedTeams.length; i++) {
        var teamData = unmatchedTeams[i].data;
        var newTeam = new Y.Map();
        if (teamData.forEach) {
          teamData.forEach(function(value, key) {
            newTeam.set(key, value);
          });
        }
        remoteTeams.push([newTeam]);
      }
      
      for (var i = 0; i < unmatchedBlocks.length; i++) {
        var blockData = unmatchedBlocks[i].data;
        var newBlock = new Y.Map();
        if (blockData.forEach) {
          blockData.forEach(function(value, key) {
            newBlock.set(key, value);
          });
        }
        remoteBlocks.push([newBlock]);
      }
    }
  }, 'local');
  
  // Step 5: Log and notify
  if (typeof add_history_entry === 'function') {
    add_history_entry(
      'edit_log.actions.merge',
      'edit_log.details_templates.merged_items',
      { 
        teams: unmatchedTeams.length,
        blocks: unmatchedBlocks.length
      }
    );
  }
  
  if (typeof showToast === 'function') {
    showToast(t('sync.merge_complete', {
      teams: unmatchedTeams.length,
      blocks: unmatchedBlocks.length
    }));
  }
  
  if (typeof sync_data_to_display === 'function') {
    sync_data_to_display();
  }
  return true;
}

/**
 * Show preview dialog for merge operation
 * @param {Array} teams - Unmatched teams to add
 * @param {Array} blocks - Unmatched blocks to add  
 * @param {Array} questions - Unmatched questions to add (future)
 * @returns {Promise<boolean>} True if user confirms
 */
function showMergePreviewDialog(teams, blocks, questions) {
  return new Promise(function(resolve) {
    var overlay = document.createElement('div');
    overlay.id = 'merge-preview-overlay';
    overlay.className = 'sync-dialog-overlay';
    
    var teamList = teams.map(function(t) { return t.name; }).join(', ') || t('sync.merge_none');
    var blockList = blocks.map(function(b) { return b.name; }).join(', ') || t('sync.merge_none');
    
    overlay.innerHTML = '<div class="sync-dialog" role="dialog" aria-modal="true">' +
      '<h2>' + t('sync.merge_preview_title') + '</h2>' +
      '<p>' + t('sync.merge_preview_description') + '</p>' +
      '<div class="merge-preview-section">' +
        '<h4>' + t('sync.merge_teams_to_add', { count: teams.length }) + '</h4>' +
        '<p class="merge-item-list">' + teamList + '</p>' +
      '</div>' +
      '<div class="merge-preview-section">' +
        '<h4>' + t('sync.merge_blocks_to_add', { count: blocks.length }) + '</h4>' +
        '<p class="merge-item-list">' + blockList + '</p>' +
      '</div>' +
      '<p class="merge-backup-note">' + t('sync.merge_backup_note') + '</p>' +
      '<div class="button-row">' +
        '<button type="button" class="cancel-btn">' + t('sync.cancel_button') + '</button>' +
        '<button type="button" class="confirm-btn primary">' + t('sync.merge_confirm_button') + '</button>' +
      '</div>' +
    '</div>';
    
    document.body.appendChild(overlay);
    
    var cancelBtn = overlay.querySelector('.cancel-btn');
    var confirmBtn = overlay.querySelector('.confirm-btn');
    
    function close(result) {
      overlay.remove();
      resolve(result);
    }
    
    cancelBtn.onclick = function() { close(false); };
    confirmBtn.onclick = function() { close(true); };
    overlay.onclick = function(e) {
      if (e.target === overlay) close(false);
    };
    
    // Keyboard handling
    overlay.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        close(false);
      }
    });
    
    confirmBtn.focus();
  });
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
  
  // Destroy WebSocket provider (for large events)
  if (SyncManager.wsProvider) {
    SyncManager.wsProvider.destroy();
    SyncManager.wsProvider = null;
  }
  
  // Clear websocket sync metadata from session if it was a websocket connection
  if (clearSessionRoom && SyncManager.connectionType === 'websocket') {
    clearExpiredLargeEventSync();
  }
  
  // Clear awareness
  SyncManager.awareness = null;
  
  // Reset state
  SyncManager.state = 'offline';
  SyncManager.roomCode = null;
  SyncManager.syncedSessionId = null;
  SyncManager.connectionType = 'webrtc'; // Reset to default
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
 * Retries forever (at least every 30 seconds) until connection succeeds
 * @param {number} attempt - Current attempt number
 */
async function retryConnection(attempt) {
  // Calculate delay with exponential backoff, capped at 30 seconds
  // After 5 attempts (1s, 2s, 4s, 8s, 16s), stays at 30s forever
  var delay = Math.min(1000 * Math.pow(2, attempt), 30000);
  console.log('Retry attempt ' + (attempt + 1) + ' in ' + delay + 'ms');
  
  SyncManager.retryAttempt = attempt;
  SyncManager.state = 'error';
  updateSyncUI();
  
  // Show reconnecting status periodically (not every attempt to avoid spam)
  if (attempt === 0 || attempt % 5 === 0) {
    showToast(t('sync.reconnecting'));
    announceToScreenReader(t('sync.reconnecting'));
  }
  
  SyncManager.retryTimeout = setTimeout(async function() {
    try {
      // Check if we're still offline - keep retrying at 30s intervals
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
    '<h2 id="sync-dialog-title">' + t('sync.dialog_title') + 
      ' <a href="#" class="sync-info-link" onclick="showSyncInfoDialog(); return false;" title="' + t('sync.info_link_title') + '">ⓘ</a>' +
    '</h2>' +
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
 * Show the sync info dialog explaining P2P limitations
 */
function showSyncInfoDialog() {
  // Remove any existing info dialog
  var existing = document.getElementById('sync-info-dialog-overlay');
  if (existing) existing.remove();
  
  var overlay = document.createElement('div');
  overlay.id = 'sync-info-dialog-overlay';
  overlay.className = 'sync-dialog-overlay';
  
  overlay.innerHTML = '<div class="sync-dialog sync-info-dialog" role="dialog" aria-labelledby="sync-info-dialog-title" aria-modal="true">' +
    '<h2 id="sync-info-dialog-title">' + t('sync.info_dialog_title') + '</h2>' +
    '<p>' + t('sync.info_dialog_p2p') + '</p>' +
    '<p><strong>' + t('sync.info_dialog_limit') + '</strong></p>' +
    '<p>' + t('sync.info_dialog_larger') + '</p>' +
    '<p><a href="#" id="large-event-link" class="large-event-link">' +
      '<span aria-hidden="true">🔗</span> ' + t('sync.info_dialog_large_link') +
    '</a></p>' +
    '<div class="button-row">' +
      '<button type="button" onclick="closeSyncInfoDialog()" class="primary">' + t('sync.info_dialog_close') + '</button>' +
    '</div>' +
  '</div>';
  
  document.body.appendChild(overlay);
  
  // Handle large event link click
  var largeEventLink = document.getElementById('large-event-link');
  if (largeEventLink) {
    largeEventLink.addEventListener('click', function(e) {
      e.preventDefault();
      closeSyncInfoDialog();
      showLargeEventDialog();
    });
  }
  
  // Focus the close button
  var closeBtn = overlay.querySelector('button');
  if (closeBtn) closeBtn.focus();
  
  // Close on overlay click
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      closeSyncInfoDialog();
    }
  });
  
  // Close on Escape key
  function infoDialogKeyHandler(e) {
    if (e.key === 'Escape') {
      closeSyncInfoDialog();
      document.removeEventListener('keydown', infoDialogKeyHandler);
    }
  }
  document.addEventListener('keydown', infoDialogKeyHandler);
}

/**
 * Close the sync info dialog
 */
function closeSyncInfoDialog() {
  var overlay = document.getElementById('sync-info-dialog-overlay');
  if (overlay) overlay.remove();
}

/**
 * Show the large event sync dialog
 */
function showLargeEventDialog() {
  // Remove any existing dialog
  var existing = document.getElementById('large-event-dialog-overlay');
  if (existing) existing.remove();
  
  var overlay = document.createElement('div');
  overlay.id = 'large-event-dialog-overlay';
  overlay.className = 'sync-dialog-overlay';
  
  overlay.innerHTML = '<div class="sync-dialog large-event-dialog" role="dialog" aria-labelledby="large-event-dialog-title" aria-modal="true">' +
    '<h2 id="large-event-dialog-title">' + t('sync.large_dialog_title') + '</h2>' +
    '<p class="large-event-description">' + t('sync.large_dialog_description') + '</p>' +
    '<form id="large-event-form">' +
      '<div class="form-group">' +
        '<label for="large-event-display-name">' + t('sync.label_display_name') + '</label>' +
        '<input type="text" id="large-event-display-name" required maxlength="50" autocomplete="off" placeholder="' + t('sync.placeholder_display_name') + '">' +
      '</div>' +
      '<fieldset class="mode-toggle">' +
        '<legend class="visually-hidden">' + t('sync.large_mode_label') + '</legend>' +
        '<div class="radio-group">' +
          '<label class="radio-label">' +
            '<input type="radio" name="large-event-mode" value="create" checked>' +
            '<span>' + t('sync.large_mode_create') + '</span>' +
          '</label>' +
          '<label class="radio-label">' +
            '<input type="radio" name="large-event-mode" value="join">' +
            '<span>' + t('sync.large_mode_join') + '</span>' +
          '</label>' +
        '</div>' +
      '</fieldset>' +
      '<div class="form-group" id="large-event-room-group" style="display: none;">' +
        '<label for="large-event-room">' + t('sync.label_room') + '</label>' +
        '<input type="text" id="large-event-room" maxlength="8" autocomplete="off" placeholder="L-ABC123" pattern="L-[A-Z2-9]{6}">' +
        '<small class="help-text">' + t('sync.large_room_help') + '</small>' +
      '</div>' +
      '<div class="form-group">' +
        '<label for="large-event-password">' + t('sync.label_password') + ' <span class="required-indicator">*</span></label>' +
        '<input type="password" id="large-event-password" required minlength="4" autocomplete="off">' +
        '<small class="help-text">' + t('sync.large_password_help') + '</small>' +
      '</div>' +
      '<p class="expiry-notice">' +
        '<span aria-hidden="true">⏰</span> ' + t('sync.large_expiry_notice') +
      '</p>' +
      '<div id="large-event-error" class="error-message" role="alert" style="display: none;"></div>' +
      '<div class="button-row">' +
        '<button type="button" onclick="closeLargeEventDialog()">' + t('sync.button_cancel') + '</button>' +
        '<button type="submit" class="primary" id="large-event-connect">' + t('sync.large_button_connect') + '</button>' +
      '</div>' +
    '</form>' +
  '</div>';
  
  document.body.appendChild(overlay);
  
  // Setup mode toggle listener
  var modeRadios = overlay.querySelectorAll('input[name="large-event-mode"]');
  var roomGroup = document.getElementById('large-event-room-group');
  var roomInput = document.getElementById('large-event-room');
  
  modeRadios.forEach(function(radio) {
    radio.addEventListener('change', function() {
      if (this.value === 'join') {
        roomGroup.style.display = 'block';
        roomInput.required = true;
      } else {
        roomGroup.style.display = 'none';
        roomInput.required = false;
      }
    });
  });
  
  // Handle form submission
  var form = document.getElementById('large-event-form');
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    handleLargeEventFormSubmit();
  });
  
  // Focus the display name input
  var displayNameInput = document.getElementById('large-event-display-name');
  if (displayNameInput) displayNameInput.focus();
  
  // Close on overlay click
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      closeLargeEventDialog();
    }
  });
  
  // Close on Escape key
  function largeEventKeyHandler(e) {
    if (e.key === 'Escape') {
      closeLargeEventDialog();
      document.removeEventListener('keydown', largeEventKeyHandler);
    }
  }
  document.addEventListener('keydown', largeEventKeyHandler);
}

/**
 * Close the large event sync dialog
 */
function closeLargeEventDialog() {
  var overlay = document.getElementById('large-event-dialog-overlay');
  if (overlay) overlay.remove();
}

/**
 * Handle large event form submission
 */
async function handleLargeEventFormSubmit() {
  var displayName = document.getElementById('large-event-display-name').value.trim();
  var mode = document.querySelector('input[name="large-event-mode"]:checked').value;
  var roomInput = document.getElementById('large-event-room');
  var password = document.getElementById('large-event-password').value;
  var errorDiv = document.getElementById('large-event-error');
  var connectButton = document.getElementById('large-event-connect');
  
  // Validate display name
  if (!displayName) {
    showLargeEventError(t('sync.error_display_name'));
    return;
  }
  
  // Validate password
  if (!password || password.length < 4) {
    showLargeEventError(t('sync.error_password'));
    return;
  }
  
  // Validate room code if joining
  var roomCode = '';
  if (mode === 'join') {
    roomCode = roomInput.value.trim().toUpperCase();
    if (!roomCode) {
      showLargeEventError(t('sync.error_room_required'));
      return;
    }
    // Normalize room code - remove L- prefix if present
    if (roomCode.startsWith('L-')) {
      roomCode = roomCode.substring(2);
    }
    // Validate format
    if (!/^[A-Z2-9]{6}$/.test(roomCode)) {
      showLargeEventError(t('sync.error_room_format'));
      return;
    }
  } else {
    // Generate new room code for create mode
    roomCode = generateRoomCode();
  }
  
  // Disable button during connection
  connectButton.disabled = true;
  connectButton.textContent = t('sync.connecting');
  errorDiv.style.display = 'none';
  
  try {
    await startWebsocketSync(displayName, roomCode, password);
    closeLargeEventDialog();
    
    // Show room code toast for create mode
    if (mode === 'create') {
      showToast(t('sync.large_room_created', { code: 'L-' + roomCode }));
    }
  } catch (error) {
    connectButton.disabled = false;
    connectButton.textContent = t('sync.large_button_connect');
    showLargeEventError(error.message || t('sync.error_connection'));
  }
}

/**
 * Show error message in large event dialog
 * @param {string} message - Error message to display
 */
function showLargeEventError(message) {
  var errorDiv = document.getElementById('large-event-error');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
}

/**
 * Start WebSocket-based sync for large events
 * @param {string} displayName - User's display name
 * @param {string} roomCode - 6-character room code (without L- prefix)
 * @param {string} password - Room password for encryption
 */
async function startWebsocketSync(displayName, roomCode, password) {
  // Stop any existing sync first
  if (SyncManager.state !== 'disconnected') {
    stopSync();
  }
  
  var sessionDoc = DocManager.getActiveSessionDoc();
  if (!sessionDoc) {
    throw new Error(t('sync.error_no_session'));
  }
  
  var fullRoomName = SyncManager.roomPrefixLarge + roomCode;
  
  // Store sync metadata in session
  var meta = sessionDoc.getMap('meta');
  meta.set('syncType', 'websocket');
  meta.set('syncRoomCode', roomCode);
  meta.set('syncConnectedDate', new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  
  // Create encrypted websocket provider
  SyncManager.wsProvider = new EncryptedWebsocketProvider(
    SyncManager.syncServer,
    fullRoomName,
    sessionDoc,
    password,
    {
      awareness: null // Will create internally
    }
  );
  
  // Wait for connection or timeout
  await new Promise(function(resolve, reject) {
    var timeout = setTimeout(function() {
      reject(new Error(t('sync.error_timeout')));
    }, 10000);
    
    SyncManager.wsProvider.on('status', function(event) {
      if (event.status === 'connected') {
        clearTimeout(timeout);
        resolve();
      }
    });
    
    SyncManager.wsProvider.on('connection-error', function(error) {
      clearTimeout(timeout);
      reject(new Error(t('sync.error_connection')));
    });
  });
  
  // Set up awareness
  var awareness = SyncManager.wsProvider.awareness;
  awareness.setLocalStateField('user', {
    name: displayName,
    color: getRandomColor()
  });
  
  // Store connection info
  SyncManager.state = 'connected';
  SyncManager.connectionType = 'websocket';
  SyncManager.roomCode = roomCode;
  SyncManager.displayName = displayName;
  SyncManager.awareness = awareness;
  SyncManager.sessionId = DocManager.getActiveSessionId();
  
  // Set up awareness change listener
  awareness.on('change', function() {
    updateSyncIndicator();
    updatePeerList();
  });
  
  updateSyncIndicator();
  announceForScreenReader(t('sync.connected_announcement', { code: 'L-' + roomCode }));
}

/**
 * Check if the current session's large event sync has expired
 * @returns {boolean} True if expired (connected on a previous day)
 */
function isLargeEventSyncExpired() {
  if (typeof DocManager === 'undefined') return false;
  var sessionDoc = DocManager.getActiveSessionDoc();
  if (!sessionDoc) return false;
  
  var meta = sessionDoc.getMap('meta');
  var syncType = meta.get('syncType');
  var connectedDate = meta.get('syncConnectedDate');
  
  if (syncType !== 'websocket' || !connectedDate) return false;
  
  var today = new Date().toISOString().split('T')[0];
  return connectedDate !== today;
}

/**
 * Clear expired large event sync metadata from session
 */
function clearExpiredLargeEventSync() {
  if (typeof DocManager === 'undefined') return;
  var sessionDoc = DocManager.getActiveSessionDoc();
  if (!sessionDoc) return;
  
  var meta = sessionDoc.getMap('meta');
  meta.delete('syncType');
  meta.delete('syncRoomCode');
  meta.delete('syncConnectedDate');
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
 * Default: Join and receive remote data. Advanced: Merge local data into synced session.
 * @returns {Promise<string|null>} 'join' | 'merge' | null (cancelled)
 */
async function showJoinChoiceDialog() {
  return new Promise(function(resolve) {
    var overlay = document.createElement('div');
    overlay.id = 'sync-dialog-overlay';
    overlay.className = 'sync-dialog-overlay';
    
    overlay.innerHTML = '<div class="sync-dialog sync-join-dialog" role="dialog" aria-labelledby="join-choice-title" aria-modal="true">' +
      '<h2 id="join-choice-title">' + t('sync.join_choice_title') + '</h2>' +
      '<p>' + t('sync.join_choice_description') + '</p>' +
      '<fieldset class="choice-group">' +
        '<legend class="visually-hidden">' + t('sync.join_choice_title') + '</legend>' +
        '<label class="choice-option choice-option-primary">' +
          '<input type="radio" name="join-choice" value="join" checked>' +
          '<div class="choice-content">' +
            '<strong>' + t('sync.join_choice_join_session') + '</strong>' +
            '<span class="choice-desc">' + t('sync.join_choice_join_session_desc') + '</span>' +
          '</div>' +
        '</label>' +
      '</fieldset>' +
      '<details class="advanced-options">' +
        '<summary>' + t('sync.join_advanced_options') + '</summary>' +
        '<div class="advanced-content">' +
          '<p class="advanced-warning">' +
            '<span aria-hidden="true">⚠️</span> ' + t('sync.join_merge_warning') +
          '</p>' +
          '<label class="choice-option">' +
            '<input type="radio" name="join-choice" value="merge">' +
            '<div class="choice-content">' +
              '<strong>' + t('sync.join_choice_merge_session') + '</strong>' +
              '<span class="choice-desc">' + t('sync.join_choice_merge_session_desc') + '</span>' +
            '</div>' +
          '</label>' +
        '</div>' +
      '</details>' +
      '<div class="button-row">' +
        '<button type="button" class="cancel-btn">' + t('sync.cancel_button') + '</button>' +
        '<button type="button" class="confirm-btn primary">' + t('sync.join_button') + '</button>' +
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
        var roomDisplay = SyncManager.roomCode || t('sync.status_connected');
        // Add L- prefix and server badge for websocket connections
        if (SyncManager.connectionType === 'websocket') {
          roomDisplay = 'L-' + roomDisplay;
        }
        syncStatus.textContent = roomDisplay;
        break;
      case 'error':
        syncStatus.textContent = t('sync.status_error');
        break;
      default:
        syncStatus.textContent = t('sync.button');
    }
  }
  
  // Update server badge visibility
  var serverBadge = document.getElementById('sync_server_badge');
  if (serverBadge) {
    if (SyncManager.state === 'connected' && SyncManager.connectionType === 'websocket') {
      serverBadge.style.display = 'inline-block';
      serverBadge.setAttribute('title', t('sync.server_badge_tooltip'));
    } else {
      serverBadge.style.display = 'none';
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
  
  // Get current data version (v4.0 for UUID-based, v3.0 for legacy)
  var currentDataVersion = (typeof DATA_VERSION_CURRENT !== 'undefined') ? DATA_VERSION_CURRENT : '3.0';
  var session = get_current_session();
  if (session && typeof isUUIDSession === 'function' && isUUIDSession(session)) {
    currentDataVersion = (typeof DATA_VERSION_UUID !== 'undefined') ? DATA_VERSION_UUID : '4.0';
  }
  
  // Set local state with data version
  awareness.setLocalState({
    displayName: SyncManager.displayName,
    color: generateUserColor(SyncManager.displayName),
    lastSeen: Date.now(),
    dataVersion: currentDataVersion
  });
  
  // Listen for changes
  awareness.on('change', function() {
    updatePeersFromAwareness();
    checkDataVersionCompatibility();
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
        lastSeen: state.lastSeen || Date.now(),
        dataVersion: state.dataVersion || '3.0'
      });
    }
  });
}

/**
 * Check data version compatibility with connected peers
 * Shows warning if peers have incompatible versions
 */
function checkDataVersionCompatibility() {
  if (!SyncManager.awareness || SyncManager.state !== 'connected') return;
  
  // Get our version
  var localState = SyncManager.awareness.getLocalState();
  var localVersion = localState ? localState.dataVersion : '3.0';
  
  // Check peer versions
  var incompatiblePeers = [];
  
  SyncManager.peers.forEach(function(peer, clientId) {
    var peerVersion = peer.dataVersion || '3.0';
    
    // Version compatibility: v3.0 and v4.0 can sync during migration
    // After full migration, update MIN_SYNC_VERSION to '4.0' to block v3 clients
    var minVersion = (typeof MIN_SYNC_VERSION !== 'undefined') ? MIN_SYNC_VERSION : '3.0';
    
    // Check if peer meets minimum version
    if (parseFloat(peerVersion) < parseFloat(minVersion)) {
      incompatiblePeers.push({
        name: peer.displayName,
        version: peerVersion,
        clientId: clientId
      });
    }
  });
  
  // Show warning if incompatible peers found
  if (incompatiblePeers.length > 0 && !SyncManager._versionWarningShown) {
    SyncManager._versionWarningShown = true;
    
    // Build warning message
    var peerNames = incompatiblePeers.map(function(p) { return p.name; }).join(', ');
    var message = t('sync.version_mismatch_warning', { 
      peers: peerNames,
      minVersion: (typeof MIN_SYNC_VERSION !== 'undefined') ? MIN_SYNC_VERSION : '3.0'
    });
    
    // Show toast notification
    if (typeof showToast === 'function') {
      showToast(message, 'warning');
    } else {
      console.warn('Sync version mismatch:', message);
    }
  }
  
  // Reset warning flag when no incompatible peers
  if (incompatiblePeers.length === 0) {
    SyncManager._versionWarningShown = false;
  }
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

// ============================================================================
// DEVICE MIGRATION FUNCTIONS
// ============================================================================

/**
 * Migration state tracking
 */
var MigrationState = {
  mode: null,           // 'send' or 'receive'
  roomCode: null,
  provider: null,
  globalDoc: null,
  sessionDocs: [],      // Array of session docs being synced
  currentSessionIndex: 0,
  totalSessions: 0,
  isComplete: false,
  error: null,
  peerConnected: false,
  previousFocus: null
};

/**
 * Show migration dialog
 * @param {string} mode - 'send' or 'receive'
 */
function showMigrationDialog(mode) {
  // Remove any existing dialog
  var existing = document.getElementById('migration-dialog-overlay');
  if (existing) existing.remove();
  
  MigrationState.mode = mode;
  MigrationState.previousFocus = document.activeElement;
  
  var overlay = document.createElement('div');
  overlay.id = 'migration-dialog-overlay';
  overlay.className = 'sync-dialog-overlay';
  
  if (mode === 'send') {
    overlay.innerHTML = createMigrationSendDialogHTML();
  } else {
    overlay.innerHTML = createMigrationReceiveDialogHTML();
  }
  
  document.body.appendChild(overlay);
  
  // Focus first input or button
  var firstFocusable = overlay.querySelector('input, button');
  if (firstFocusable) firstFocusable.focus();
  
  // Trap focus within dialog
  trapFocus(overlay);
  
  // Close on overlay click
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      closeMigrationDialog();
    }
  });
  
  // Close on Escape key
  document.addEventListener('keydown', handleMigrationDialogKeydown);
  
  // If sending, auto-generate room code and show it
  if (mode === 'send') {
    var roomCode = generateRoomCode();
    MigrationState.roomCode = roomCode;
    var codeDisplay = document.getElementById('migration-room-code-display');
    if (codeDisplay) {
      codeDisplay.textContent = roomCode;
    }
  }
}

/**
 * Create HTML for send migration dialog
 * @returns {string} Dialog HTML
 */
function createMigrationSendDialogHTML() {
  return '<div class="sync-dialog migration-dialog" role="dialog" aria-labelledby="migration-dialog-title" aria-modal="true">' +
    '<h2 id="migration-dialog-title">' + t('advanced.migration_send_title') + '</h2>' +
    '<p>' + t('advanced.migration_send_instructions') + '</p>' +
    '<div class="room-code-display" id="migration-room-code-display" aria-label="' + t('advanced.migration_room_code_label') + '">------</div>' +
    '<p class="info-text">' + t('advanced.migration_info') + '</p>' +
    '<div class="button-row">' +
      '<button type="button" onclick="closeMigrationDialog()">' + t('advanced.migration_cancel') + '</button>' +
      '<button type="button" onclick="handleStartMigrationSend()" class="primary">' + t('advanced.migration_start_send') + '</button>' +
    '</div>' +
  '</div>';
}

/**
 * Create HTML for receive migration dialog
 * @returns {string} Dialog HTML
 */
function createMigrationReceiveDialogHTML() {
  return '<div class="sync-dialog migration-dialog" role="dialog" aria-labelledby="migration-dialog-title" aria-modal="true">' +
    '<h2 id="migration-dialog-title">' + t('advanced.migration_receive_title') + '</h2>' +
    '<p>' + t('advanced.migration_receive_instructions') + '</p>' +
    '<div class="form-group">' +
      '<label for="migration-room-code">' + t('advanced.migration_room_code_label') + '</label>' +
      '<input type="text" id="migration-room-code" ' +
             'class="room-code-input" ' +
             'placeholder="' + t('advanced.migration_room_code_placeholder') + '" ' +
             'maxlength="6" ' +
             'autocomplete="off" ' +
             'autocorrect="off" ' +
             'autocapitalize="characters">' +
    '</div>' +
    '<p class="info-text">' + t('advanced.migration_info') + '</p>' +
    '<div class="button-row">' +
      '<button type="button" onclick="closeMigrationDialog()">' + t('advanced.migration_cancel') + '</button>' +
      '<button type="button" onclick="handleStartMigrationReceive()" class="primary">' + t('advanced.migration_start_receive') + '</button>' +
    '</div>' +
  '</div>';
}

/**
 * Create HTML for migration progress dialog
 * @returns {string} Dialog HTML
 */
function createMigrationProgressDialogHTML() {
  var statusClass = MigrationState.peerConnected ? 'connected' : 'waiting';
  var statusText = MigrationState.peerConnected 
    ? t('advanced.migration_connected')
    : t('advanced.migration_waiting');
  
  return '<div class="sync-dialog migration-dialog" role="dialog" aria-labelledby="migration-dialog-title" aria-modal="true">' +
    '<h2 id="migration-dialog-title">' + 
      (MigrationState.mode === 'send' ? t('advanced.migration_send_title') : t('advanced.migration_receive_title')) + 
    '</h2>' +
    '<div class="room-code-display">' + MigrationState.roomCode + '</div>' +
    '<div class="migration-progress">' +
      '<div class="migration-status ' + statusClass + '" id="migration-status">' + statusText + '</div>' +
      '<div class="migration-progress-bar">' +
        '<div class="migration-progress-bar-fill" id="migration-progress-fill" style="width: 0%;"></div>' +
      '</div>' +
      '<div id="migration-progress-text"></div>' +
    '</div>' +
    '<div class="button-row">' +
      '<button type="button" onclick="cancelMigration()">' + t('advanced.migration_cancel') + '</button>' +
    '</div>' +
  '</div>';
}

/**
 * Update migration dialog to show progress
 */
function showMigrationProgressDialog() {
  var dialog = document.querySelector('.migration-dialog');
  if (dialog) {
    dialog.outerHTML = createMigrationProgressDialogHTML();
  }
}

/**
 * Update migration progress display
 * @param {number} current - Current session index (1-based)
 * @param {number} total - Total sessions
 * @param {string} name - Current session name
 */
function updateMigrationProgress(current, total, name) {
  var statusEl = document.getElementById('migration-status');
  var progressFill = document.getElementById('migration-progress-fill');
  var progressText = document.getElementById('migration-progress-text');
  
  if (statusEl) {
    statusEl.textContent = t('advanced.migration_connected');
    statusEl.className = 'migration-status connected';
  }
  
  if (progressFill) {
    var percent = total > 0 ? Math.round((current / total) * 100) : 0;
    progressFill.style.width = percent + '%';
  }
  
  if (progressText) {
    progressText.textContent = t('advanced.migration_progress', {
      current: current,
      total: total,
      name: name
    });
  }
}

/**
 * Show migration complete
 * @param {number} count - Number of sessions transferred
 */
function showMigrationComplete(count) {
  var statusEl = document.getElementById('migration-status');
  var progressFill = document.getElementById('migration-progress-fill');
  var progressText = document.getElementById('migration-progress-text');
  var buttonRow = document.querySelector('.migration-dialog .button-row');
  
  if (statusEl) {
    statusEl.textContent = t('advanced.migration_complete', { count: count });
    statusEl.className = 'migration-status complete';
  }
  
  if (progressFill) {
    progressFill.style.width = '100%';
  }
  
  if (progressText) {
    progressText.textContent = '';
  }
  
  if (buttonRow) {
    buttonRow.innerHTML = '<button type="button" onclick="closeMigrationDialog()" class="primary">' + t('advanced.migration_close') + '</button>';
  }
  
  // Refresh display
  if (typeof sync_data_to_display === 'function') {
    sync_data_to_display();
  }
}

/**
 * Show migration error
 * @param {string} error - Error message
 */
function showMigrationError(error) {
  var statusEl = document.getElementById('migration-status');
  var buttonRow = document.querySelector('.migration-dialog .button-row');
  
  if (statusEl) {
    statusEl.textContent = t('advanced.migration_error', { error: error });
    statusEl.className = 'migration-status error';
  }
  
  if (buttonRow) {
    buttonRow.innerHTML = '<button type="button" onclick="closeMigrationDialog()" class="primary">' + t('advanced.migration_close') + '</button>';
  }
}

/**
 * Handle start migration send button click
 */
async function handleStartMigrationSend() {
  try {
    // Get all sessions
    var sessionOrder = typeof get_session_order === 'function' ? get_session_order() : [];
    
    if (sessionOrder.length === 0) {
      showToast(t('advanced.migration_no_sessions'));
      return;
    }
    
    MigrationState.totalSessions = sessionOrder.length;
    MigrationState.currentSessionIndex = 0;
    MigrationState.isComplete = false;
    MigrationState.error = null;
    
    // Show progress dialog
    showMigrationProgressDialog();
    
    // Start sending
    await startMigrationSend();
    
  } catch (error) {
    console.error('Migration send error:', error);
    showMigrationError(error.message || 'Unknown error');
  }
}

/**
 * Handle start migration receive button click
 */
async function handleStartMigrationReceive() {
  var roomCodeInput = document.getElementById('migration-room-code');
  var roomCode = roomCodeInput ? roomCodeInput.value.trim().toUpperCase() : '';
  
  if (!isValidRoomCode(roomCode)) {
    showToast(t('sync.invalid_room_code'));
    if (roomCodeInput) roomCodeInput.focus();
    return;
  }
  
  MigrationState.roomCode = roomCode;
  MigrationState.isComplete = false;
  MigrationState.error = null;
  
  // Show progress dialog
  showMigrationProgressDialog();
  
  try {
    await startMigrationReceive();
  } catch (error) {
    console.error('Migration receive error:', error);
    showMigrationError(error.message || 'Unknown error');
  }
}

/**
 * Start migration send process
 * Creates a WebRTC room and syncs all session docs sequentially
 */
async function startMigrationSend() {
  // Check if WebrtcProvider is available
  if (typeof WebrtcProvider === 'undefined') {
    throw new Error('WebrtcProvider not available');
  }
  
  var roomName = 'pbe-migrate-' + MigrationState.roomCode;
  var sessionOrder = typeof get_session_order === 'function' ? get_session_order() : [];
  
  // Get global doc
  var globalDoc = typeof getGlobalDoc === 'function' ? getGlobalDoc() : null;
  if (!globalDoc) {
    throw new Error('Could not get global document');
  }
  
  // Create provider for global doc first
  console.log('Migration: Starting send for room', roomName);
  
  MigrationState.provider = new WebrtcProvider(roomName + '-global', globalDoc, {
    signaling: SyncManager.config.signalingServers,
    password: null,
    maxConns: 10,
    filterBcConns: true,
    peerOpts: {}
  });
  
  // Wait for connection
  await waitForMigrationConnection(MigrationState.provider);
  
  MigrationState.peerConnected = true;
  updateMigrationProgress(0, sessionOrder.length, 'Global metadata');
  
  // Wait a moment for global doc to sync
  await delay(2000);
  
  // Sync each session doc sequentially
  for (var i = 0; i < sessionOrder.length; i++) {
    var sessionId = sessionOrder[i];
    
    // Initialize and get the session doc
    var sessionDoc = typeof initSessionDoc === 'function' 
      ? await initSessionDoc(sessionId) 
      : null;
    
    if (!sessionDoc) {
      console.warn('Could not load session doc:', sessionId);
      continue;
    }
    
    // Get session name for progress display
    var session = sessionDoc.getMap('session');
    var sessionName = session ? (session.get('name') || 'Unnamed') : 'Unnamed';
    
    updateMigrationProgress(i + 1, sessionOrder.length, sessionName);
    
    // Create provider for this session
    var sessionProvider = new WebrtcProvider(roomName + '-session-' + sessionId, sessionDoc, {
      signaling: SyncManager.config.signalingServers,
      password: null,
      maxConns: 10,
      filterBcConns: true,
      peerOpts: {}
    });
    
    // Wait for sync
    await waitForMigrationConnection(sessionProvider);
    await delay(3000); // Give time for data to sync
    
    // Destroy this session provider
    sessionProvider.destroy();
  }
  
  // Complete
  MigrationState.isComplete = true;
  showMigrationComplete(sessionOrder.length);
  
  // Keep global provider alive for a bit in case receiver needs more time
  setTimeout(function() {
    if (MigrationState.provider) {
      MigrationState.provider.destroy();
      MigrationState.provider = null;
    }
  }, 5000);
}

/**
 * Start migration receive process
 * Joins a WebRTC room and receives all session docs sequentially
 */
async function startMigrationReceive() {
  // Check if WebrtcProvider is available
  if (typeof WebrtcProvider === 'undefined') {
    throw new Error('WebrtcProvider not available');
  }
  
  var roomName = 'pbe-migrate-' + MigrationState.roomCode;
  
  // Get global doc
  var globalDoc = typeof getGlobalDoc === 'function' ? getGlobalDoc() : null;
  if (!globalDoc) {
    throw new Error('Could not get global document');
  }
  
  console.log('Migration: Starting receive for room', roomName);
  
  // Connect to global doc room
  MigrationState.provider = new WebrtcProvider(roomName + '-global', globalDoc, {
    signaling: SyncManager.config.signalingServers,
    password: null,
    maxConns: 10,
    filterBcConns: true,
    peerOpts: {}
  });
  
  // Wait for connection
  await waitForMigrationConnection(MigrationState.provider);
  
  MigrationState.peerConnected = true;
  
  // Wait for global doc to sync (get session list from sender)
  await delay(3000);
  
  // Get the session order from the synced global doc
  var meta = globalDoc.getMap('meta');
  var sessionOrderArray = meta.get('sessionOrder');
  var sessionOrder = sessionOrderArray ? sessionOrderArray.toArray() : [];
  
  if (sessionOrder.length === 0) {
    showMigrationComplete(0);
    return;
  }
  
  MigrationState.totalSessions = sessionOrder.length;
  updateMigrationProgress(0, sessionOrder.length, 'Global metadata');
  
  // Receive each session doc
  for (var i = 0; i < sessionOrder.length; i++) {
    var sessionId = sessionOrder[i];
    
    updateMigrationProgress(i + 1, sessionOrder.length, 'Session ' + (i + 1));
    
    // Initialize the session doc (creates if doesn't exist)
    var sessionDoc = typeof initSessionDoc === 'function' 
      ? await initSessionDoc(sessionId) 
      : null;
    
    if (!sessionDoc) {
      console.warn('Could not create session doc:', sessionId);
      continue;
    }
    
    // Connect to this session's room
    var sessionProvider = new WebrtcProvider(roomName + '-session-' + sessionId, sessionDoc, {
      signaling: SyncManager.config.signalingServers,
      password: null,
      maxConns: 10,
      filterBcConns: true,
      peerOpts: {}
    });
    
    // Wait for sync
    await waitForMigrationConnection(sessionProvider);
    await delay(3000); // Give time for data to sync
    
    // Get session name after sync
    var session = sessionDoc.getMap('session');
    var sessionName = session ? (session.get('name') || 'Unnamed') : 'Unnamed';
    updateMigrationProgress(i + 1, sessionOrder.length, sessionName);
    
    // Destroy this session provider
    sessionProvider.destroy();
  }
  
  // Complete
  MigrationState.isComplete = true;
  showMigrationComplete(sessionOrder.length);
  
  // Cleanup
  if (MigrationState.provider) {
    MigrationState.provider.destroy();
    MigrationState.provider = null;
  }
  
  // Refresh display
  if (typeof sync_data_to_display === 'function') {
    sync_data_to_display();
  }
}

/**
 * Wait for WebRTC connection with timeout
 * @param {WebrtcProvider} provider - The provider to wait for
 * @param {number} timeout - Timeout in milliseconds (default 30000)
 * @returns {Promise<void>}
 */
function waitForMigrationConnection(provider, timeout) {
  timeout = timeout || 30000;
  
  return new Promise(function(resolve, reject) {
    var startTime = Date.now();
    
    var checkMigrationConnection = function() {
      if (provider && provider.connected) {
        resolve();
        return;
      }
      
      if (Date.now() - startTime > timeout) {
        reject(new Error('Connection timeout'));
        return;
      }
      
      setTimeout(checkMigrationConnection, 100);
    };
    
    checkMigrationConnection();
  });
}

/**
 * Helper function for delays
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

/**
 * Cancel ongoing migration
 */
function cancelMigration() {
  if (MigrationState.provider) {
    MigrationState.provider.destroy();
    MigrationState.provider = null;
  }
  
  MigrationState.isComplete = false;
  MigrationState.error = 'Cancelled';
  
  closeMigrationDialog();
}

/**
 * Close migration dialog
 */
function closeMigrationDialog() {
  var overlay = document.getElementById('migration-dialog-overlay');
  if (overlay) overlay.remove();
  
  document.removeEventListener('keydown', handleMigrationDialogKeydown);
  
  // Clean up any active provider
  if (MigrationState.provider) {
    MigrationState.provider.destroy();
    MigrationState.provider = null;
  }
  
  // Reset state
  MigrationState.mode = null;
  MigrationState.roomCode = null;
  MigrationState.peerConnected = false;
  MigrationState.currentSessionIndex = 0;
  MigrationState.totalSessions = 0;
  MigrationState.isComplete = false;
  MigrationState.error = null;
  
  // Restore focus
  if (MigrationState.previousFocus) {
    MigrationState.previousFocus.focus();
    MigrationState.previousFocus = null;
  }
}

/**
 * Handle keydown events in migration dialog
 * @param {KeyboardEvent} e - Keyboard event
 */
function handleMigrationDialogKeydown(e) {
  if (e.key === 'Escape') {
    if (MigrationState.isComplete || !MigrationState.peerConnected) {
      closeMigrationDialog();
    } else {
      cancelMigration();
    }
  }
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SyncManager: SyncManager,
    SyncError: SyncError,
    MigrationState: MigrationState,
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
    captureSessionDataForMerge: captureSessionDataForMerge,
    performSafeAdditiveMerge: performSafeAdditiveMerge,
    showMergePreviewDialog: showMergePreviewDialog,
    compareArrays: compareArrays,
    compareSessionData: compareSessionData,
    getMatchStats: getMatchStats,
    applyMappings: applyMappings,
    changeDisplayName: changeDisplayName,
    handleEditNameClick: handleEditNameClick,
    handleSaveNameClick: handleSaveNameClick,
    handleCancelEditName: handleCancelEditName,
    showMigrationDialog: showMigrationDialog,
    closeMigrationDialog: closeMigrationDialog,
    handleStartMigrationSend: handleStartMigrationSend,
    handleStartMigrationReceive: handleStartMigrationReceive,
    cancelMigration: cancelMigration,
    showLargeEventDialog: showLargeEventDialog,
    closeLargeEventDialog: closeLargeEventDialog,
    startWebsocketSync: startWebsocketSync,
    isLargeEventSyncExpired: isLargeEventSyncExpired,
    clearExpiredLargeEventSync: clearExpiredLargeEventSync
  };
}
