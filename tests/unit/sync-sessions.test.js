const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { cleanupSyncModule } = require('../helpers/sync-cleanup');

// Mock browser globals
global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, value) { this.store[key] = value; },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};

// Mock translation function
global.t = function(key, params) {
  return key; // Just return the key for testing
};

global.t_plural = function(key, count, params) {
  return key + (count === 1 ? '_one' : '_other');
};

// Mock session doc functions
var mockSessionConfigs = {};
var mockGlobalDocMeta = {};
var mockSessionSyncRooms = {};

// Mock Y.Map for sessionSyncRooms cache
function MockYMap() {
  this.data = {};
}
MockYMap.prototype.get = function(key) { return this.data[key]; };
MockYMap.prototype.set = function(key, value) { this.data[key] = value; };
MockYMap.prototype.delete = function(key) { delete this.data[key]; };
MockYMap.prototype.has = function(key) { return key in this.data; };

// Mock Y global
global.Y = {
  Map: MockYMap
};

global.getGlobalDoc = function() {
  return {
    getMap: function(mapName) {
      if (mapName === 'meta') {
        return {
          get: function(key) { 
            if (key === 'sessionSyncRooms' && !mockGlobalDocMeta.sessionSyncRooms) {
              mockGlobalDocMeta.sessionSyncRooms = new MockYMap();
            }
            return mockGlobalDocMeta[key] || null; 
          },
          set: function(key, value) { mockGlobalDocMeta[key] = value; }
        };
      }
      return { get: function() { return null; }, set: function() {} };
    },
    transact: function(fn, origin) { fn(); }
  };
};

global.getSessionDoc = function(sessionId) {
  return {
    getMap: function(mapName) {
      if (mapName === 'config') {
        return {
          get: function(key) { 
            return mockSessionConfigs[sessionId] ? mockSessionConfigs[sessionId][key] : null; 
          },
          set: function(key, value) { 
            if (!mockSessionConfigs[sessionId]) mockSessionConfigs[sessionId] = {};
            mockSessionConfigs[sessionId][key] = value;
          },
          delete: function(key) {
            if (mockSessionConfigs[sessionId]) delete mockSessionConfigs[sessionId][key];
          }
        };
      }
      return { get: function() { return null; }, set: function() {}, delete: function() {} };
    },
    off: function() {}
  };
};

global.getActiveSessionDoc = function() {
  return global.getSessionDoc('active-session');
};

// Mock document
global.document = {
  getElementById: function() { return null; },
  querySelector: function() { return null; },
  querySelectorAll: function() { return []; },
  createElement: function(tag) {
    return {
      tagName: tag.toUpperCase(),
      className: '',
      id: '',
      textContent: '',
      innerHTML: '',
      style: {},
      dataset: {},
      classList: { add: function() {}, remove: function() {}, contains: function() { return false; } },
      setAttribute: function() {},
      getAttribute: function() { return null; },
      addEventListener: function() {},
      removeEventListener: function() {},
      appendChild: function() {},
      remove: function() {},
      focus: function() {},
      closest: function() { return null; }
    };
  },
  body: { appendChild: function() {} },
  addEventListener: function() {},
  removeEventListener: function() {},
  activeElement: null
};

describe('Sync Sessions', () => {
  let syncModule;
  
  beforeEach(() => {
    global.localStorage.clear();
    mockSessionConfigs = {}; // Reset session configs
    mockGlobalDocMeta = {}; // Reset global doc meta
    delete require.cache[require.resolve('../../scripts/app-sync.js')];
    syncModule = require('../../scripts/app-sync.js');
  });
  
  afterEach(() => {
    cleanupSyncModule(syncModule);
  });

  describe('handleSessionSwitch', () => {
    it('should return true immediately if not connected', async () => {
      syncModule.SyncManager.state = 'offline';
      syncModule.SyncManager.roomCode = null;
      
      // Should return true to allow switch when not connected
      const result = await syncModule.handleSessionSwitch('new-session-id');
      
      assert.strictEqual(result, true);
      assert.strictEqual(syncModule.getSyncState(), 'offline');
    });
    
    // Note: Testing the connected case requires DOM mocking for the confirmation dialog
    // which is complex in a unit test environment. Integration tests should cover this.
  });
  
  describe('getSyncedSessionId', () => {
    it('should return null when not connected', () => {
      syncModule.SyncManager.state = 'offline';
      
      assert.strictEqual(syncModule.getSyncedSessionId(), null);
    });
    
    it('should return null when provider is null', () => {
      syncModule.SyncManager.state = 'connected';
      syncModule.SyncManager.provider = null;
      syncModule.SyncManager.syncedSessionId = 'test-session-id';
      
      // No provider means not really connected
      assert.strictEqual(syncModule.getSyncedSessionId(), null);
    });
  });
  
  describe('getSyncSessionName', () => {
    it('should return null when not connected', () => {
      syncModule.SyncManager.state = 'offline';
      
      assert.strictEqual(syncModule.getSyncSessionName(), null);
    });
  });

  describe('shouldSyncCurrentSession', () => {
    it('should return false when offline', () => {
      syncModule.SyncManager.state = 'offline';
      syncModule.SyncManager.provider = null;
      
      // Function is internal but we can test through getSyncedSessionId behavior
      assert.strictEqual(syncModule.getSyncedSessionId(), null);
    });
  });

  describe('SyncManager.syncedSessionId', () => {
    it('should be null initially', () => {
      assert.strictEqual(syncModule.SyncManager.syncedSessionId, null);
    });
    
    it('should be settable', () => {
      syncModule.SyncManager.syncedSessionId = 'test-id';
      assert.strictEqual(syncModule.SyncManager.syncedSessionId, 'test-id');
    });
    
    it('should be cleared by stopSync', () => {
      syncModule.SyncManager.syncedSessionId = 'test-id';
      syncModule.SyncManager.state = 'connected';
      
      syncModule.stopSync(true); // Pass true to clear session room
      
      assert.strictEqual(syncModule.SyncManager.syncedSessionId, null);
    });
  });
});
