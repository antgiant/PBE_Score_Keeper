// Backup System for PBE Score Keeper
// Provides session backup/restore functionality using dedicated IndexedDB store
// Backups are local-only (not synced) to preserve each user's undo capability

/**
 * Backup IndexedDB configuration
 * @constant
 */
var BACKUP_DB_NAME = 'pbe-backups';
var BACKUP_DB_VERSION = 1;
var BACKUP_STORE_NAME = 'backups';
var MAX_BACKUPS_PER_SESSION = 10;

/**
 * Backup database instance (cached for reuse)
 * @type {IDBDatabase|null}
 */
var _backupDb = null;

/**
 * Backup reasons for categorization
 * @constant
 */
var BackupReason = {
  PRE_MERGE: 'pre-merge',         // Before merging data from another peer
  PRE_RESTORE: 'pre-restore',     // Before restoring from a backup (safety net)
  PRE_IMPORT: 'pre-import',       // Before importing data
  MANUAL: 'manual',               // User-initiated backup
  AUTO: 'auto'                    // Automatic periodic backup
};

/**
 * Backup entry structure
 * @typedef {Object} BackupEntry
 * @property {string} id - Unique backup ID (UUID)
 * @property {string} sessionId - Session UUID this backup belongs to
 * @property {string} sessionName - Session name at time of backup
 * @property {number} timestamp - Backup creation timestamp
 * @property {string} reason - Reason for backup (from BackupReason)
 * @property {string} state - Base64-encoded Y.Doc state (from Y.encodeStateAsUpdate)
 * @property {boolean} pinned - Whether backup is protected from auto-deletion
 * @property {Object} summary - Human-readable summary
 * @property {number} summary.teamCount - Number of teams
 * @property {number} summary.questionCount - Number of questions
 * @property {number} summary.blockCount - Number of blocks
 */

/**
 * Open the backup IndexedDB database
 * @returns {Promise<IDBDatabase>} Database instance
 */
async function openBackupDb() {
  if (_backupDb) {
    return _backupDb;
  }

  return new Promise(function(resolve, reject) {
    var request = indexedDB.open(BACKUP_DB_NAME, BACKUP_DB_VERSION);

    request.onerror = function(event) {
      console.error('Failed to open backup database:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = function(event) {
      _backupDb = event.target.result;
      resolve(_backupDb);
    };

    request.onupgradeneeded = function(event) {
      var db = event.target.result;
      
      // Create backups object store with indexes
      if (!db.objectStoreNames.contains(BACKUP_STORE_NAME)) {
        var store = db.createObjectStore(BACKUP_STORE_NAME, { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('sessionId_timestamp', ['sessionId', 'timestamp'], { unique: false });
      }
    };
  });
}

/**
 * Generate a unique backup ID
 * @returns {string} UUID for backup
 */
function generateBackupId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'backup-' + crypto.randomUUID();
  }
  return 'backup-' + 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0;
    var v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Convert Uint8Array to Base64 string
 * @param {Uint8Array} uint8Array - Binary data
 * @returns {string} Base64 encoded string
 */
function backupUint8ToBase64(uint8Array) {
  var binary = '';
  for (var i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to Uint8Array
 * @param {string} base64 - Base64 encoded string
 * @returns {Uint8Array} Binary data
 */
function backupBase64ToUint8(base64) {
  var binary = atob(base64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Extract summary information from a session doc
 * @param {Y.Doc} sessionDoc - Session Y.Doc
 * @returns {Object} Summary with teamCount, questionCount, blockCount
 */
function extractSessionSummary(sessionDoc) {
  var summary = {
    teamCount: 0,
    questionCount: 0,
    blockCount: 0
  };

  try {
    var session = sessionDoc.getMap('session');
    if (!session) return summary;

    var teams = session.get('teams');
    var questions = session.get('questions');
    var blocks = session.get('blocks');

    // Teams array has null at index 0
    summary.teamCount = teams ? Math.max(0, teams.length - 1) : 0;
    // Questions array has null at index 0
    summary.questionCount = questions ? Math.max(0, questions.length - 1) : 0;
    // Blocks array includes "No Block" at index 0
    summary.blockCount = blocks ? blocks.length : 0;
  } catch (e) {
    console.warn('Failed to extract session summary:', e);
  }

  return summary;
}

/**
 * Create a backup of a session
 * @param {string} sessionId - Session UUID to backup
 * @param {string} reason - Reason for backup (from BackupReason)
 * @returns {Promise<BackupEntry|null>} Created backup entry or null on failure
 */
async function createSessionBackup(sessionId, reason) {
  if (!sessionId) {
    console.error('createSessionBackup: sessionId is required');
    return null;
  }

  try {
    // Get the session doc
    var sessionDoc = typeof getSessionDoc === 'function' ? getSessionDoc(sessionId) : null;
    if (!sessionDoc) {
      // Try to load it
      sessionDoc = typeof initSessionDoc === 'function' ? await initSessionDoc(sessionId) : null;
    }
    if (!sessionDoc) {
      console.error('createSessionBackup: Could not get session doc for', sessionId);
      return null;
    }

    // Get session name
    var session = sessionDoc.getMap('session');
    var sessionName = session ? session.get('name') : 'Unknown Session';

    // Capture complete state as binary
    var stateUpdate = Y.encodeStateAsUpdate(sessionDoc);
    var stateBase64 = backupUint8ToBase64(stateUpdate);

    // Extract summary
    var summary = extractSessionSummary(sessionDoc);

    // Create backup entry
    var backup = {
      id: generateBackupId(),
      sessionId: sessionId,
      sessionName: sessionName,
      timestamp: Date.now(),
      reason: reason || BackupReason.MANUAL,
      state: stateBase64,
      pinned: false,
      summary: summary
    };

    // Store in IndexedDB
    var db = await openBackupDb();
    await new Promise(function(resolve, reject) {
      var transaction = db.transaction([BACKUP_STORE_NAME], 'readwrite');
      var store = transaction.objectStore(BACKUP_STORE_NAME);
      var request = store.add(backup);

      request.onsuccess = function() {
        resolve();
      };
      request.onerror = function(event) {
        reject(event.target.error);
      };
    });

    console.log('Created backup:', backup.id, 'for session:', sessionName, 'reason:', reason);

    // Prune old backups for this session
    await pruneBackupsForSession(sessionId);

    return backup;
  } catch (error) {
    console.error('Failed to create session backup:', error);
    return null;
  }
}

/**
 * Get all backups for a session, sorted by timestamp descending (newest first)
 * @param {string} sessionId - Session UUID
 * @returns {Promise<BackupEntry[]>} Array of backup entries
 */
async function getBackupsForSession(sessionId) {
  if (!sessionId) return [];

  try {
    var db = await openBackupDb();
    
    return new Promise(function(resolve, reject) {
      var transaction = db.transaction([BACKUP_STORE_NAME], 'readonly');
      var store = transaction.objectStore(BACKUP_STORE_NAME);
      var index = store.index('sessionId');
      var request = index.getAll(sessionId);

      request.onsuccess = function(event) {
        var backups = event.target.result || [];
        // Sort by timestamp descending (newest first)
        backups.sort(function(a, b) {
          return b.timestamp - a.timestamp;
        });
        resolve(backups);
      };
      request.onerror = function(event) {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Failed to get backups for session:', error);
    return [];
  }
}

/**
 * Get a specific backup by ID
 * @param {string} backupId - Backup ID
 * @returns {Promise<BackupEntry|null>} Backup entry or null if not found
 */
async function getBackupById(backupId) {
  if (!backupId) return null;

  try {
    var db = await openBackupDb();
    
    return new Promise(function(resolve, reject) {
      var transaction = db.transaction([BACKUP_STORE_NAME], 'readonly');
      var store = transaction.objectStore(BACKUP_STORE_NAME);
      var request = store.get(backupId);

      request.onsuccess = function(event) {
        resolve(event.target.result || null);
      };
      request.onerror = function(event) {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Failed to get backup by ID:', error);
    return null;
  }
}

/**
 * Restore a session from a backup
 * Creates a pre-restore backup first to enable undo of the restore
 * @param {string} backupId - ID of the backup to restore
 * @returns {Promise<boolean>} True if restore succeeded
 */
async function restoreFromBackup(backupId) {
  if (!backupId) {
    console.error('restoreFromBackup: backupId is required');
    return false;
  }

  try {
    // Get the backup
    var backup = await getBackupById(backupId);
    if (!backup) {
      console.error('restoreFromBackup: Backup not found:', backupId);
      return false;
    }

    // Get or create the session doc
    var sessionDoc = typeof getSessionDoc === 'function' ? getSessionDoc(backup.sessionId) : null;
    if (!sessionDoc) {
      sessionDoc = typeof initSessionDoc === 'function' ? await initSessionDoc(backup.sessionId) : null;
    }
    if (!sessionDoc) {
      console.error('restoreFromBackup: Could not get session doc');
      return false;
    }

    // Step 1: Create a backup of CURRENT state (infinite undo chain)
    var preRestoreBackup = await createSessionBackup(backup.sessionId, BackupReason.PRE_RESTORE);
    if (!preRestoreBackup) {
      console.warn('restoreFromBackup: Failed to create pre-restore backup, proceeding anyway');
    }

    // Step 2: Decode the backup state
    var stateUpdate = backupBase64ToUint8(backup.state);

    // Step 3: Apply the backup state
    // Note: This uses Yjs CRDT merge - the backup state will be applied
    // We need to clear existing data first to get a true restore
    
    // Create a fresh session doc and replace contents
    sessionDoc.transact(function() {
      var session = sessionDoc.getMap('session');
      
      // Clear existing arrays
      var teams = session.get('teams');
      if (teams && teams.length > 0) {
        teams.delete(0, teams.length);
      }
      
      var questions = session.get('questions');
      if (questions && questions.length > 0) {
        questions.delete(0, questions.length);
      }
      
      var blocks = session.get('blocks');
      if (blocks && blocks.length > 0) {
        blocks.delete(0, blocks.length);
      }
      
      var historyLog = session.get('historyLog');
      if (historyLog && historyLog.length > 0) {
        historyLog.delete(0, historyLog.length);
      }
    }, 'local');

    // Apply the backup state (CRDT merge)
    Y.applyUpdate(sessionDoc, stateUpdate);

    // Step 4: Log restore action in history
    if (typeof add_history_entry === 'function') {
      add_history_entry(
        'edit_log.actions.restore_backup',
        'edit_log.details_templates.restored_backup',
        { 
          date: new Date(backup.timestamp).toLocaleString(),
          reason: backup.reason 
        }
      );
    }

    // Step 5: Refresh display
    if (typeof sync_data_to_display === 'function') {
      sync_data_to_display();
    }

    console.log('Restored from backup:', backupId);
    
    // Show success toast
    if (typeof showToast === 'function') {
      showToast(t('backup.restored_success'));
    }

    return true;
  } catch (error) {
    console.error('Failed to restore from backup:', error);
    if (typeof showToast === 'function') {
      showToast(t('backup.restore_failed'));
    }
    return false;
  }
}

/**
 * Delete a backup
 * @param {string} backupId - Backup ID to delete
 * @returns {Promise<boolean>} True if deletion succeeded
 */
async function deleteBackup(backupId) {
  if (!backupId) return false;

  try {
    var db = await openBackupDb();
    
    return new Promise(function(resolve, reject) {
      var transaction = db.transaction([BACKUP_STORE_NAME], 'readwrite');
      var store = transaction.objectStore(BACKUP_STORE_NAME);
      var request = store.delete(backupId);

      request.onsuccess = function() {
        resolve(true);
      };
      request.onerror = function(event) {
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('Failed to delete backup:', error);
    return false;
  }
}

/**
 * Toggle pinned status of a backup
 * Pinned backups are protected from auto-deletion
 * @param {string} backupId - Backup ID
 * @returns {Promise<boolean>} New pinned status
 */
async function toggleBackupPinned(backupId) {
  if (!backupId) return false;

  try {
    var backup = await getBackupById(backupId);
    if (!backup) return false;

    backup.pinned = !backup.pinned;

    var db = await openBackupDb();
    
    await new Promise(function(resolve, reject) {
      var transaction = db.transaction([BACKUP_STORE_NAME], 'readwrite');
      var store = transaction.objectStore(BACKUP_STORE_NAME);
      var request = store.put(backup);

      request.onsuccess = function() {
        resolve();
      };
      request.onerror = function(event) {
        reject(event.target.error);
      };
    });

    return backup.pinned;
  } catch (error) {
    console.error('Failed to toggle backup pinned status:', error);
    return false;
  }
}

/**
 * Prune old backups for a session, keeping only MAX_BACKUPS_PER_SESSION
 * Pinned backups are never deleted
 * @param {string} sessionId - Session UUID
 * @returns {Promise<number>} Number of backups deleted
 */
async function pruneBackupsForSession(sessionId) {
  if (!sessionId) return 0;

  try {
    var backups = await getBackupsForSession(sessionId);
    
    // Separate pinned and unpinned
    var pinnedBackups = backups.filter(function(b) { return b.pinned; });
    var unpinnedBackups = backups.filter(function(b) { return !b.pinned; });

    // Check if we need to prune unpinned backups
    if (unpinnedBackups.length <= MAX_BACKUPS_PER_SESSION) {
      return 0;
    }

    // Delete oldest unpinned backups beyond the limit
    var toDelete = unpinnedBackups.slice(MAX_BACKUPS_PER_SESSION);
    var deleteCount = 0;

    for (var i = 0; i < toDelete.length; i++) {
      var deleted = await deleteBackup(toDelete[i].id);
      if (deleted) deleteCount++;
    }

    console.log('Pruned', deleteCount, 'old backups for session:', sessionId);
    return deleteCount;
  } catch (error) {
    console.error('Failed to prune backups:', error);
    return 0;
  }
}

/**
 * Delete all backups for a session
 * Called when a session is deleted
 * @param {string} sessionId - Session UUID
 * @returns {Promise<number>} Number of backups deleted
 */
async function deleteAllBackupsForSession(sessionId) {
  if (!sessionId) return 0;

  try {
    var backups = await getBackupsForSession(sessionId);
    var deleteCount = 0;

    for (var i = 0; i < backups.length; i++) {
      var deleted = await deleteBackup(backups[i].id);
      if (deleted) deleteCount++;
    }

    console.log('Deleted all', deleteCount, 'backups for session:', sessionId);
    return deleteCount;
  } catch (error) {
    console.error('Failed to delete all backups for session:', error);
    return 0;
  }
}

/**
 * Get formatted date string for backup display
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatted date string
 */
function formatBackupDate(timestamp) {
  var date = new Date(timestamp);
  return date.toLocaleString();
}

/**
 * Get human-readable reason string for backup
 * @param {string} reason - Backup reason code
 * @returns {string} Translated reason string
 */
function getBackupReasonText(reason) {
  var key = 'backup.reason_' + reason;
  var translated = typeof t === 'function' ? t(key) : reason;
  // If translation not found, return the reason code
  return translated === key ? reason : translated;
}
