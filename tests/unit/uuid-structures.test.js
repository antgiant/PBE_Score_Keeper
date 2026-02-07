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

test('generateQuestionId creates prefixed UUID when no session provided', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Without session parameter, falls back to UUID
  const questionId = context.generateQuestionId();
  assert.ok(questionId.startsWith('q-'), 'Question ID should start with q-');
  assert.ok(questionId.length > 10, 'Question ID should have sufficient length (UUID fallback)');
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

test('isUUIDSession returns true for v5.0 session', () => {
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
  assert.equal(context.isUUIDSession(session), true, 'v5.0 session should be UUID session');
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

test('getOrderedTeams returns teams for v5 session', () => {
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
  assert.equal(teams.length, 2, 'v5 session should return all teams');
  assert.equal(teams[0].data.get('name'), 'Team A');
  assert.equal(teams[1].data.get('name'), 'Team B');
});

test('getOrderedQuestions returns questions for v5 session', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Test',
      teams: ['Team A'],
      blocks: ['No Block'],
      questions: [{ score: 10 }]
    }]
  }));
  
  const session = context.get_current_session();
  const questions = context.getOrderedQuestions(session);
  assert.equal(questions.length, 1, 'v5 session should return all questions');
  assert.equal(questions[0].data.get('score'), 10);
});

test('getOrderedBlocks returns blocks for v5 session', () => {
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
  assert.equal(blocks.length, 2, 'v5 session should return all blocks');
  assert.equal(blocks[0].data.get('name'), 'No Block');
  assert.equal(blocks[1].data.get('name'), 'Block 1');
});

test('getTeamById returns team for v5 session', () => {
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
  const teams = context.getOrderedTeams(session);
  const teamId = teams[0].id;
  const team = context.getTeamById(session, teamId);
  assert.ok(team, 'Should find team by ID');
  assert.equal(team.get('name'), 'Team A');
  // Also test non-existent ID returns null
  assert.equal(context.getTeamById(session, 't-nonexistent'), null);
});

test('getQuestionById returns question for v5 session', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Test',
      teams: ['Team A'],
      blocks: ['No Block'],
      questions: [{ score: 10 }]
    }]
  }));
  
  const session = context.get_current_session();
  const questions = context.getOrderedQuestions(session);
  const questionId = questions[0].id;
  const question = context.getQuestionById(session, questionId);
  assert.ok(question, 'Should find question by ID');
  assert.equal(question.get('score'), 10);
  // Also test non-existent ID returns null
  assert.equal(context.getQuestionById(session, 'q-nonexistent'), null);
});

test('getBlockById returns block for v5 session', () => {
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
  const blocks = context.getOrderedBlocks(session);
  const blockId = blocks[0].id;
  const block = context.getBlockById(session, blockId);
  assert.ok(block, 'Should find block by ID');
  assert.equal(block.get('name'), 'No Block');
  // Also test non-existent ID returns null
  assert.equal(context.getBlockById(session, 'b-nonexistent'), null);
});

test('getTeamScore returns score for v5 session', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Test',
      teams: ['Team A'],
      blocks: ['No Block'],
      questions: [{ score: 10 }]
    }]
  }));
  
  const session = context.get_current_session();
  const teams = context.getOrderedTeams(session);
  const questions = context.getOrderedQuestions(session);
  const teamId = teams[0].id;
  const questionId = questions[0].id;
  
  const scoreData = context.getTeamScore(session, questionId, teamId);
  assert.ok(scoreData, 'Should return score data');
  assert.equal(typeof scoreData.score, 'number', 'Should have score number');
  // Test non-existent returns null
  assert.equal(context.getTeamScore(session, 'q-fake', 't-fake'), null);
});

test('getTeamIdByDisplayIndex returns correct ID for v5 session', () => {
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
  
  // 1-based index
  assert.equal(context.getTeamIdByDisplayIndex(session, 1), teams[0].id);
  assert.equal(context.getTeamIdByDisplayIndex(session, 2), teams[1].id);
  assert.equal(context.getTeamIdByDisplayIndex(session, 3), null, 'Out of bounds should return null');
});

test('getDisplayIndexByTeamId returns correct index for v5 session', () => {
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
  
  // Returns 1-based index
  assert.equal(context.getDisplayIndexByTeamId(session, teams[0].id), 1);
  assert.equal(context.getDisplayIndexByTeamId(session, teams[1].id), 2);
  assert.equal(context.getDisplayIndexByTeamId(session, 't-fake'), 0, 'Unknown ID should return 0');
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
    
    // Create questions from config if provided
    const questionConfigs = config.questions || [];
    const defaultBlockId = blockOrder.length > 0 ? blockOrder.get(0) : null;
    
    questionConfigs.forEach((qConfig, i) => {
      const questionId = `q-test-${i + 1}`;
      const question = new context.Y.Map();
      question.set('id', questionId);
      question.set('name', qConfig.name || '');
      question.set('score', qConfig.score || 0);
      question.set('blockId', qConfig.blockId || defaultBlockId);
      question.set('ignore', qConfig.ignore || false);
      question.set('deleted', false);
      question.set('createdAt', Date.now());
      
      // Initialize team scores for all teams
      const teamScores = new context.Y.Map();
      teamNames.forEach((_, ti) => {
        const teamId = `t-test-${ti + 1}`;
        const scoreData = new context.Y.Map();
        scoreData.set('score', 0);
        scoreData.set('scoreUpdatedAt', Date.now());
        scoreData.set('extraCredit', 0);
        scoreData.set('extraCreditUpdatedAt', Date.now());
        teamScores.set(teamId, scoreData);
      });
      question.set('teamScores', teamScores);
      
      questionsById.set(questionId, question);
      questionOrder.push([questionId]);
    });
    
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

// ============================================================================
// Migration Function Tests
// ============================================================================

test('migrateSessionToUUID migrates teams correctly', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Create a v3 session manually
  const testDoc = new context.Y.Doc();
  const session = testDoc.getMap('session');
  
  testDoc.transact(() => {
    session.set('name', 'V3 Test Session');
    
    // v3 teams (1-indexed with null at 0)
    const teams = new context.Y.Array();
    teams.push([null]);
    
    const team1 = new context.Y.Map();
    team1.set('name', 'Alpha');
    teams.push([team1]);
    
    const team2 = new context.Y.Map();
    team2.set('name', 'Beta');
    teams.push([team2]);
    
    session.set('teams', teams);
    
    // v3 blocks (0-indexed)
    const blocks = new context.Y.Array();
    const block0 = new context.Y.Map();
    block0.set('name', 'No Block');
    blocks.push([block0]);
    session.set('blocks', blocks);
    
    // v3 questions (1-indexed with null at 0)
    const questions = new context.Y.Array();
    questions.push([null]);
    session.set('questions', questions);
  });
  
  // Run migration
  const result = context.migrateSessionToUUID(testDoc);
  
  assert.equal(result.success, true, 'Migration should succeed');
  assert.equal(result.stats.teams, 2, 'Should migrate 2 teams');
  
  // Verify v4 structure
  assert.equal(context.isUUIDSession(session), true, 'Session should now be UUID-based');
  assert.equal(session.get('dataVersion'), '4.0');
  
  // Verify teams
  const orderedTeams = context.getOrderedTeams(session);
  assert.equal(orderedTeams.length, 2);
  assert.equal(orderedTeams[0].data.get('name'), 'Alpha');
  assert.equal(orderedTeams[1].data.get('name'), 'Beta');
  
  // Verify old structure removed
  assert.equal(session.get('teams'), undefined, 'Old teams array should be removed');
});

test('migrateSessionToUUID migrates questions with team scores', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Create a v3 session with questions
  const testDoc = new context.Y.Doc();
  const session = testDoc.getMap('session');
  
  testDoc.transact(() => {
    session.set('name', 'V3 Questions Test');
    
    // Teams
    const teams = new context.Y.Array();
    teams.push([null]);
    const team1 = new context.Y.Map();
    team1.set('name', 'Team 1');
    teams.push([team1]);
    session.set('teams', teams);
    
    // Blocks
    const blocks = new context.Y.Array();
    const block0 = new context.Y.Map();
    block0.set('name', 'No Block');
    blocks.push([block0]);
    session.set('blocks', blocks);
    
    // Questions with scores
    const questions = new context.Y.Array();
    questions.push([null]);
    
    const q1 = new context.Y.Map();
    q1.set('name', 'Question 1');
    q1.set('score', 10);
    q1.set('block', 0);
    q1.set('ignore', false);
    
    // Team scores
    const qTeams = new context.Y.Array();
    qTeams.push([null]);
    const teamScore = new context.Y.Map();
    teamScore.set('score', 7);
    teamScore.set('extraCredit', 2);
    qTeams.push([teamScore]);
    q1.set('teams', qTeams);
    
    questions.push([q1]);
    session.set('questions', questions);
  });
  
  // Run migration
  const result = context.migrateSessionToUUID(testDoc);
  
  assert.equal(result.success, true);
  assert.equal(result.stats.questions, 1);
  assert.equal(result.stats.teamScores, 1);
  
  // Verify question migrated
  const orderedQuestions = context.getOrderedQuestions(session);
  assert.equal(orderedQuestions.length, 1);
  assert.equal(orderedQuestions[0].data.get('name'), 'Question 1');
  assert.equal(orderedQuestions[0].data.get('score'), 10);
  
  // Verify team scores migrated
  const teamScores = orderedQuestions[0].data.get('teamScores');
  assert.ok(teamScores, 'Question should have teamScores');
  
  // Get the team ID from the order
  const orderedTeams = context.getOrderedTeams(session);
  const teamId = orderedTeams[0].id;
  const scoreData = teamScores.get(teamId);
  
  assert.ok(scoreData, 'Team score should exist');
  assert.equal(scoreData.get('score'), 7);
  assert.equal(scoreData.get('extraCredit'), 2);
});

test('migrateSessionToUUID skips already-migrated sessions', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Create a v4 session
  const { doc, session } = createV4Session(context);
  
  // Try to migrate
  const result = context.migrateSessionToUUID(doc);
  
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'already-migrated');
});

test('migrateSessionToUUID preserves block assignment', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const testDoc = new context.Y.Doc();
  const session = testDoc.getMap('session');
  
  testDoc.transact(() => {
    session.set('name', 'Block Test');
    
    // Teams
    const teams = new context.Y.Array();
    teams.push([null]);
    const team1 = new context.Y.Map();
    team1.set('name', 'Team 1');
    teams.push([team1]);
    session.set('teams', teams);
    
    // Multiple blocks
    const blocks = new context.Y.Array();
    const block0 = new context.Y.Map();
    block0.set('name', 'No Block');
    blocks.push([block0]);
    const block1 = new context.Y.Map();
    block1.set('name', 'Block A');
    blocks.push([block1]);
    session.set('blocks', blocks);
    
    // Question assigned to block 1
    const questions = new context.Y.Array();
    questions.push([null]);
    const q1 = new context.Y.Map();
    q1.set('name', 'Q in Block A');
    q1.set('score', 5);
    q1.set('block', 1);  // v3 block index
    q1.set('ignore', false);
    q1.set('teams', new context.Y.Array());
    questions.push([q1]);
    session.set('questions', questions);
  });
  
  // Run migration
  const result = context.migrateSessionToUUID(testDoc);
  assert.equal(result.success, true);
  
  // Verify block assignment preserved
  const orderedQuestions = context.getOrderedQuestions(session);
  const orderedBlocks = context.getOrderedBlocks(session);
  
  const questionBlockId = orderedQuestions[0].data.get('blockId');
  const blockAId = orderedBlocks[1].id;
  
  assert.equal(questionBlockId, blockAId, 'Question should be assigned to Block A');
  assert.equal(orderedBlocks[1].data.get('name'), 'Block A');
});

// ============================================================================
// V4 Reorder Tests (CRDT-safe)
// ============================================================================

test('v4 reorder_teams only modifies teamOrder array', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Create v4 session with 3 teams
  const { doc, session } = createV4Session(context, { teams: ['Alpha', 'Beta', 'Gamma'] });
  
  // Record initial team IDs
  const initialTeamOrder = session.get('teamOrder');
  const t1 = initialTeamOrder.get(0);
  const t2 = initialTeamOrder.get(1);
  const t3 = initialTeamOrder.get(2);
  
  // Simulate reorder via direct function call: reverse order [3, 2, 1]
  // In the app, order comes from UI as 1-based strings
  doc.transact(() => {
    const teamOrder = session.get('teamOrder');
    
    // Build new order of UUIDs: order [3,2,1] means index 2,1,0
    const oldUUIDs = [t1, t2, t3];
    const newUUIDs = [t3, t2, t1];  // Reverse
    
    teamOrder.delete(0, teamOrder.length);
    teamOrder.push(newUUIDs);
  });
  
  // Verify reorder worked
  const reorderedTeams = context.getOrderedTeams(session);
  assert.equal(reorderedTeams.length, 3);
  assert.equal(reorderedTeams[0].data.get('name'), 'Gamma');  // Was 3rd, now 1st
  assert.equal(reorderedTeams[1].data.get('name'), 'Beta');   // Was 2nd, still 2nd
  assert.equal(reorderedTeams[2].data.get('name'), 'Alpha');  // Was 1st, now 3rd
  
  // Verify UUIDs preserved (same teams, just reordered)
  assert.equal(reorderedTeams[0].id, t3);
  assert.equal(reorderedTeams[1].id, t2);
  assert.equal(reorderedTeams[2].id, t1);
  
  // Verify teamsById unchanged (all teams still exist with same data)
  const teamsById = session.get('teamsById');
  assert.equal(teamsById.size, 3);
  assert.equal(teamsById.get(t1).get('name'), 'Alpha');
  assert.equal(teamsById.get(t2).get('name'), 'Beta');
  assert.equal(teamsById.get(t3).get('name'), 'Gamma');
});

test('v4 reorder_blocks only modifies blockOrder array', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Create v4 session with 3 blocks (default + 2 custom)
  const { doc, session } = createV4Session(context, { blocks: ['No Block', 'Block A', 'Block B'] });
  
  // Record initial block IDs
  const initialBlockOrder = session.get('blockOrder');
  const b0 = initialBlockOrder.get(0);  // No Block (default)
  const b1 = initialBlockOrder.get(1);  // Block A
  const b2 = initialBlockOrder.get(2);  // Block B
  
  // Simulate reorder of non-default blocks: swap [2, 1] (B, A)
  doc.transact(() => {
    const blockOrder = session.get('blockOrder');
    
    // Keep default block first, reorder custom blocks
    const newUUIDs = [b0, b2, b1];  // Swap Block A and Block B
    
    blockOrder.delete(0, blockOrder.length);
    blockOrder.push(newUUIDs);
  });
  
  // Verify reorder worked
  const reorderedBlocks = context.getOrderedBlocks(session);
  assert.equal(reorderedBlocks.length, 3);
  assert.equal(reorderedBlocks[0].data.get('name'), 'No Block');  // Still first
  assert.equal(reorderedBlocks[1].data.get('name'), 'Block B');   // Was 3rd, now 2nd
  assert.equal(reorderedBlocks[2].data.get('name'), 'Block A');   // Was 2nd, now 3rd
  
  // Verify UUIDs preserved
  assert.equal(reorderedBlocks[0].id, b0);
  assert.equal(reorderedBlocks[1].id, b2);
  assert.equal(reorderedBlocks[2].id, b1);
});

// ============================================================================
// WRITE OPERATIONS TESTS
// ============================================================================

test('softDeleteTeam marks team as deleted', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Create v4 session with multiple teams
  const { doc, session } = createV4Session(context, { teams: ['Team A', 'Team B', 'Team C'] });
  
  // Get team UUIDs
  const teams = context.getOrderedTeams(session);
  assert.equal(teams.length, 3);
  const teamBId = teams[1].id;
  
  // Soft delete Team B
  const result = context.softDeleteTeam(doc, session, teamBId);
  assert.equal(result, true, 'Should return true on successful delete');
  
  // Verify team is excluded from ordered list
  const remainingTeams = context.getOrderedTeams(session);
  assert.equal(remainingTeams.length, 2, 'Should have 2 remaining teams');
  assert.equal(remainingTeams[0].data.get('name'), 'Team A');
  assert.equal(remainingTeams[1].data.get('name'), 'Team C');
  
  // Verify team still exists in teamsById but is deleted
  const teamsById = session.get('teamsById');
  const deletedTeam = teamsById.get(teamBId);
  assert.ok(deletedTeam, 'Team should still exist in teamsById');
  assert.equal(deletedTeam.get('deleted'), true, 'Team should be marked deleted');
  assert.ok(deletedTeam.get('deletedAt'), 'Team should have deletedAt timestamp');
});

test('softDeleteBlock moves questions to default block', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Create v4 session with blocks
  const { doc, session } = createV4Session(context, { 
    teams: ['Team A'], 
    blocks: ['No Block', 'Block 1'],
    questions: [{ score: 5 }, { score: 10 }]
  });
  
  // Get block UUIDs
  const blocks = context.getOrderedBlocks(session);
  const defaultBlockId = blocks[0].id;
  const block1Id = blocks[1].id;
  
  // Assign a question to Block 1
  const questions = context.getOrderedQuestions(session);
  doc.transact(() => {
    questions[1].data.set('blockId', block1Id);
  });
  
  // Verify question is in Block 1
  assert.equal(questions[1].data.get('blockId'), block1Id);
  
  // Delete Block 1
  const result = context.softDeleteBlock(doc, session, block1Id);
  assert.equal(result, true, 'Should return true on successful delete');
  
  // Verify block is deleted
  const remainingBlocks = context.getOrderedBlocks(session);
  assert.equal(remainingBlocks.length, 1, 'Should have only default block');
  
  // Refresh question reference and verify it was moved to default block
  const updatedQuestions = context.getOrderedQuestions(session);
  assert.equal(updatedQuestions[1].data.get('blockId'), defaultBlockId, 'Question should be moved to default block');
});

test('softDeleteBlock cannot delete default block', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { doc, session } = createV4Session(context, { blocks: ['No Block'] });
  
  const blocks = context.getOrderedBlocks(session);
  const defaultBlockId = blocks[0].id;
  
  const result = context.softDeleteBlock(doc, session, defaultBlockId);
  assert.equal(result, false, 'Should return false when trying to delete default block');
  
  // Verify block still exists
  const remainingBlocks = context.getOrderedBlocks(session);
  assert.equal(remainingBlocks.length, 1);
});

test('setTeamScore updates team score for question', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { doc, session } = createV4Session(context, { 
    teams: ['Team A', 'Team B'], 
    questions: [{ score: 10 }]
  });
  
  const teams = context.getOrderedTeams(session);
  const questions = context.getOrderedQuestions(session);
  const teamAId = teams[0].id;
  const questionId = questions[0].id;
  
  // Set Team A's score to 8
  const result = context.setTeamScore(doc, session, questionId, teamAId, 8);
  assert.equal(result, true, 'Should return true on successful update');
  
  // Verify score was updated
  const scoreData = context.getTeamScore(session, questionId, teamAId);
  assert.equal(scoreData.score, 8, 'Score should be updated to 8');
});

test('setTeamExtraCredit updates team extra credit', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { doc, session } = createV4Session(context, { 
    teams: ['Team A'], 
    questions: [{ score: 10 }]
  });
  
  const teams = context.getOrderedTeams(session);
  const questions = context.getOrderedQuestions(session);
  const teamAId = teams[0].id;
  const questionId = questions[0].id;
  
  // Set Team A's extra credit to 2
  const result = context.setTeamExtraCredit(doc, session, questionId, teamAId, 2);
  assert.equal(result, true, 'Should return true on successful update');
  
  // Verify extra credit was updated
  const scoreData = context.getTeamScore(session, questionId, teamAId);
  assert.equal(scoreData.extraCredit, 2, 'Extra credit should be updated to 2');
});

test('updateTeamName changes team name', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { doc, session } = createV4Session(context, { teams: ['Team A'] });
  
  const teams = context.getOrderedTeams(session);
  const teamId = teams[0].id;
  
  // Update name
  const result = context.updateTeamName(doc, session, teamId, 'New Team Name');
  assert.equal(result, true, 'Should return true on successful update');
  
  // Verify name changed
  const team = context.getTeamById(session, teamId);
  assert.equal(team.get('name'), 'New Team Name');
});

test('updateBlockName changes block name', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { doc, session } = createV4Session(context, { blocks: ['No Block', 'Block 1'] });
  
  const blocks = context.getOrderedBlocks(session);
  const block1Id = blocks[1].id;
  
  // Update name
  const result = context.updateBlockName(doc, session, block1Id, 'Renamed Block');
  assert.equal(result, true, 'Should return true on successful update');
  
  // Verify name changed
  const block = context.getBlockById(session, block1Id);
  assert.equal(block.get('name'), 'Renamed Block');
});

test('updateQuestionScore changes question max points', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { doc, session } = createV4Session(context, { questions: [{ score: 5 }] });
  
  const questions = context.getOrderedQuestions(session);
  const questionId = questions[0].id;
  
  // Update score
  const result = context.updateQuestionScore(doc, session, questionId, 15);
  assert.equal(result, true, 'Should return true on successful update');
  
  // Verify score changed
  const question = context.getQuestionById(session, questionId);
  assert.equal(question.get('score'), 15);
});

test('updateQuestionBlock changes question block assignment', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { doc, session } = createV4Session(context, { 
    blocks: ['No Block', 'Block 1'],
    questions: [{ score: 5 }]
  });
  
  const blocks = context.getOrderedBlocks(session);
  const questions = context.getOrderedQuestions(session);
  const block1Id = blocks[1].id;
  const questionId = questions[0].id;
  
  // Update block assignment
  const result = context.updateQuestionBlock(doc, session, questionId, block1Id);
  assert.equal(result, true, 'Should return true on successful update');
  
  // Verify block changed
  const question = context.getQuestionById(session, questionId);
  assert.equal(question.get('blockId'), block1Id);
});

test('updateQuestionIgnore changes question ignore status', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const { doc, session } = createV4Session(context, { questions: [{ score: 5 }] });
  
  const questions = context.getOrderedQuestions(session);
  const questionId = questions[0].id;
  
  // Question starts not ignored
  assert.equal(context.getQuestionById(session, questionId).get('ignore'), false);
  
  // Set to ignored
  let result = context.updateQuestionIgnore(doc, session, questionId, true);
  assert.equal(result, true);
  assert.equal(context.getQuestionById(session, questionId).get('ignore'), true);
  
  // Set back to not ignored
  result = context.updateQuestionIgnore(doc, session, questionId, false);
  assert.equal(result, true);
  assert.equal(context.getQuestionById(session, questionId).get('ignore'), false);
});

test('write operations succeed for v5 sessions', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Test Session',
      teams: ['Team A', 'Team B'],
      blocks: ['No Block', 'Block 1'],
      questions: [{ score: 5 }]
    }]
  }));
  
  const session = context.get_current_session();
  const doc = context.getActiveSessionDoc();
  
  const teams = context.getOrderedTeams(session);
  const blocks = context.getOrderedBlocks(session);
  const questions = context.getOrderedQuestions(session);
  
  const teamId = teams[0].id;
  const blockId = blocks[1].id;
  const questionId = questions[0].id;
  
  // All operations should return true for v5 session
  assert.equal(context.updateTeamName(doc, session, teamId, 'New Team Name'), true);
  assert.equal(context.updateBlockName(doc, session, blockId, 'New Block Name'), true);
  assert.equal(context.updateQuestionScore(doc, session, questionId, 10), true);
  assert.equal(context.updateQuestionBlock(doc, session, questionId, blockId), true);
  assert.equal(context.updateQuestionIgnore(doc, session, questionId, true), true);
  assert.equal(context.setTeamScore(doc, session, questionId, teamId, 8), true);
  assert.equal(context.setTeamExtraCredit(doc, session, questionId, teamId, 2), true);
  
  // Soft delete operations
  assert.equal(context.softDeleteTeam(doc, session, teams[1].id), true);  // Delete Team B
  assert.equal(context.softDeleteBlock(doc, session, blockId), true);  // Delete Block 1
});

// ============================================================================
// V4 SESSION CREATION TESTS
// ============================================================================

test('createNewSessionV4 creates proper v4 session structure', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const testDoc = new context.Y.Doc();
  const session = context.createNewSessionV4(testDoc, {
    name: 'V4 Test Session',
    maxPointsPerQuestion: 5,
    rounding: true,
    teamNames: ['Alpha', 'Beta', 'Gamma'],
    blockNames: ['No Block', 'Block A', 'Block B']
  });
  
  // Check metadata (now uses v5.0 with deterministic question IDs)
  assert.equal(session.get('name'), 'V4 Test Session');
  assert.equal(session.get('dataVersion'), '5.0');
  assert.ok(session.get('createdAt'), 'Should have createdAt');
  
  // Check question counter for deterministic IDs
  assert.ok(session.get('nextQuestionNumber') >= 1, 'Should have nextQuestionNumber counter');
  
  // Check config
  const config = session.get('config');
  assert.equal(config.get('maxPointsPerQuestion'), 5);
  assert.equal(config.get('rounding'), true);
  
  // Check UUID structures exist
  assert.ok(session.get('teamsById'), 'Should have teamsById');
  assert.ok(session.get('teamOrder'), 'Should have teamOrder');
  assert.ok(session.get('blocksById'), 'Should have blocksById');
  assert.ok(session.get('blockOrder'), 'Should have blockOrder');
  assert.ok(session.get('questionsById'), 'Should have questionsById');
  assert.ok(session.get('questionOrder'), 'Should have questionOrder');
  
  // Check teams were created
  const teams = context.getOrderedTeams(session);
  assert.equal(teams.length, 3);
  assert.equal(teams[0].data.get('name'), 'Alpha');
  assert.equal(teams[1].data.get('name'), 'Beta');
  assert.equal(teams[2].data.get('name'), 'Gamma');
  
  // Check blocks were created with first as default
  const blocks = context.getOrderedBlocks(session);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].data.get('name'), 'No Block');
  assert.equal(blocks[0].data.get('isDefault'), true);
  assert.equal(blocks[1].data.get('name'), 'Block A');
  assert.equal(blocks[1].data.get('isDefault'), false);
  
  // Check initial question was created
  const questions = context.getOrderedQuestions(session);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].data.get('score'), 0);
  
  // Check question has team scores for all teams
  const teamScores = questions[0].data.get('teamScores');
  assert.equal(teamScores.size, 3, 'Question should have scores for all 3 teams');
});

test('USE_UUID_FOR_NEW_SESSIONS flag exists and is enabled', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  assert.equal(typeof context.USE_UUID_FOR_NEW_SESSIONS, 'boolean', 'Flag should be defined');
  assert.equal(context.USE_UUID_FOR_NEW_SESSIONS, true, 'Flag should be true for v4 migration');
});

test('AUTO_MIGRATE_TO_V4 flag exists and is enabled', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  assert.equal(typeof context.AUTO_MIGRATE_TO_V4, 'boolean', 'Flag should be defined');
  assert.equal(context.AUTO_MIGRATE_TO_V4, true, 'Auto-migration should be enabled');
});
// ============================================================================
// V4 EXPORT/IMPORT TESTS
// ============================================================================

test('session_to_json exports v4 session with UUID structures', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Create a v4 session
  const testDoc = new context.Y.Doc();
  const session = context.createNewSessionV4(testDoc, {
    id: 'test-session-uuid',
    name: 'V4 Export Test',
    maxPointsPerQuestion: 4,
    rounding: false,
    teamNames: ['Team Alpha', 'Team Beta'],
    blockNames: ['No Block', 'Block X']
  });
  
  // Store in DocManager
  context.DocManager.sessionDocs.set('test-session-uuid', testDoc);
  
  // Export to JSON
  const exported = context.session_to_json('test-session-uuid');
  
  // Verify structure
  assert.equal(exported.id, 'test-session-uuid');
  assert.equal(exported.name, 'V4 Export Test');
  assert.equal(exported.dataVersion, '4.0');
  assert.equal(exported.config.maxPointsPerQuestion, 4);
  assert.equal(exported.config.rounding, false);
  
  // Check UUID structures
  assert.ok(exported.teamsById, 'Should have teamsById');
  assert.ok(exported.teamOrder, 'Should have teamOrder');
  assert.ok(exported.blocksById, 'Should have blocksById');
  assert.ok(exported.blockOrder, 'Should have blockOrder');
  assert.ok(exported.questionsById, 'Should have questionsById');
  assert.ok(exported.questionOrder, 'Should have questionOrder');
  
  // Check teams
  assert.equal(exported.teamOrder.length, 2);
  const team1Id = exported.teamOrder[0];
  assert.equal(exported.teamsById[team1Id].name, 'Team Alpha');
  
  // Check blocks
  assert.equal(exported.blockOrder.length, 2);
  const block1Id = exported.blockOrder[0];
  assert.equal(exported.blocksById[block1Id].name, 'No Block');
  assert.equal(exported.blocksById[block1Id].isDefault, true);
  
  // Cleanup
  context.DocManager.sessionDocs.delete('test-session-uuid');
});

test('session_to_json exports v5 session with UUID structures via loadApp', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'V5 Export Test',
      teams: ['Team A', 'Team B'],
      blocks: ['No Block'],
      questions: [{ score: 3 }]
    }]
  }));
  
  // Get the session ID
  const meta = context.getGlobalDoc().getMap('meta');
  const sessionOrder = meta.get('sessionOrder') || [];
  const sessionId = sessionOrder[0];
  
  // Export to JSON
  const exported = context.session_to_json(sessionId);
  
  // Verify v5 structure (UUID maps, not index-based arrays)
  assert.equal(exported.name, 'V5 Export Test');
  assert.equal(exported.dataVersion, '4.0');  // Export uses 4.0 format
  
  // Should have UUID structures
  assert.ok(exported.teamsById, 'v5 should have teamsById');
  assert.ok(exported.teamOrder, 'v5 should have teamOrder');
  assert.ok(exported.blocksById, 'v5 should have blocksById');
  assert.ok(exported.blockOrder, 'v5 should have blockOrder');
  assert.ok(exported.questionsById, 'v5 should have questionsById');
  assert.ok(exported.questionOrder, 'v5 should have questionOrder');
  
  // Check team data
  assert.equal(exported.teamOrder.length, 2);
  const team1Id = exported.teamOrder[0];
  assert.equal(exported.teamsById[team1Id].name, 'Team A');
});

test('detectImportFormat identifies v4 JSON format', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // V4 format with dataVersion string
  const v4Data = {
    dataVersion: '4.0',
    sessions: [null, { teamsById: {}, teamOrder: [] }]
  };
  assert.equal(context.detectImportFormat(v4Data), 'json-v4');
  
  // V4 format with teamsById in sessions
  const v4Data2 = {
    sessions: [null, { dataVersion: '4.0', teamsById: {}, teamOrder: [] }]
  };
  assert.equal(context.detectImportFormat(v4Data2), 'json-v4');
  
  // V3 format (should remain v3)
  const v3Data = {
    dataVersion: 3.0,
    sessions: [null, { teams: [], blocks: [], questions: [] }]
  };
  assert.equal(context.detectImportFormat(v3Data), 'json-v3');
});

// ============================================================================
// DETERMINISTIC QUESTION ID TESTS (v5.0)
// ============================================================================

test('generateQuestionId creates deterministic IDs when session is provided', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Create a mock session Y.Map with nextQuestionNumber
  const mockSession = new context.Y.Doc().getMap('session');
  mockSession.set('nextQuestionNumber', 1);
  
  // Generate first question ID
  const q1 = context.generateQuestionId(mockSession);
  assert.equal(q1, 'q-1', 'First question should be q-1');
  assert.equal(mockSession.get('nextQuestionNumber'), 2, 'Counter should increment to 2');
  
  // Generate second question ID
  const q2 = context.generateQuestionId(mockSession);
  assert.equal(q2, 'q-2', 'Second question should be q-2');
  assert.equal(mockSession.get('nextQuestionNumber'), 3, 'Counter should increment to 3');
  
  // Generate third question ID
  const q3 = context.generateQuestionId(mockSession);
  assert.equal(q3, 'q-3', 'Third question should be q-3');
});

test('generateQuestionId falls back to UUID when no session provided', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Call without session (legacy fallback)
  const questionId = context.generateQuestionId();
  assert.ok(questionId.startsWith('q-'), 'Question ID should start with q-');
  assert.ok(questionId.length > 10, 'Fallback should use UUID (long string)');
});

test('createQuestion uses deterministic IDs from session counter', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const testDoc = new context.Y.Doc();
  const session = context.initializeUUIDSession(testDoc, {
    name: 'Test Session',
    maxPointsPerQuestion: 4,
    rounding: false
  });
  
  // Initial question is q-1, counter should be 2
  assert.equal(session.get('nextQuestionNumber'), 2, 'Counter should be 2 after initial question');
  
  // Create another question
  const q2Id = context.createQuestion(testDoc, session, { score: 4 });
  assert.equal(q2Id, 'q-2', 'Second question should be q-2');
  assert.equal(session.get('nextQuestionNumber'), 3, 'Counter should be 3 after second question');
  
  // Create a third question
  const q3Id = context.createQuestion(testDoc, session, { score: 4 });
  assert.equal(q3Id, 'q-3', 'Third question should be q-3');
});

test('isDeterministicSession correctly identifies v5.0 sessions', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // v5.0 session should be deterministic
  const v5Doc = new context.Y.Doc();
  const v5Session = v5Doc.getMap('session');
  v5Session.set('dataVersion', '5.0');
  assert.equal(context.isDeterministicSession(v5Session), true, 'v5.0 should be deterministic');
  
  // v4.0 session should NOT be deterministic
  const v4Doc = new context.Y.Doc();
  const v4Session = v4Doc.getMap('session');
  v4Session.set('dataVersion', '4.0');
  assert.equal(context.isDeterministicSession(v4Session), false, 'v4.0 should not be deterministic');
  
  // v3.0 session should NOT be deterministic
  const v3Doc = new context.Y.Doc();
  const v3Session = v3Doc.getMap('session');
  v3Session.set('dataVersion', 3.0);
  assert.equal(context.isDeterministicSession(v3Session), false, 'v3.0 should not be deterministic');
});

test('validateQuestionCounter repairs out-of-sync counter', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const testDoc = new context.Y.Doc();
  const session = testDoc.getMap('session');
  session.set('dataVersion', '5.0');
  session.set('nextQuestionNumber', 1);  // Set counter too low
  
  // Create questionsById with existing questions
  const questionsById = new context.Y.Map();
  const q5 = new context.Y.Map();
  q5.set('id', 'q-5');
  questionsById.set('q-5', q5);
  
  const q10 = new context.Y.Map();
  q10.set('id', 'q-10');
  questionsById.set('q-10', q10);
  
  session.set('questionsById', questionsById);
  
  // Validate should repair counter to 11 (max existing + 1)
  context.validateQuestionCounter(session);
  assert.equal(session.get('nextQuestionNumber'), 11, 'Counter should be repaired to 11');
});

test('validateQuestionCounter does nothing for valid counter', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const testDoc = new context.Y.Doc();
  const session = testDoc.getMap('session');
  session.set('dataVersion', '5.0');
  session.set('nextQuestionNumber', 15);  // Counter is already higher
  
  // Create questionsById with existing questions
  const questionsById = new context.Y.Map();
  const q5 = new context.Y.Map();
  q5.set('id', 'q-5');
  questionsById.set('q-5', q5);
  session.set('questionsById', questionsById);
  
  // Validate should not change counter since it's already high enough
  context.validateQuestionCounter(session);
  assert.equal(session.get('nextQuestionNumber'), 15, 'Counter should remain 15');
});

test('validateQuestionCounter ignores non-deterministic question IDs', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const testDoc = new context.Y.Doc();
  const session = testDoc.getMap('session');
  session.set('dataVersion', '5.0');
  session.set('nextQuestionNumber', 1);
  
  // Create questionsById with UUID-style question IDs (from v4 migration)
  const questionsById = new context.Y.Map();
  const qUuid = new context.Y.Map();
  qUuid.set('id', 'q-abc123-def456');  // Not a deterministic ID
  questionsById.set('q-abc123-def456', qUuid);
  session.set('questionsById', questionsById);
  
  // Validate should not change counter since no deterministic IDs found
  context.validateQuestionCounter(session);
  assert.equal(session.get('nextQuestionNumber'), 1, 'Counter should remain 1 for non-deterministic IDs');
});

// ============================================================================
// V4 TO V5 MIGRATION TESTS
// ============================================================================

test('migrateV4ToV5 cleans up obsolete fields and sets version', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const testDoc = new context.Y.Doc();
  const session = testDoc.getMap('session');
  session.set('dataVersion', '4.0');  // v4.0 session
  
  // Create v4-style data with random UUID question IDs
  const questionsById = new context.Y.Map();
  const questionOrder = new context.Y.Array();
  
  const q1Id = 'q-abc123-uuid-1';
  const q1 = new context.Y.Map();
  q1.set('id', q1Id);
  q1.set('name', 'Question 1');
  q1.set('score', 10);
  q1.set('sortOrder', 0);
  q1.set('scoreUpdatedAt', Date.now());  // Obsolete field to be removed
  questionsById.set(q1Id, q1);
  questionOrder.push([q1Id]);
  
  const q2Id = 'q-def456-uuid-2';
  const q2 = new context.Y.Map();
  q2.set('id', q2Id);
  q2.set('name', 'Question 2');
  q2.set('score', 20);
  q2.set('sortOrder', 1);
  q2.set('blockUpdatedAt', Date.now());  // Obsolete field to be removed
  questionsById.set(q2Id, q2);
  questionOrder.push([q2Id]);
  
  session.set('questionsById', questionsById);
  session.set('questionOrder', questionOrder);
  session.set('historyLog', new context.Y.Array());
  
  // Run migration
  const result = context.migrateV4ToV5(testDoc, session);
  
  assert.equal(result, true, 'Migration should return true');
  assert.equal(session.get('dataVersion'), '5.0', 'Data version should be 5.0');
  assert.equal(session.get('nextQuestionNumber'), 3, 'Next question number should be 3');
  
  // Check original question keys are preserved (CRDT compatibility)
  const migratedQuestionsById = session.get('questionsById');
  assert.ok(migratedQuestionsById.has(q1Id), 'Original q1 key should still exist');
  assert.ok(migratedQuestionsById.has(q2Id), 'Original q2 key should still exist');
  
  // Check obsolete fields were removed
  const migratedQ1 = migratedQuestionsById.get(q1Id);
  assert.ok(!migratedQ1.has('sortOrder'), 'sortOrder should be removed');
  assert.ok(!migratedQ1.has('scoreUpdatedAt'), 'scoreUpdatedAt should be removed');
  
  const migratedQ2 = migratedQuestionsById.get(q2Id);
  assert.ok(!migratedQ2.has('sortOrder'), 'sortOrder should be removed');
  assert.ok(!migratedQ2.has('blockUpdatedAt'), 'blockUpdatedAt should be removed');
  
  testDoc.destroy();
});

test('migrateV4ToV5 skips non-v4 sessions', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Test v3 session
  const testDocV3 = new context.Y.Doc();
  const sessionV3 = testDocV3.getMap('session');
  sessionV3.set('dataVersion', '3.0');
  assert.equal(context.migrateV4ToV5(testDocV3, sessionV3), false, 'Should skip v3 session');
  testDocV3.destroy();
  
  // Test v5 session  
  const testDocV5 = new context.Y.Doc();
  const sessionV5 = testDocV5.getMap('session');
  sessionV5.set('dataVersion', '5.0');
  assert.equal(context.migrateV4ToV5(testDocV5, sessionV5), false, 'Should skip v5 session');
  testDocV5.destroy();
});

test('migrateV4ToV5 removes team score timestamp fields', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const testDoc = new context.Y.Doc();
  const session = testDoc.getMap('session');
  session.set('dataVersion', '4.0');
  
  // Create question with team scores that have timestamp fields
  const questionsById = new context.Y.Map();
  const questionOrder = new context.Y.Array();
  
  const q1Id = 'q-uuid-1';
  const q1 = new context.Y.Map();
  q1.set('id', q1Id);
  q1.set('name', 'Question 1');
  
  const teamScores = new context.Y.Map();
  const t1Score = new context.Y.Map();
  t1Score.set('score', 5);
  t1Score.set('scoreUpdatedAt', Date.now());
  t1Score.set('extraCredit', 1);
  t1Score.set('extraCreditUpdatedAt', Date.now());
  teamScores.set('t-team1', t1Score);
  q1.set('teamScores', teamScores);
  
  questionsById.set(q1Id, q1);
  questionOrder.push([q1Id]);
  session.set('questionsById', questionsById);
  session.set('questionOrder', questionOrder);
  session.set('historyLog', new context.Y.Array());
  
  // Run migration
  context.migrateV4ToV5(testDoc, session);
  
  // Check team score timestamp fields were removed (original key preserved)
  const migratedQ1 = session.get('questionsById').get(q1Id);
  const migratedTeamScores = migratedQ1.get('teamScores');
  const migratedT1Score = migratedTeamScores.get('t-team1');
  
  assert.ok(!migratedT1Score.has('scoreUpdatedAt'), 'scoreUpdatedAt should be removed from team score');
  assert.ok(!migratedT1Score.has('extraCreditUpdatedAt'), 'extraCreditUpdatedAt should be removed from team score');
  assert.equal(migratedT1Score.get('score'), 5, 'Score value should be preserved');
  assert.equal(migratedT1Score.get('extraCredit'), 1, 'Extra credit value should be preserved');
  
  testDoc.destroy();
});

test('migrateV4ToV5 preserves questionOrder array with original keys', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const testDoc = new context.Y.Doc();
  const session = testDoc.getMap('session');
  session.set('dataVersion', '4.0');
  
  const questionsById = new context.Y.Map();
  const questionOrder = new context.Y.Array();
  
  // Add 3 questions in order with random UUIDs
  const qIds = ['q-uuid-1', 'q-uuid-2', 'q-uuid-3'];
  for (let i = 0; i < 3; i++) {
    const qId = qIds[i];
    const q = new context.Y.Map();
    q.set('id', qId);
    q.set('name', `Question ${i + 1}`);
    questionsById.set(qId, q);
    questionOrder.push([qId]);
  }
  
  session.set('questionsById', questionsById);
  session.set('questionOrder', questionOrder);
  session.set('historyLog', new context.Y.Array());
  
  // Run migration
  context.migrateV4ToV5(testDoc, session);
  
  // Check questionOrder still uses original keys (for CRDT compatibility)
  const migratedOrder = session.get('questionOrder');
  assert.equal(migratedOrder.length, 3, 'Should have 3 entries in order');
  assert.equal(migratedOrder.get(0), 'q-uuid-1', 'First should still be original key');
  assert.equal(migratedOrder.get(1), 'q-uuid-2', 'Second should still be original key');
  assert.equal(migratedOrder.get(2), 'q-uuid-3', 'Third should still be original key');
  
  // Verify data version is 5.0 and counter is set
  assert.equal(session.get('dataVersion'), '5.0', 'Data version should be updated');
  assert.equal(session.get('nextQuestionNumber'), 4, 'Next question number should be 4');
  
  testDoc.destroy();
});