const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// Mock Y.Doc for registry
class MockYMap {
  constructor() {
    this.data = new Map();
  }
  get(key) { return this.data.get(key); }
  set(key, value) { this.data.set(key, value); }
  delete(key) { this.data.delete(key); }
  forEach(fn) { this.data.forEach(fn); }
  has(key) { return this.data.has(key); }
  size() { return this.data.size; }
}

class MockYDoc {
  constructor() {
    this.maps = {};
  }
  getMap(name) {
    if (!this.maps[name]) {
      this.maps[name] = new MockYMap();
    }
    return this.maps[name];
  }
  transact(fn) { fn(); }
}

// Mock browser globals
global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, value) { this.store[key] = value; },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};

var mockGlobalDocMeta = {};
var mockSessionDocConfig = {};
var mockSessionId = 'test-session-uuid-1234';

global.getGlobalDoc = function() {
  return {
    getMap: function(mapName) {
      if (mapName === 'meta') {
        return {
          get: function(key) { return mockGlobalDocMeta[key] || null; },
          set: function(key, value) { mockGlobalDocMeta[key] = value; }
        };
      }
      return { get: function() { return null; }, set: function() {} };
    }
  };
};

global.getActiveSessionDoc = function() {
  return {
    getMap: function(mapName) {
      if (mapName === 'session') {
        return {
          get: function(key) {
            if (key === 'config') {
              return {
                get: function(k) { return mockSessionDocConfig[k]; },
                set: function(k, v) { mockSessionDocConfig[k] = v; },
                delete: function(k) { delete mockSessionDocConfig[k]; }
              };
            }
            return null;
          }
        };
      }
      return { get: function() { return null; } };
    }
  };
};

global.getSessionDoc = function(sessionId) {
  return global.getActiveSessionDoc();
};

global.get_current_session_id = function() {
  return mockSessionId;
};

global.document = {
  addEventListener: function() {},
  removeEventListener: function() {},
  getElementById: function() { return null; },
  createElement: function() { return { appendChild: function() {}, textContent: '' }; },
  body: { appendChild: function() {} },
  visibilityState: 'visible',
  activeElement: null,
  querySelectorAll: function() { return []; }
};

global.window = {
  addEventListener: function() {},
  dispatchEvent: function() {}
};

global.navigator = {
  clipboard: { writeText: async function() {} }
};

global.t = function(key, params) { return key; };
global.t_plural = function(key, count, params) { return key + '_other'; };

describe('Sync Registry', function() {
  let syncModule;
  let mockRegistryDoc;
  
  beforeEach(function() {
    global.localStorage.clear();
    mockGlobalDocMeta = {};
    mockSessionDocConfig = {};
    mockSessionId = 'test-session-uuid-1234';
    
    // Create mock registry doc
    mockRegistryDoc = new MockYDoc();
    
    // Fresh require to reset module state
    delete require.cache[require.resolve('../../scripts/app-sync.js')];
    syncModule = require('../../scripts/app-sync.js');
    
    // Inject mock registry doc
    syncModule.SyncManager.registryDoc = mockRegistryDoc;
    syncModule.SyncManager.registryConnected = true;
    syncModule.SyncManager.registrySynced = true;
  });
  
  afterEach(function() {
    // Clean up any timers
    syncModule.stopRegistryRetry();
    syncModule.SyncManager.registryDoc = null;
    syncModule.SyncManager.registryConnected = false;
    syncModule.SyncManager.registrySynced = false;
  });

  describe('getRegistryRooms', function() {
    it('should return the rooms map from registry doc', function() {
      var rooms = syncModule.getRegistryRooms();
      assert.ok(rooms !== null);
      assert.strictEqual(typeof rooms.get, 'function');
      assert.strictEqual(typeof rooms.set, 'function');
    });
    
    it('should return null if registry doc not connected', function() {
      syncModule.SyncManager.registryDoc = null;
      var rooms = syncModule.getRegistryRooms();
      assert.strictEqual(rooms, null);
    });
  });

  describe('registerRoom', function() {
    it('should register a room with sessionId and timestamp', function() {
      var result = syncModule.registerRoom('ABC123', 'session-id-xyz', false);
      
      assert.strictEqual(result, true);
      
      var rooms = syncModule.getRegistryRooms();
      var entry = rooms.get('ABC123');
      
      assert.ok(entry);
      assert.strictEqual(entry.sessionId, 'session-id-xyz');
      assert.strictEqual(entry.hasPassword, false);
      assert.ok(typeof entry.createdAt === 'number');
    });
    
    it('should register a room with password flag', function() {
      syncModule.registerRoom('DEF456', 'session-id-abc', true);
      
      var rooms = syncModule.getRegistryRooms();
      var entry = rooms.get('DEF456');
      
      assert.strictEqual(entry.hasPassword, true);
    });
    
    it('should return false if registry not connected', function() {
      syncModule.SyncManager.registryDoc = null;
      var result = syncModule.registerRoom('XYZ789', 'session-id', false);
      assert.strictEqual(result, false);
    });
    
    it('should allow large event room codes with L- prefix', function() {
      var result = syncModule.registerRoom('L-ABC123', 'session-id-large', true);
      
      assert.strictEqual(result, true);
      
      var rooms = syncModule.getRegistryRooms();
      var entry = rooms.get('L-ABC123');
      
      assert.ok(entry);
      assert.strictEqual(entry.sessionId, 'session-id-large');
    });
  });

  describe('lookupRoom', function() {
    it('should return room entry if exists', function() {
      syncModule.registerRoom('ABC123', 'session-123', false);
      
      var entry = syncModule.lookupRoom('ABC123');
      
      assert.ok(entry);
      assert.strictEqual(entry.sessionId, 'session-123');
    });
    
    it('should return null if room does not exist', function() {
      var entry = syncModule.lookupRoom('NOTFOUND');
      assert.strictEqual(entry, null);
    });
    
    it('should return null if registry not connected', function() {
      syncModule.registerRoom('ABC123', 'session-123', false);
      syncModule.SyncManager.registryDoc = null;
      
      var entry = syncModule.lookupRoom('ABC123');
      assert.strictEqual(entry, null);
    });
    
    it('should return null and clean up expired rooms', function() {
      // Manually create an expired entry
      var rooms = syncModule.getRegistryRooms();
      var expiredTime = Date.now() - (13 * 60 * 60 * 1000); // 13 hours ago
      rooms.set('EXPIRED', {
        sessionId: 'old-session',
        createdAt: expiredTime,
        hasPassword: false
      });
      
      // Lookup should return null and delete
      var entry = syncModule.lookupRoom('EXPIRED');
      assert.strictEqual(entry, null);
      
      // Entry should be deleted
      assert.strictEqual(rooms.get('EXPIRED'), undefined);
    });
  });

  describe('verifyRoomRegistration', function() {
    it('should return true if room is registered with correct sessionId', function() {
      syncModule.registerRoom('ABC123', 'my-session-id', false);
      
      var result = syncModule.verifyRoomRegistration('ABC123', 'my-session-id');
      assert.strictEqual(result, true);
    });
    
    it('should return false if room has different sessionId (collision)', function() {
      syncModule.registerRoom('ABC123', 'other-session-id', false);
      
      var result = syncModule.verifyRoomRegistration('ABC123', 'my-session-id');
      assert.strictEqual(result, false);
    });
    
    it('should return false if room does not exist', function() {
      var result = syncModule.verifyRoomRegistration('NOTFOUND', 'my-session-id');
      assert.ok(!result, 'Should return falsy value for non-existent room');
    });
  });

  describe('cleanupExpiredRegistryEntries', function() {
    it('should delete rooms older than 12 hours', function() {
      var rooms = syncModule.getRegistryRooms();
      
      // Create a recent room
      rooms.set('RECENT', {
        sessionId: 'recent-session',
        createdAt: Date.now(),
        hasPassword: false
      });
      
      // Create an expired room (13 hours old)
      var expiredTime = Date.now() - (13 * 60 * 60 * 1000);
      rooms.set('OLD', {
        sessionId: 'old-session',
        createdAt: expiredTime,
        hasPassword: false
      });
      
      syncModule.cleanupExpiredRegistryEntries();
      
      // Recent should still exist
      assert.ok(rooms.get('RECENT'));
      // Old should be deleted
      assert.strictEqual(rooms.get('OLD'), undefined);
    });
    
    it('should not delete rooms less than 12 hours old', function() {
      var rooms = syncModule.getRegistryRooms();
      
      // Create a room 11 hours old
      var elevenHoursAgo = Date.now() - (11 * 60 * 60 * 1000);
      rooms.set('RECENT', {
        sessionId: 'recent-session',
        createdAt: elevenHoursAgo,
        hasPassword: false
      });
      
      syncModule.cleanupExpiredRegistryEntries();
      
      // Should still exist
      assert.ok(rooms.get('RECENT'));
    });
    
    it('should handle missing createdAt gracefully', function() {
      var rooms = syncModule.getRegistryRooms();
      
      // Create a room without createdAt
      rooms.set('NODATE', {
        sessionId: 'session',
        hasPassword: false
      });
      
      // Should not throw
      syncModule.cleanupExpiredRegistryEntries();
      
      // Room should still exist (can't determine if expired)
      assert.ok(rooms.get('NODATE'));
    });
  });

  describe('Effective Password Storage', function() {
    it('should save effective password to session config', function() {
      syncModule.saveEffectivePassword('test-password-123', false);
      
      assert.strictEqual(mockSessionDocConfig.syncEffectivePassword, 'test-password-123');
      assert.strictEqual(mockSessionDocConfig.syncHasCustomPassword, false);
    });
    
    it('should save hasCustomPassword flag', function() {
      syncModule.saveEffectivePassword('user-provided-password', true);
      
      assert.strictEqual(mockSessionDocConfig.syncHasCustomPassword, true);
    });
    
    it('should retrieve saved effective password', function() {
      mockSessionDocConfig.syncEffectivePassword = 'saved-password';
      
      var password = syncModule.getSavedEffectivePassword();
      assert.strictEqual(password, 'saved-password');
    });
    
    it('should retrieve hasCustomPassword flag', function() {
      mockSessionDocConfig.syncHasCustomPassword = true;
      
      var hasCustom = syncModule.getSavedHasCustomPassword();
      assert.strictEqual(hasCustom, true);
    });
    
    it('should return false for hasCustomPassword if not set', function() {
      var hasCustom = syncModule.getSavedHasCustomPassword();
      assert.strictEqual(hasCustom, false);
    });
    
    it('should clear effective password when null passed', function() {
      mockSessionDocConfig.syncEffectivePassword = 'old-password';
      mockSessionDocConfig.syncHasCustomPassword = true;
      
      syncModule.saveEffectivePassword(null, false);
      
      assert.strictEqual(mockSessionDocConfig.syncEffectivePassword, undefined);
      assert.strictEqual(mockSessionDocConfig.syncHasCustomPassword, undefined);
    });
  });

  describe('Registry with Single Peer Room', function() {
    it('should register room when creator connects', function() {
      var roomCode = 'TEST99';
      var sessionId = 'creator-session-uuid';
      
      // Simulate creator registering room
      var result = syncModule.registerRoom(roomCode, sessionId, false);
      
      assert.strictEqual(result, true);
      
      // Verify room is in registry
      var entry = syncModule.lookupRoom(roomCode);
      assert.ok(entry, 'Room should exist in registry');
      assert.strictEqual(entry.sessionId, sessionId, 'Session ID should match');
      assert.strictEqual(entry.hasPassword, false, 'Should not have custom password');
    });
    
    it('should allow joiner to discover sessionId from registry', function() {
      var roomCode = 'JOIN88';
      var creatorSessionId = 'creator-session-uuid';
      
      // Creator registers room
      syncModule.registerRoom(roomCode, creatorSessionId, false);
      
      // Joiner looks up room
      var entry = syncModule.lookupRoom(roomCode);
      
      assert.ok(entry, 'Room should be found');
      assert.strictEqual(entry.sessionId, creatorSessionId, 'Joiner should get creator sessionId');
      // Joiner would use this sessionId as the encryption password
    });
    
    it('should indicate when room requires password', function() {
      var roomCode = 'SECURE';
      var sessionId = 'secure-session';
      
      // Creator registers room with custom password
      syncModule.registerRoom(roomCode, sessionId, true);
      
      // Joiner looks up room
      var entry = syncModule.lookupRoom(roomCode);
      
      assert.ok(entry, 'Room should be found');
      assert.strictEqual(entry.hasPassword, true, 'Should indicate password required');
      // Joiner would need to prompt user for password
    });
    
    it('should detect room code collision between different sessions', function() {
      var roomCode = 'CLASH1';
      var session1 = 'session-uuid-1';
      var session2 = 'session-uuid-2';
      
      // First creator registers
      syncModule.registerRoom(roomCode, session1, false);
      
      // Second creator tries to verify their registration
      var verified = syncModule.verifyRoomRegistration(roomCode, session2);
      
      assert.strictEqual(verified, false, 'Second session should fail verification');
    });
    
    it('should allow same session to re-register room on reconnect', function() {
      var roomCode = 'RECON1';
      var sessionId = 'persistent-session';
      
      // Initial registration
      syncModule.registerRoom(roomCode, sessionId, false);
      
      // Re-registration on reconnect
      syncModule.registerRoom(roomCode, sessionId, false);
      
      // Verification should still pass
      var verified = syncModule.verifyRoomRegistration(roomCode, sessionId);
      assert.strictEqual(verified, true);
    });
    
    it('should track large event rooms with L- prefix separately', function() {
      var p2pCode = 'ABC123';
      var largeCode = 'L-ABC123';
      var session1 = 'p2p-session';
      var session2 = 'large-session';
      
      // Register both
      syncModule.registerRoom(p2pCode, session1, false);
      syncModule.registerRoom(largeCode, session2, true);
      
      // Both should exist independently
      var p2pEntry = syncModule.lookupRoom(p2pCode);
      var largeEntry = syncModule.lookupRoom(largeCode);
      
      assert.ok(p2pEntry, 'P2P room should exist');
      assert.ok(largeEntry, 'Large event room should exist');
      assert.strictEqual(p2pEntry.sessionId, session1);
      assert.strictEqual(largeEntry.sessionId, session2);
    });
  });

  describe('Registry Retry Behavior', function() {
    it('should start retry timer', function() {
      syncModule.SyncManager.state = 'connected';
      syncModule.SyncManager.registryConnected = false;
      syncModule.SyncManager.isCreator = true;
      
      syncModule.startRegistryRetry();
      
      assert.ok(syncModule.SyncManager.registryRetryTimer !== null, 'Timer should be set');
      
      // Clean up
      syncModule.stopRegistryRetry();
    });
    
    it('should stop retry timer', function() {
      syncModule.SyncManager.registryRetryTimer = setInterval(function() {}, 1000);
      
      syncModule.stopRegistryRetry();
      
      assert.strictEqual(syncModule.SyncManager.registryRetryTimer, null, 'Timer should be cleared');
    });
    
    it('should not start duplicate timers', function() {
      syncModule.SyncManager.state = 'connected';
      syncModule.SyncManager.registryConnected = false;
      syncModule.SyncManager.isCreator = true;
      
      syncModule.startRegistryRetry();
      var firstTimer = syncModule.SyncManager.registryRetryTimer;
      
      syncModule.startRegistryRetry();
      var secondTimer = syncModule.SyncManager.registryRetryTimer;
      
      assert.strictEqual(firstTimer, secondTimer, 'Should be same timer');
      
      syncModule.stopRegistryRetry();
    });
  });
});
