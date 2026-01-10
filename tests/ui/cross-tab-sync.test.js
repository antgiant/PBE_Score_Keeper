/**
 * Cross-tab synchronization tests
 * Tests BroadcastChannel-based sync between tabs
 */

const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('../helpers/dom');

test('BroadcastChannel sync function exists', () => {
  const { context } = loadApp();
  
  assert.strictEqual(typeof context.setupBroadcastChannelSync, 'function',
    'setupBroadcastChannelSync should be defined');
});

test('BroadcastChannel sync handles missing BroadcastChannel gracefully', () => {
  // Note: BroadcastChannel won't work in Node.js environment
  // This test verifies the function handles missing BroadcastChannel gracefully
  const { context } = loadApp();
  
  const doc = new context.Y.Doc();
  let channelReceived = null;
  
  // setupBroadcastChannelSync should handle missing BroadcastChannel gracefully
  context.setupBroadcastChannelSync(doc, 'test-channel', (channel) => {
    channelReceived = channel;
  });
  
  // In Node.js environment, BroadcastChannel is undefined, so callback shouldn't be called
  assert.strictEqual(channelReceived, null, 
    'Callback should not be called when BroadcastChannel is unavailable');
});

test('DocManager tracks BroadcastChannels for global and session docs', () => {
  const { context } = loadApp();
  
  assert.ok(context.DocManager.hasOwnProperty('globalBroadcast'),
    'DocManager should have globalBroadcast property');
  assert.ok(context.DocManager.hasOwnProperty('sessionBroadcasts'),
    'DocManager should have sessionBroadcasts property');
  assert.strictEqual(typeof context.DocManager.sessionBroadcasts.get, 'function',
    'sessionBroadcasts should have a get method');
  assert.strictEqual(typeof context.DocManager.sessionBroadcasts.set, 'function',
    'sessionBroadcasts should have a set method');
});
