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
// ============================================================================
// V4 UUID Session Tests
// ============================================================================

/**
 * Helper to create a minimal v4 session structure for testing
 */
function createV4Session(context, config = {}) {
  const testDoc = new context.Y.Doc();
  const session = testDoc.getMap('session');
  
  testDoc.transact(() => {
    // Mark as v4.0 session
    session.set('dataVersion', '4.0');
    session.set('id', 'test-v4-session');
    session.set('name', config.name || 'V4 Test Session');
    session.set('createdAt', Date.now());
    
    // Create teamsById and teamOrder
    const teamsById = new context.Y.Map();
    const teamOrder = new context.Y.Array();
    
    const teamNames = config.teams || ['Team A', 'Team B'];
    teamNames.forEach((name, i) => {
      const teamId = `t-test-${i + 1}`;
      const team = new context.Y.Map();
      team.set('id', teamId);
      team.set('name', name);
      team.set('deleted', false);
      team.set('createdAt', Date.now());
      teamsById.set(teamId, team);
      teamOrder.push([teamId]);
    });
    session.set('teamsById', teamsById);
    session.set('teamOrder', teamOrder);
    
    // Create blocksById and blockOrder
    const blocksById = new context.Y.Map();
    const blockOrder = new context.Y.Array();
    
    const blockNames = config.blocks || ['No Block'];
    blockNames.forEach((name, i) => {
      const blockId = `b-test-${i}`;
      const block = new context.Y.Map();
      block.set('id', blockId);
      block.set('name', name);
      block.set('deleted', false);
      block.set('isDefault', i === 0);
      block.set('createdAt', Date.now());
      blocksById.set(blockId, block);
      blockOrder.push([blockId]);
    });
    session.set('blocksById', blocksById);
    session.set('blockOrder', blockOrder);
    
    // Create questionsById and questionOrder
    const questionsById = new context.Y.Map();
    const questionOrder = new context.Y.Array();
    session.set('questionsById', questionsById);
    session.set('questionOrder', questionOrder);
  });
  
  return { doc: testDoc, session };
}

test('isUUIDSession returns true for v4.0 session', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { session } = createV4Session(context);
  assert.equal(context.isUUIDSession(session), true, 'v4.0 session should be detected as UUID session');
});

test('getOrderedTeams returns teams for v4 session', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { session } = createV4Session(context, { teams: ['Alpha', 'Beta', 'Gamma'] });
  const teams = context.getOrderedTeams(session);
  
  assert.equal(teams.length, 3);
  assert.equal(teams[0].id, 't-test-1');
  assert.equal(teams[0].data.get('name'), 'Alpha');
  assert.equal(teams[1].id, 't-test-2');
  assert.equal(teams[1].data.get('name'), 'Beta');
  assert.equal(teams[2].id, 't-test-3');
  assert.equal(teams[2].data.get('name'), 'Gamma');
});

test('getOrderedTeams excludes deleted teams', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { doc, session } = createV4Session(context, { teams: ['Alpha', 'Beta', 'Gamma'] });
  
  // Soft-delete the middle team
  doc.transact(() => {
    const teamsById = session.get('teamsById');
    const betaTeam = teamsById.get('t-test-2');
    betaTeam.set('deleted', true);
  });
  
  const teams = context.getOrderedTeams(session);
  assert.equal(teams.length, 2, 'Should only return non-deleted teams');
  assert.equal(teams[0].data.get('name'), 'Alpha');
  assert.equal(teams[1].data.get('name'), 'Gamma');
});

test('getOrderedBlocks returns blocks for v4 session', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { session } = createV4Session(context, { blocks: ['No Block', 'Block 1', 'Block 2'] });
  const blocks = context.getOrderedBlocks(session);
  
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].data.get('name'), 'No Block');
  assert.equal(blocks[1].data.get('name'), 'Block 1');
  assert.equal(blocks[2].data.get('name'), 'Block 2');
});

test('getTeamById returns team for v4 session', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { session } = createV4Session(context, { teams: ['FindMe'] });
  const team = context.getTeamById(session, 't-test-1');
  
  assert.ok(team, 'Team should be found');
  assert.equal(team.get('name'), 'FindMe');
});

test('getBlockById returns block for v4 session', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { session } = createV4Session(context, { blocks: ['Test Block'] });
  const block = context.getBlockById(session, 'b-test-0');
  
  assert.ok(block, 'Block should be found');
  assert.equal(block.get('name'), 'Test Block');
});

test('getTeamIdByDisplayIndex returns correct ID for v4 session', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { session } = createV4Session(context, { teams: ['First', 'Second', 'Third'] });
  
  // 1-based index
  assert.equal(context.getTeamIdByDisplayIndex(session, 1), 't-test-1');
  assert.equal(context.getTeamIdByDisplayIndex(session, 2), 't-test-2');
  assert.equal(context.getTeamIdByDisplayIndex(session, 3), 't-test-3');
  assert.equal(context.getTeamIdByDisplayIndex(session, 4), null, 'Out of bounds should return null');
});

test('getDisplayIndexByTeamId returns correct index for v4 session', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { session } = createV4Session(context, { teams: ['First', 'Second'] });
  
  // Returns 1-based index
  assert.equal(context.getDisplayIndexByTeamId(session, 't-test-1'), 1);
  assert.equal(context.getDisplayIndexByTeamId(session, 't-test-2'), 2);
  assert.equal(context.getDisplayIndexByTeamId(session, 't-fake'), 0, 'Unknown ID should return 0');
});

test('getBlockIdByDisplayIndex returns correct ID for v4 session', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { session } = createV4Session(context, { blocks: ['No Block', 'Block 1'] });
  
  // 0-based index for blocks
  assert.equal(context.getBlockIdByDisplayIndex(session, 0), 'b-test-0');
  assert.equal(context.getBlockIdByDisplayIndex(session, 1), 'b-test-1');
  assert.equal(context.getBlockIdByDisplayIndex(session, 2), null);
});

test('getDisplayIndexByBlockId returns correct index for v4 session', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { session } = createV4Session(context, { blocks: ['No Block', 'Block 1'] });
  
  assert.equal(context.getDisplayIndexByBlockId(session, 'b-test-0'), 0);
  assert.equal(context.getDisplayIndexByBlockId(session, 'b-test-1'), 1);
  assert.equal(context.getDisplayIndexByBlockId(session, 'b-fake'), -1);
});