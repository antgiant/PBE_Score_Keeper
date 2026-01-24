/**
 * Sync Accessibility Tests
 * Tests ARIA attributes, escapeHtml, and accessible functions
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
// createConnectDialogHTML Tests
// ============================================

test('Accessibility - createConnectDialogHTML has proper ARIA attributes', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  const html = context.createConnectDialogHTML();
  
  // Check dialog role
  assert.ok(html.includes('role="dialog"'), 'Should have role="dialog"');
  assert.ok(html.includes('aria-modal="true"'), 'Should have aria-modal="true"');
  assert.ok(html.includes('aria-labelledby="sync-dialog-title"'), 'Should reference title via aria-labelledby');
  
  // Check title ID
  assert.ok(html.includes('id="sync-dialog-title"'), 'Should have title with correct ID');
  
  // Check form accessibility
  assert.ok(html.includes('aria-required="true"'), 'Display name should be required');
  assert.ok(html.includes('aria-describedby="room-code-hint"'), 'Room code should reference hint');
  assert.ok(html.includes('aria-describedby="password-hint"'), 'Password should reference hint');
});

test('Accessibility - createConnectDialogHTML has form labels', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  const html = context.createConnectDialogHTML();
  
  // Check labels exist
  assert.ok(html.includes('for="sync-display-name"'), 'Should have label for display name');
  assert.ok(html.includes('for="sync-room-code"'), 'Should have label for room code');
  assert.ok(html.includes('for="sync-password"'), 'Should have label for password');
  
  // Check inputs exist
  assert.ok(html.includes('id="sync-display-name"'), 'Should have display name input');
  assert.ok(html.includes('id="sync-room-code"'), 'Should have room code input');
  assert.ok(html.includes('id="sync-password"'), 'Should have password input');
});

test('Accessibility - createConnectDialogHTML has visually-hidden legend', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  const html = context.createConnectDialogHTML();
  
  // Check fieldset with legend
  assert.ok(html.includes('<fieldset'), 'Should have fieldset');
  assert.ok(html.includes('<legend'), 'Should have legend');
  assert.ok(html.includes('visually-hidden'), 'Legend should be visually hidden');
});

// ============================================
// createDisconnectDialogHTML Tests
// ============================================

test('Accessibility - createDisconnectDialogHTML has proper ARIA attributes', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  // Set up SyncManager state for disconnect dialog
  context.SyncManager.state = 'connected';
  context.SyncManager.roomCode = 'ABC123';
  context.SyncManager.displayName = 'TestUser';
  
  // Mock t_plural if needed
  if (!context.t_plural) {
    context.t_plural = (key, count, params) => `${count} peers`;
  }
  
  const html = context.createDisconnectDialogHTML();
  
  // Check dialog role
  assert.ok(html.includes('role="dialog"'), 'Should have role="dialog"');
  assert.ok(html.includes('aria-modal="true"'), 'Should have aria-modal="true"');
  
  // Room code should have aria-label for screen readers
  assert.ok(html.includes('aria-label'), 'Room code should have aria-label');
  assert.ok(html.includes('ABC123'), 'Should display room code');
});

// ============================================
// createMatchingDialogHTML Tests
// ============================================

test('Accessibility - createMatchingDialogHTML has proper ARIA attributes', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  const comparison = {
    teams: { matches: [], unmatched: { local: [], remote: [] }, needsReview: false },
    blocks: { matches: [], unmatched: { local: [], remote: [] }, needsReview: false },
    questions: { matches: [], unmatched: { local: [], remote: [] }, needsReview: false }
  };
  
  const html = context.createMatchingDialogHTML(comparison);
  
  // Check dialog role
  assert.ok(html.includes('role="dialog"'), 'Should have role="dialog"');
  assert.ok(html.includes('aria-modal="true"'), 'Should have aria-modal="true"');
  assert.ok(html.includes('aria-labelledby="matching-dialog-title"'), 'Should reference matching title');
});

// ============================================
// escapeHtml Tests
// ============================================

test('Accessibility - escapeHtml function exists', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  assert.strictEqual(typeof context.escapeHtml, 'function', 'escapeHtml should be a function');
});

// ============================================
// trapFocus Tests
// ============================================

test('Accessibility - trapFocus function exists', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  assert.strictEqual(typeof context.trapFocus, 'function', 'trapFocus should be a function');
});

// ============================================
// announceToScreenReader Tests
// ============================================

test('Accessibility - announceToScreenReader function exists', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  assert.strictEqual(typeof context.announceToScreenReader, 'function', 'announceToScreenReader should be a function');
});

// ============================================
// showToast Tests
// ============================================

test('Accessibility - showToast function exists', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  assert.strictEqual(typeof context.showToast, 'function', 'showToast should be a function');
});

// ============================================
// SyncManager previousFocus Tests
// ============================================

test('Accessibility - SyncManager has previousFocus property', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  assert.ok('previousFocus' in context.SyncManager, 'SyncManager should have previousFocus property');
  assert.strictEqual(context.SyncManager.previousFocus, null, 'previousFocus should start as null');
});

// ============================================
// Dialog Functions Tests
// ============================================

test('Accessibility - showSyncDialog function exists', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  assert.strictEqual(typeof context.showSyncDialog, 'function', 'showSyncDialog should be a function');
});

test('Accessibility - closeSyncDialog function exists', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  assert.strictEqual(typeof context.closeSyncDialog, 'function', 'closeSyncDialog should be a function');
});

test('Accessibility - showSyncError function exists', (t) => {
  const { context } = loadApp(createBasicSeed());
  
  assert.strictEqual(typeof context.showSyncError, 'function', 'showSyncError should be a function');
});
