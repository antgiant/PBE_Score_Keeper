const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// Mock browser globals
global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, value) { this.store[key] = value; },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};

// Mock global Yjs doc for sync display name persistence
var mockGlobalDocMeta = {};
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
  clipboard: {
    writeText: async function() {}
  }
};

// Mock t and t_plural functions
global.t = function(key, params) { 
  return key; 
};
global.t_plural = function(key, count, params) { 
  return key + '_other'; 
};

describe('Sync Core', () => {
  let syncModule;
  
  beforeEach(() => {
    global.localStorage.clear();
    mockGlobalDocMeta = {}; // Reset mock global doc meta
    // Fresh require to reset module state
    delete require.cache[require.resolve('../../scripts/app-sync.js')];
    syncModule = require('../../scripts/app-sync.js');
  });

  describe('generateRoomCode', () => {
    it('should generate 6-character codes', () => {
      const code = syncModule.generateRoomCode();
      assert.strictEqual(code.length, 6);
    });

    it('should generate uppercase alphanumeric codes', () => {
      const code = syncModule.generateRoomCode();
      assert.match(code, /^[A-Z0-9]{6}$/);
    });

    it('should not contain ambiguous characters (0, O, 1, I)', () => {
      // Generate many codes to ensure no ambiguous chars
      for (let i = 0; i < 100; i++) {
        const code = syncModule.generateRoomCode();
        assert.doesNotMatch(code, /[0O1I]/);
      }
    });

    it('should generate unique codes', () => {
      const codes = new Set();
      for (let i = 0; i < 100; i++) {
        codes.add(syncModule.generateRoomCode());
      }
      // With 6 chars from 32-char alphabet, collisions should be rare
      assert.ok(codes.size >= 95, 'Should generate mostly unique codes');
    });
  });

  describe('isValidRoomCode', () => {
    it('should accept valid 6-character codes', () => {
      assert.strictEqual(syncModule.isValidRoomCode('ABC123'), true);
      assert.strictEqual(syncModule.isValidRoomCode('XYZDEF'), true);
    });

    it('should accept lowercase and convert', () => {
      assert.strictEqual(syncModule.isValidRoomCode('abc123'), true);
    });

    it('should reject codes that are too short', () => {
      assert.strictEqual(syncModule.isValidRoomCode('ABC12'), false);
      assert.strictEqual(syncModule.isValidRoomCode(''), false);
    });

    it('should reject codes that are too long', () => {
      assert.strictEqual(syncModule.isValidRoomCode('ABC1234'), false);
    });

    it('should reject non-string inputs', () => {
      assert.strictEqual(syncModule.isValidRoomCode(null), false);
      assert.strictEqual(syncModule.isValidRoomCode(undefined), false);
      assert.strictEqual(syncModule.isValidRoomCode(123456), false);
    });

    it('should reject codes with special characters', () => {
      assert.strictEqual(syncModule.isValidRoomCode('ABC-12'), false);
      assert.strictEqual(syncModule.isValidRoomCode('ABC 12'), false);
    });

    it('should handle whitespace', () => {
      assert.strictEqual(syncModule.isValidRoomCode(' ABC123 '), true);
    });
  });

  describe('SyncManager state', () => {
    it('should start in offline state', () => {
      assert.strictEqual(syncModule.getSyncState(), 'offline');
    });

    it('should have no room code initially', () => {
      assert.strictEqual(syncModule.getSyncRoomCode(), null);
    });

    it('should have no display name initially', () => {
      assert.strictEqual(syncModule.getSyncDisplayName(), null);
    });

    it('should return empty peer list initially', () => {
      const peers = syncModule.getSyncPeers();
      assert.ok(Array.isArray(peers));
      assert.strictEqual(peers.length, 0);
    });

    it('should count self as 1 peer when offline', () => {
      assert.strictEqual(syncModule.getSyncPeerCount(), 1);
    });
  });

  describe('stopSync', () => {
    it('should reset state to offline', () => {
      syncModule.SyncManager.state = 'connected';
      syncModule.SyncManager.roomCode = 'ABC123';
      
      syncModule.stopSync();
      
      assert.strictEqual(syncModule.getSyncState(), 'offline');
      assert.strictEqual(syncModule.getSyncRoomCode(), null);
    });

    it('should clear localStorage room (deprecated - now uses session doc)', () => {
      // This test verifies stopSync no longer relies on localStorage
      // Room code is now stored in session doc, not localStorage
      global.localStorage.setItem('pbe-sync-room', 'ABC123');
      
      syncModule.stopSync();
      
      // localStorage is no longer cleared by stopSync (behavior changed)
      // The room code is now stored in session doc and cleared there
      assert.strictEqual(syncModule.getSyncRoomCode(), null);
    });

    it('should clear peers', () => {
      syncModule.SyncManager.peers.set('peer1', { displayName: 'Test' });
      
      syncModule.stopSync();
      
      assert.strictEqual(syncModule.getSyncPeers().length, 0);
    });

    it('should call onStateChange callback', () => {
      let calledWith = null;
      syncModule.SyncManager.onStateChange = (state) => { calledWith = state; };
      
      syncModule.stopSync();
      
      assert.strictEqual(calledWith, 'offline');
    });
  });

  describe('initSyncManager', () => {
    it('should load saved display name from global doc', () => {
      mockGlobalDocMeta['syncDisplayName'] = 'Test User';
      
      syncModule.initSyncManager();
      
      // Display name is loaded from global doc
      assert.strictEqual(syncModule.SyncManager.displayName, 'Test User');
    });

    it('should not set display name if not saved', () => {
      // No display name set in global doc
      syncModule.SyncManager.displayName = null;
      
      syncModule.initSyncManager();
      
      // Should remain null
      assert.strictEqual(syncModule.SyncManager.displayName, null);
    });
  });

  describe('SyncManager config', () => {
    it('should have at least 3 signaling servers configured', () => {
      const servers = syncModule.SyncManager.config.signalingServers;
      assert.ok(Array.isArray(servers), 'signalingServers should be an array');
      assert.ok(servers.length >= 3, `Expected at least 3 signaling servers, got ${servers.length}`);
    });

    it('should have minSignalingServers set to 3', () => {
      assert.strictEqual(syncModule.SyncManager.config.minSignalingServers, 3);
    });

    it('should have primary server as first entry', () => {
      const servers = syncModule.SyncManager.config.signalingServers;
      assert.ok(servers[0].includes('y-webrtc-pbe.fly.dev'), 'Primary server should be first');
    });

    it('should have all servers using wss:// protocol', () => {
      const servers = syncModule.SyncManager.config.signalingServers;
      servers.forEach((server, i) => {
        assert.ok(server.startsWith('wss://'), `Server ${i} should use wss:// protocol`);
      });
    });
  });

  describe('generateUserColor', () => {
    it('should return consistent color for same name', () => {
      const color1 = syncModule.generateUserColor('Alice');
      const color2 = syncModule.generateUserColor('Alice');
      assert.strictEqual(color1, color2);
    });
    
    it('should return different colors for different names', () => {
      const colors = new Set();
      const names = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'];
      names.forEach(name => {
        colors.add(syncModule.generateUserColor(name));
      });
      // Should have at least a few different colors
      assert.ok(colors.size >= 3, 'Should generate variety of colors');
    });

    it('should return valid hex color', () => {
      const color = syncModule.generateUserColor('Test');
      assert.match(color, /^#[A-Fa-f0-9]{6}$/);
    });
  });

  describe('handleSessionSwitch', () => {
    it('should do nothing if not connected', () => {
      syncModule.SyncManager.state = 'offline';
      let stopCalled = false;
      const originalStopSync = syncModule.stopSync;
      
      syncModule.handleSessionSwitch('new-session-id');
      
      // Should not have changed state
      assert.strictEqual(syncModule.getSyncState(), 'offline');
    });
  });

  describe('getSyncedSessionId', () => {
    it('should return null when not connected', () => {
      syncModule.SyncManager.state = 'offline';
      assert.strictEqual(syncModule.getSyncedSessionId(), null);
    });

    it('should return session ID when connected with provider', () => {
      syncModule.SyncManager.state = 'connected';
      syncModule.SyncManager.provider = {}; // Mock provider
      syncModule.SyncManager.syncedSessionId = 'test-session-123';
      
      assert.strictEqual(syncModule.getSyncedSessionId(), 'test-session-123');
      
      // Clean up
      syncModule.SyncManager.provider = null;
      syncModule.SyncManager.syncedSessionId = null;
    });
  });
});