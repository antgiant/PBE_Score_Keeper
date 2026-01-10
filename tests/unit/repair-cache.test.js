const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('../helpers/dom');
const { buildMultiSessionSeed } = require('../helpers/yjs-seeds');

test('repairSessionNamesCache rebuilds missing cache', async () => {
  const { context } = loadApp(buildMultiSessionSeed(3));
  const { getGlobalDoc, repairSessionNamesCache } = context;

  // Remove the sessionNames cache to simulate the bug
  const meta = getGlobalDoc().getMap('meta');
  meta.delete('sessionNames');
  
  // Verify cache is missing
  assert.strictEqual(meta.get('sessionNames'), undefined, 'Cache should be missing initially');
  
  // Run repair
  await repairSessionNamesCache();
  
  // Verify cache was created
  const sessionNames = meta.get('sessionNames');
  assert.ok(sessionNames, 'Cache should exist after repair');
  assert.strictEqual(sessionNames.size, 3, 'Cache should have 3 entries');
});

test('repairSessionNamesCache skips repair when cache is complete', async () => {
  const { context } = loadApp(buildMultiSessionSeed(2));
  const { getGlobalDoc, repairSessionNamesCache } = context;

  // Verify cache exists and is complete
  const meta = getGlobalDoc().getMap('meta');
  const sessionOrder = meta.get('sessionOrder') || [];
  const sessionNames = meta.get('sessionNames');
  
  assert.ok(sessionNames, 'Cache should exist');
  assert.strictEqual(sessionNames.size, sessionOrder.length, 'Cache should be complete');
  
  // Store original size
  const originalSize = sessionNames.size;
  
  // Run repair (should do nothing)
  await repairSessionNamesCache();
  
  // Verify cache is unchanged
  const cachedNames = meta.get('sessionNames');
  assert.strictEqual(cachedNames.size, originalSize, 'Cache size should be unchanged');
});

test('repairSessionNamesCache handles partially missing cache', async () => {
  const { context } = loadApp(buildMultiSessionSeed(3));
  const { Y, getGlobalDoc, repairSessionNamesCache } = context;

  // Remove part of the cache to simulate partial corruption
  const meta = getGlobalDoc().getMap('meta');
  const sessionOrder = meta.get('sessionOrder') || [];
  
  // Create a partial cache (only first session)
  const partialCache = new Y.Map();
  partialCache.set(sessionOrder[0], 'Only First Session');
  meta.set('sessionNames', partialCache);
  
  // Verify cache is incomplete
  assert.strictEqual(meta.get('sessionNames').size, 1, 'Cache should be incomplete initially');
  
  // Run repair
  await repairSessionNamesCache();
  
  // Verify cache is now complete
  const repairedNames = meta.get('sessionNames');
  assert.strictEqual(repairedNames.size, 3, 'Cache should now have 3 entries');
});

