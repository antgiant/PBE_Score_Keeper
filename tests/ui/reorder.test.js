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

  // Check Yjs session doc
  const session = context.get_current_session();
  const teams = session.get('teams');
  const teamNames = [];
  for (let t = 1; t < teams.length; t++) {
    teamNames.push(teams.get(t).get('name'));
  }
  assert.deepEqual(teamNames, ['Gamma', 'Alpha', 'Beta']);
  
  // Check that team scores were reordered correctly
  const question1 = session.get('questions').get(1);
  const q1_team1 = question1.get('teams').get(1);
  assert.equal(q1_team1.get('score'), 7);  // Was team 3
  
  const question2 = session.get('questions').get(2);
  const q2_team1 = question2.get('teams').get(1);
  assert.equal(q2_team1.get('score'), 10);  // Was team 3

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

  // Check Yjs session doc
  const session = context.get_current_session();
  const blocks = session.get('blocks');
  const blockNames = [];
  for (let b = 0; b < blocks.length; b++) {
    blockNames.push(blocks.get(b).get('name'));
  }
  assert.deepEqual(blockNames, ['No Block/Group', 'Block B', 'Block A']);
  
  // Check that question blocks were updated
  const question1 = session.get('questions').get(1);
  assert.equal(question1.get('block'), 2);
  const question2 = session.get('questions').get(2);
  assert.equal(question2.get('block'), 1);
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
