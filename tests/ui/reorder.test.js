const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

function buildReorderSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 10,
      rounding: false,
      teams: ['Alpha', 'Beta', 'Gamma'],
      blocks: ['No Block/Group', 'Block A', 'Block B'],
      questions: [
        {
          name: 'Q1',
          score: 10,
          block: 1,
          ignore: false,
          teamScores: [
            { score: 8, extraCredit: 0 },
            { score: 9, extraCredit: 0 },
            { score: 7, extraCredit: 0 }
          ]
        },
        {
          name: 'Q2',
          score: 10,
          block: 2,
          ignore: false,
          teamScores: [
            { score: 6, extraCredit: 0 },
            { score: 5, extraCredit: 0 },
            { score: 10, extraCredit: 0 }
          ]
        }
      ],
      currentQuestion: 2
    }]
  });
}

function indexOrder(html, labels) {
  return labels.map((label) => html.indexOf(label));
}

function summaryToMap(summary, valueIndex) {
  const map = {};
  for (let i = 1; i < summary.length; i++) {
    map[summary[i][0]] = summary[i][valueIndex];
  }
  return map;
}

test('reordering teams updates display order', () => {
  const { context } = loadApp(buildReorderSeed());

  context.sync_data_to_display();
  context.reorder_teams(['3', '1', '2']);
  context.sync_data_to_display();

  const teamScores = context.$('#team_scores').html();
  const [gammaIndex, alphaIndex, betaIndex] = indexOrder(teamScores, [
    'Gamma',
    'Alpha',
    'Beta',
  ]);
  assert.ok(gammaIndex > -1);
  assert.ok(alphaIndex > -1);
  assert.ok(betaIndex > -1);
  assert.ok(gammaIndex < alphaIndex);
  assert.ok(alphaIndex < betaIndex);
});

test('reordering teams saves to the data store', () => {
  const { context } = loadApp(buildReorderSeed());

  context.reorder_teams(['3', '1', '2']);

  // Check Yjs session doc using v5 UUID structures
  const session = context.get_current_session();
  const teams = context.getOrderedTeams(session);
  const teamNames = teams.map(t => '' + t.data.get('name'));
  // Use JSON comparison to avoid Node v25 deepStrictEqual issues with Yjs strings
  assert.equal(JSON.stringify(teamNames), JSON.stringify(['Gamma', 'Alpha', 'Beta']));
  
  // Check that team scores are accessible (team order changed, but IDs are stable)
  const questions = context.getOrderedQuestions(session);
  const gammaTeamId = teams[0].id;
  
  const scoreData1 = context.getTeamScore(session, questions[0].id, gammaTeamId);
  assert.equal(scoreData1.score, 7);  // Gamma's score on Q1
  
  const scoreData2 = context.getTeamScore(session, questions[1].id, gammaTeamId);
  assert.equal(scoreData2.score, 10);  // Gamma's score on Q2
});

test('reordering blocks updates display order', () => {
  const { context } = loadApp(buildReorderSeed());

  context.sync_data_to_display();
  context.reorder_blocks(['2', '1']);
  context.sync_data_to_display();

  const blockScores = context.$('#block_scores').html();
  const [blockBIndex, blockAIndex] = indexOrder(blockScores, [
    'Block B',
    'Block A',
  ]);
  assert.ok(blockBIndex > -1);
  assert.ok(blockAIndex > -1);
  assert.ok(blockBIndex < blockAIndex);
});

test('reordering blocks saves to the data store', () => {
  const { context } = loadApp(buildReorderSeed());

  context.reorder_blocks(['2', '1']);

  // Check Yjs session doc using v5 UUID structures
  const session = context.get_current_session();
  const blocks = context.getOrderedBlocks(session);
  const blockNames = blocks.map(b => '' + b.data.get('name'));
  // Use JSON comparison to avoid Node v25 deepStrictEqual issues with Yjs strings
  assert.equal(JSON.stringify(blockNames), JSON.stringify(['No Block/Group', 'Block B', 'Block A']));
  
  // Check that questions have correct blockId references
  const questions = context.getOrderedQuestions(session);
  const blockAId = blocks.find(b => ('' + b.data.get('name')) === 'Block A').id;
  const blockBId = blocks.find(b => ('' + b.data.get('name')) === 'Block B').id;
  
  // Q1 was in Block A (now position 2), Q2 was in Block B (now position 1)
  assert.equal(questions[0].data.get('blockId'), blockAId);
  assert.equal(questions[1].data.get('blockId'), blockBId);
});

test('reordering keeps score summaries intact', () => {
  const { context } = loadApp(buildReorderSeed());

  const initialTeamSummary = summaryToMap(context.get_team_score_summary(), 2);
  const initialBlockSummary = summaryToMap(context.get_block_score_summary(), 2);

  context.reorder_teams(['3', '1', '2']);
  context.reorder_blocks(['2', '1']);

  const updatedTeamSummary = summaryToMap(context.get_team_score_summary(), 2);
  const updatedBlockSummary = summaryToMap(context.get_block_score_summary(), 2);

  assert.deepEqual(updatedTeamSummary, initialTeamSummary);
  assert.deepEqual(updatedBlockSummary, initialBlockSummary);
});

test('score entry field order can be saved and retrieved', () => {
  const { context } = loadApp(buildReorderSeed());
  
  // Initially no order is set
  const initialOrder = context.get_score_entry_field_order();
  assert.equal(initialOrder, null);
  
  // Set a custom order
  const newOrder = ['block', 'points'];
  const success = context.set_score_entry_field_order(newOrder);
  assert.equal(success, true);
  
  // Verify order is saved
  const savedOrder = context.get_score_entry_field_order();
  assert.deepEqual(savedOrder, newOrder);
});

test('score entry field order is stored in global doc', () => {
  const { context } = loadApp(buildReorderSeed());
  
  // Set order
  context.set_score_entry_field_order(['block', 'points']);
  
  // Verify it's in the global doc (stored as JSON string)
  const globalDoc = context.getGlobalDoc();
  const meta = globalDoc.getMap('meta');
  const orderStr = meta.get('scoreEntryFieldOrder');
  assert.equal(orderStr, JSON.stringify(['block', 'points']));
});

test('apply_score_entry_field_order function exists', () => {
  const { context } = loadApp(buildReorderSeed());
  
  // Verify the functions exist
  assert.equal(typeof context.apply_score_entry_field_order, 'function');
  assert.equal(typeof context.initialize_score_entry_field_reorder, 'function');
  assert.equal(typeof context.save_score_entry_field_order, 'function');
  
  // DOM manipulation is tested in browser; here we verify the logic functions work
  context.set_score_entry_field_order(['block', 'points']);
  const order = context.get_score_entry_field_order();
  assert.deepEqual(order, ['block', 'points']);
});
