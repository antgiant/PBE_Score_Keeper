/**
 * Sync Indicator UI Tests
 * Tests the sync status indicator functions and peer management
 */

const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('../helpers/dom.js');
const { createYjsDoc } = require('../helpers/yjs-seeds.js');

/**
 * Build a basic seed for testing
 */
function createBasicSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Test Session',
      maxPointsPerQuestion: 12,
      rounding: false,
      teams: ['Team 1', 'Team 2'],
      blocks: ['No Block'],
      questions: [{
        name: 'Q1',
        score: 4,
        block: 0,
        ignore: false,
        teamScores: [
          { score: 3, extraCredit: 0 },
          { score: 2, extraCredit: 0 }
        ]
      }],
      currentQuestion: 1
    }]
  });
}

// ============================================
// SyncManager State Tests
// ============================================

test('Indicator - SyncManager starts in offline state', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  assert.strictEqual(context.SyncManager.state, 'offline', 'Should start in offline state');
});

test('Indicator - updateSyncUI function exists', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  assert.strictEqual(typeof context.updateSyncUI, 'function', 'updateSyncUI should be a function');
});

// ============================================
// getSyncPeers Tests
// ============================================

test('Indicator - getSyncPeers returns peer array', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  context.SyncManager.peers.clear();
  context.SyncManager.peers.set(1, { displayName: 'Alice', color: '#4CAF50' });
  context.SyncManager.peers.set(2, { displayName: 'Bob', color: '#2196F3' });
  
  const peers = context.getSyncPeers();
  
  assert.strictEqual(peers.length, 2, 'Should have 2 peers');
  assert.strictEqual(peers[0].displayName, 'Alice', 'First peer should be Alice');
  assert.strictEqual(peers[1].displayName, 'Bob', 'Second peer should be Bob');
});

test('Indicator - getSyncPeers returns empty array when no peers', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  context.SyncManager.peers.clear();
  
  const peers = context.getSyncPeers();
  
  assert.strictEqual(peers.length, 0, 'Should have 0 peers');
});

// ============================================
// getSyncPeerCount Tests
// ============================================

test('Indicator - getSyncPeerCount includes self', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  context.SyncManager.peers.clear();
  context.SyncManager.peers.set(1, { displayName: 'Alice', color: '#4CAF50' });
  context.SyncManager.peers.set(2, { displayName: 'Bob', color: '#2196F3' });
  
  const count = context.getSyncPeerCount();
  
  assert.strictEqual(count, 3, 'Should count self + 2 peers = 3');
});

test('Indicator - getSyncPeerCount returns 1 when alone', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  context.SyncManager.peers.clear();
  
  const count = context.getSyncPeerCount();
  
  assert.strictEqual(count, 1, 'Should return 1 when alone (just self)');
});

// ============================================
// generateUserColor Tests
// ============================================

test('Indicator - generateUserColor returns consistent color for same name', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  const color1 = context.generateUserColor('Alice');
  const color2 = context.generateUserColor('Alice');
  
  assert.strictEqual(color1, color2, 'Same name should get same color');
});

test('Indicator - generateUserColor returns valid hex color', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  const color = context.generateUserColor('TestUser');
  
  assert.ok(/^#[0-9A-Fa-f]{6}$/.test(color), 'Should return valid hex color');
});

test('Indicator - generateUserColor varies by name', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  const colors = new Set();
  const names = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry'];
  
  for (const name of names) {
    colors.add(context.generateUserColor(name));
  }
  
  // Should have at least 3 different colors for 8 names
  assert.ok(colors.size >= 3, 'Should generate varied colors for different names');
});

// ============================================
// getSyncState Tests
// ============================================

test('Indicator - getSyncState returns current state', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  assert.strictEqual(context.getSyncState(), 'offline', 'Should return offline initially');
  
  context.SyncManager.state = 'connecting';
  assert.strictEqual(context.getSyncState(), 'connecting', 'Should return connecting');
  
  context.SyncManager.state = 'connected';
  assert.strictEqual(context.getSyncState(), 'connected', 'Should return connected');
  
  context.SyncManager.state = 'error';
  assert.strictEqual(context.getSyncState(), 'error', 'Should return error');
});

// ============================================
// getSyncRoomCode Tests
// ============================================

test('Indicator - getSyncRoomCode returns null initially', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  assert.strictEqual(context.getSyncRoomCode(), null, 'Should return null when not in a room');
});

test('Indicator - getSyncRoomCode returns room code when set', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  context.SyncManager.roomCode = 'ABC123';
  
  assert.strictEqual(context.getSyncRoomCode(), 'ABC123', 'Should return room code');
});

// ============================================
// getSyncDisplayName Tests
// ============================================

test('Indicator - getSyncDisplayName returns null initially', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  assert.strictEqual(context.getSyncDisplayName(), null, 'Should return null when not set');
});

test('Indicator - getSyncDisplayName returns name when set', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  context.SyncManager.displayName = 'TestUser';
  
  assert.strictEqual(context.getSyncDisplayName(), 'TestUser', 'Should return display name');
});
