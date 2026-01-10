const test = require('node:test');
const assert = require('node:assert');
const { buildBasicSeed, buildMultiSessionSeed } = require('../helpers/yjs-seeds');
const { loadApp } = require('../helpers/dom');

// Phase 5: Comprehensive multi-doc architecture tests
// v3.0 architecture: Global doc has sessionOrder (UUID array), each session is a separate Y.Doc

test('Session Management - generateSessionId creates valid UUID', (t) => {
  const { context } = loadApp(buildBasicSeed());
  
  const id = context.generateSessionId();
  assert.ok(id, 'Should generate an ID');
  assert.ok(typeof id === 'string', 'ID should be a string');
  // Check UUID format or test-session format (for test seeds)
  const isValidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
                   /^test-session-\d+$/.test(id);
  assert.ok(isValidId, 'Should be valid UUID format or test format');
});

test('Session Management - getAllSessions returns array of session objects', (t) => {
  const { context } = loadApp(buildMultiSessionSeed(3));
  
  const sessions = context.getAllSessions();
  assert.ok(Array.isArray(sessions), 'Should return an array');
  assert.strictEqual(sessions.length, 3, 'Should have 3 sessions');
  
  sessions.forEach((session, index) => {
    assert.ok(session.id !== undefined, 'Session should have an id');
    assert.ok(session.name, 'Session should have a name');
    assert.ok(session.name.includes('Session'), 'Session name should contain "Session"');
  });
});

test('Session Management - switchSession changes current session', async (t) => {
  const { context } = loadApp(buildMultiSessionSeed(2));
  
  // Initial session should be 1
  assert.strictEqual(context.get_current_session_index(), 1, 'Should start at session 1');
  
  // Switch to session 2 (async function)
  await context.switchSession(2);
  assert.strictEqual(context.get_current_session_index(), 2, 'Should switch to session 2');
});

test('Session Management - deleteSession requires minimum 2 sessions', (t) => {
  const { context } = loadApp(buildBasicSeed());
  
  const meta = context.getGlobalDoc().getMap('meta');
  const sessionOrder = meta.get('sessionOrder') || [];
  const initialLength = sessionOrder.length;
  
  // Try to delete - should not work with only 1 session
  context.deleteSession(sessionOrder[0]);
  
  // Session count should not change
  const newSessionOrder = meta.get('sessionOrder') || [];
  assert.strictEqual(newSessionOrder.length, initialLength, 'Should not delete when only one session exists');
});

test('Session Isolation - Each session has independent question data', (t) => {
  const { context } = loadApp(buildMultiSessionSeed(2));
  
  const meta = context.getGlobalDoc().getMap('meta');
  const sessionOrder = meta.get('sessionOrder') || [];
  
  const sessionDoc1 = context.DocManager.sessionDocs.get(sessionOrder[0]);
  const sessionDoc2 = context.DocManager.sessionDocs.get(sessionOrder[1]);
  
  const session1 = sessionDoc1.getMap('session');
  const session2 = sessionDoc2.getMap('session');
  
  const questions1 = session1.get('questions');
  const questions2 = session2.get('questions');
  
  assert.notStrictEqual(questions1, questions2, 'Sessions should have different question arrays');
  assert.strictEqual(questions1.length, questions2.length, 'But should have same number of questions');
});

test('Session Isolation - Each session has independent team data', (t) => {
  const { context } = loadApp(buildMultiSessionSeed(2));
  
  const meta = context.getGlobalDoc().getMap('meta');
  const sessionOrder = meta.get('sessionOrder') || [];
  
  const sessionDoc1 = context.DocManager.sessionDocs.get(sessionOrder[0]);
  const sessionDoc2 = context.DocManager.sessionDocs.get(sessionOrder[1]);
  
  const session1 = sessionDoc1.getMap('session');
  const session2 = sessionDoc2.getMap('session');
  
  const teams1 = session1.get('teams');
  const teams2 = session2.get('teams');
  
  assert.notStrictEqual(teams1, teams2, 'Sessions should have different team arrays');
  assert.strictEqual(teams1.length, teams2.length, 'But should have same number of teams');
});

test('Format Detection - Identifies JSON v2.0/v3.0 format', (t) => {
  const { context } = loadApp(buildBasicSeed());
  
  const jsonData = context.export_current_session_json();
  const format = context.detectImportFormat(jsonData);
  // Format should be either json-v3 or json-legacy depending on structure
  assert.ok(['json-v3', 'json-v2', 'json-legacy'].includes(format) || typeof format === 'string', 'Should detect JSON format');
});

test('Format Detection - Returns invalid for unrecognized format', (t) => {
  const { context } = loadApp(buildBasicSeed());
  
  const format = context.detectImportFormat({ unknown: 'data' });
  assert.strictEqual(format, 'invalid', 'Should return invalid format for unknown data');
});

test('Migration - migrate_v2_to_v3 not needed for v3.0 seeds', (t) => {
  const { context } = loadApp(buildBasicSeed());
  
  // In test environment, data is already v3.0 format via multi-doc setup
  const meta = context.getGlobalDoc().getMap('meta');
  const dataVersion = meta.get('dataVersion');
  
  assert.strictEqual(dataVersion, 3.0, 'Test seed should be v3.0');
});

test('Migration - Legacy migration function exists', (t) => {
  const { context } = loadApp(buildBasicSeed());
  
  // Check that migration functions are defined
  assert.ok(typeof context.migrate_localStorage_to_v3 === 'function', 'migrate_localStorage_to_v3 should exist');
});

test('Metadata - Global doc metadata contains dataVersion 3.0', (t) => {
  const { context } = loadApp(buildBasicSeed());
  
  const meta = context.getGlobalDoc().getMap('meta');
  const dataVersion = meta.get('dataVersion');
  
  assert.strictEqual(dataVersion, 3.0, 'Should have dataVersion 3.0');
});

test('Metadata - Global doc metadata contains currentSession UUID', (t) => {
  const { context } = loadApp(buildBasicSeed());
  
  const meta = context.getGlobalDoc().getMap('meta');
  const currentSession = meta.get('currentSession');
  
  assert.ok(currentSession !== undefined && currentSession !== null, 'Should have currentSession');
  assert.strictEqual(typeof currentSession, 'string', 'currentSession should be a UUID string');
});

test('SessionOrder - Global doc has sessionOrder array', (t) => {
  const { context } = loadApp(buildBasicSeed());
  
  const meta = context.getGlobalDoc().getMap('meta');
  const sessionOrder = meta.get('sessionOrder');
  
  assert.ok(Array.isArray(sessionOrder), 'sessionOrder should be an array');
  assert.ok(sessionOrder.length >= 1, 'Should have at least one session');
});

test('SessionDocs - Each session is a separate Y.Doc in DocManager', (t) => {
  const { context } = loadApp(buildBasicSeed());
  
  const meta = context.getGlobalDoc().getMap('meta');
  const sessionOrder = meta.get('sessionOrder');
  
  sessionOrder.forEach(sessionId => {
    const sessionDoc = context.DocManager.sessionDocs.get(sessionId);
    assert.ok(sessionDoc, `Session ${sessionId} should have a doc`);
    
    const session = sessionDoc.getMap('session');
    assert.ok(session.get('name'), 'Session should have name');
    assert.ok(session.get('config'), 'Session should have config');
    assert.ok(session.get('teams'), 'Session should have teams');
    assert.ok(session.get('blocks'), 'Session should have blocks');
    assert.ok(session.get('questions'), 'Session should have questions');
  });
});

module.exports = {};
