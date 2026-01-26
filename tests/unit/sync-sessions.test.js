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

// Mock translation function
global.t = function(key, params) {
  return key; // Just return the key for testing
};

global.t_plural = function(key, count, params) {
  return key + (count === 1 ? '_one' : '_other');
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
    delete require.cache[require.resolve('../../scripts/app-sync.js')];
    syncModule = require('../../scripts/app-sync.js');
  });

  describe('handleSessionSwitch', () => {
    it('should do nothing if not connected', () => {
      syncModule.SyncManager.state = 'offline';
      syncModule.SyncManager.roomCode = null;
      
      // Should not throw or change state
      syncModule.handleSessionSwitch('new-session-id');
      
      assert.strictEqual(syncModule.getSyncState(), 'offline');
    });
    
    it('should disconnect from sync when switching sessions while connected', () => {
      // Simulate connected state
      syncModule.SyncManager.state = 'connected';
      syncModule.SyncManager.roomCode = 'ABC123';
      syncModule.SyncManager.syncedSessionId = 'old-session-id';
      
      // Switch to new session
      syncModule.handleSessionSwitch('new-session-id');
      
      // Should be disconnected now
      assert.strictEqual(syncModule.getSyncState(), 'offline');
      assert.strictEqual(syncModule.getSyncRoomCode(), null);
    });
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
      
      syncModule.stopSync();
      
      assert.strictEqual(syncModule.SyncManager.syncedSessionId, null);
    });
  });
});
