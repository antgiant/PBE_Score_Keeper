/**
 * Unit tests for UUID data structure functions in app-yjs.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

test('generateTeamId creates prefixed UUID', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const teamId = context.generateTeamId();
  assert.ok(teamId.startsWith('t-'), 'Team ID should start with t-');
  assert.ok(teamId.length > 10, 'Team ID should have sufficient length');
});

test('generateQuestionId creates prefixed UUID', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const questionId = context.generateQuestionId();
  assert.ok(questionId.startsWith('q-'), 'Question ID should start with q-');
  assert.ok(questionId.length > 10, 'Question ID should have sufficient length');
});

test('generateBlockId creates prefixed UUID', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const blockId = context.generateBlockId();
  assert.ok(blockId.startsWith('b-'), 'Block ID should start with b-');
  assert.ok(blockId.length > 10, 'Block ID should have sufficient length');
});

test('generateUUID creates unique IDs', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const ids = new Set();
  for (let i = 0; i < 100; i++) {
    ids.add(context.generateUUID());
  }
  assert.equal(ids.size, 100, 'All 100 UUIDs should be unique');
});

test('isUUIDSession returns false for v3.0 session', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Test Session',
      teams: ['Team A'],
      blocks: ['No Block'],
      questions: []
    }]
  }));
  
  const session = context.get_current_session();
  assert.equal(context.isUUIDSession(session), false, 'v3.0 session should not be UUID session');
});

test('isDeleted returns true for deleted items', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Create a Y.Map inside a Y.Doc to avoid "Invalid access" errors
  const testDoc = new context.Y.Doc();
  const testMap = testDoc.getMap('test');
  
  testDoc.transact(() => {
    // Create deleted item
    const deletedItem = new context.Y.Map();
    deletedItem.set('deleted', true);
    testMap.set('deletedItem', deletedItem);
    
    // Create active item  
    const activeItem = new context.Y.Map();
    activeItem.set('deleted', false);
    testMap.set('activeItem', activeItem);
  });
  
  assert.equal(context.isDeleted(testMap.get('deletedItem')), true);
  assert.equal(context.isDeleted(testMap.get('activeItem')), false);
  assert.equal(context.isDeleted(null), true, 'null should be treated as deleted');
});

test('softDelete sets deleted flag and timestamp', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Create a Y.Map inside a Y.Doc
  const testDoc = new context.Y.Doc();
  const testMap = testDoc.getMap('test');
  
  testDoc.transact(() => {
    const item = new context.Y.Map();
    item.set('name', 'Test Item');
    item.set('deleted', false);
    testMap.set('item', item);
  });
  
  const item = testMap.get('item');
  const beforeDelete = Date.now();
  context.softDelete(item);
  const afterDelete = Date.now();
  
  assert.equal(item.get('deleted'), true);
  const deletedAt = item.get('deletedAt');
  assert.ok(deletedAt >= beforeDelete && deletedAt <= afterDelete, 'deletedAt should be current timestamp');
});

test('DATA_VERSION constants are defined', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  assert.equal(context.DATA_VERSION_CURRENT, '3.0');
  assert.equal(context.DATA_VERSION_UUID, '4.0');
  assert.equal(context.MIN_SYNC_VERSION, '3.0');
});

test('getOrderedTeams returns empty for v3 session', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Test',
      teams: ['Team A', 'Team B'],
      blocks: ['No Block'],
      questions: []
    }]
  }));
  
  const session = context.get_current_session();
  const teams = context.getOrderedTeams(session);
  assert.equal(teams.length, 0, 'v3 session should return empty for UUID functions');
});

test('getOrderedQuestions returns empty for v3 session', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Test',
      teams: ['Team A'],
      blocks: ['No Block'],
      questions: [{ score: 10, block: 0, teamScores: [5] }]
    }]
  }));
  
  const session = context.get_current_session();
  const questions = context.getOrderedQuestions(session);
  assert.equal(questions.length, 0, 'v3 session should return empty for UUID functions');
});

test('getOrderedBlocks returns empty for v3 session', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Test',
      teams: ['Team A'],
      blocks: ['No Block', 'Block 1'],
      questions: []
    }]
  }));
  
  const session = context.get_current_session();
  const blocks = context.getOrderedBlocks(session);
  assert.equal(blocks.length, 0, 'v3 session should return empty for UUID functions');
});

test('getTeamById returns null for v3 session', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Test',
      teams: ['Team A'],
      blocks: ['No Block'],
      questions: []
    }]
  }));
  
  const session = context.get_current_session();
  const team = context.getTeamById(session, 't-fake-id');
  assert.equal(team, null);
});

test('getQuestionById returns null for v3 session', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Test',
      teams: ['Team A'],
      blocks: ['No Block'],
      questions: [{ score: 10, block: 0, teamScores: [5] }]
    }]
  }));
  
  const session = context.get_current_session();
  const question = context.getQuestionById(session, 'q-fake-id');
  assert.equal(question, null);
});

test('getBlockById returns null for v3 session', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Test',
      teams: ['Team A'],
      blocks: ['No Block'],
      questions: []
    }]
  }));
  
  const session = context.get_current_session();
  const block = context.getBlockById(session, 'b-fake-id');
  assert.equal(block, null);
});

test('getTeamScore returns null for v3 session', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Test',
      teams: ['Team A'],
      blocks: ['No Block'],
      questions: [{ score: 10, block: 0, teamScores: [5] }]
    }]
  }));
  
  const session = context.get_current_session();
  const score = context.getTeamScore(session, 'q-fake', 't-fake');
  assert.equal(score, null);
});

test('getTeamIdByDisplayIndex returns null for v3 session', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Test',
      teams: ['Team A', 'Team B'],
      blocks: ['No Block'],
      questions: []
    }]
  }));
  
  const session = context.get_current_session();
  const teamId = context.getTeamIdByDisplayIndex(session, 1);
  assert.equal(teamId, null);
});

test('getDisplayIndexByTeamId returns 0 for v3 session', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Test',
      teams: ['Team A'],
      blocks: ['No Block'],
      questions: []
    }]
  }));
  
  const session = context.get_current_session();
  const index = context.getDisplayIndexByTeamId(session, 't-fake');
  assert.equal(index, 0);
});
