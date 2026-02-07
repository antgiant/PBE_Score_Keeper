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

// Mock document for DOM-dependent functions
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
      classList: {
        add: function() {},
        remove: function() {},
        contains: function() { return false; }
      },
      setAttribute: function() {},
      getAttribute: function() { return null; },
      addEventListener: function() {},
      removeEventListener: function() {},
      appendChild: function() {},
      remove: function() {},
      focus: function() {}
    };
  },
  body: {
    appendChild: function() {}
  },
  addEventListener: function() {},
  removeEventListener: function() {},
  activeElement: null
};

describe('Sync Presence', () => {
  let syncModule;
  
  beforeEach(() => {
    global.localStorage.clear();
    delete require.cache[require.resolve('../../scripts/app-sync.js')];
    syncModule = require('../../scripts/app-sync.js');
  });
  
  afterEach(() => {
    cleanupSyncModule(syncModule);
  });

  describe('generateUserColor', () => {
    it('should return consistent color for same name', () => {
      const color1 = syncModule.generateUserColor('Alice');
      const color2 = syncModule.generateUserColor('Alice');
      assert.strictEqual(color1, color2, 'Same name should produce same color');
    });
    
    it('should return a valid hex color', () => {
      const color = syncModule.generateUserColor('Bob');
      assert.match(color, /^#[0-9A-Fa-f]{6}$/, 'Should be a valid hex color');
    });
    
    it('should return different colors for different names', () => {
      const colors = new Set();
      const names = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'Frank', 'Grace', 'Henry'];
      
      for (const name of names) {
        colors.add(syncModule.generateUserColor(name));
      }
      
      // With 8 different names and 8 colors, we should get at least 3 different colors
      // (due to hash distribution, not guaranteed to be all different)
      assert.ok(colors.size >= 3, `Should have at least 3 different colors, got ${colors.size}`);
    });
    
    it('should handle empty string', () => {
      const color = syncModule.generateUserColor('');
      assert.match(color, /^#[0-9A-Fa-f]{6}$/, 'Should handle empty string');
    });
    
    it('should handle special characters', () => {
      const color = syncModule.generateUserColor('Test-User_123!');
      assert.match(color, /^#[0-9A-Fa-f]{6}$/, 'Should handle special characters');
    });
  });

  describe('getUniqueDisplayName', () => {
    it('should return base name when no awareness exists', () => {
      const name = syncModule.getUniqueDisplayName('TestUser');
      assert.strictEqual(name, 'TestUser');
    });
    
    it('should return base name when awareness has no conflicts', () => {
      // Without awareness, should return base name
      const name = syncModule.getUniqueDisplayName('UniqueUser');
      assert.strictEqual(name, 'UniqueUser');
    });
  });

  describe('peer tracking', () => {
    it('should start with empty peers list', () => {
      const peers = syncModule.getSyncPeers();
      assert.ok(Array.isArray(peers), 'Peers should be an array');
      assert.strictEqual(peers.length, 0, 'Should start with no peers');
    });

    it('should count self as 1 when offline', () => {
      const count = syncModule.getSyncPeerCount();
      assert.strictEqual(count, 1, 'Should count self');
    });
  });

  describe('SyncManager state management', () => {
    it('should track display name', () => {
      syncModule.SyncManager.displayName = 'TestDisplay';
      assert.strictEqual(syncModule.getSyncDisplayName(), 'TestDisplay');
    });

    it('should track room code', () => {
      syncModule.SyncManager.roomCode = 'ABC123';
      assert.strictEqual(syncModule.getSyncRoomCode(), 'ABC123');
    });

    it('should track connection state', () => {
      assert.strictEqual(syncModule.getSyncState(), 'offline');
      
      syncModule.SyncManager.state = 'connecting';
      assert.strictEqual(syncModule.getSyncState(), 'connecting');
      
      syncModule.SyncManager.state = 'connected';
      assert.strictEqual(syncModule.getSyncState(), 'connected');
    });
  });
});
