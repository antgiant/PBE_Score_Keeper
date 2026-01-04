const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');

function buildReorderSeed() {
  return {
    data_version: JSON.stringify(1.5),
    session_names: JSON.stringify(['', 'Session 1']),
    current_session: JSON.stringify(1),
    session_1_max_points_per_question: JSON.stringify(10),
    session_1_rounding: JSON.stringify('false'),
    session_1_block_names: JSON.stringify(['No Block/Group', 'Block A', 'Block B']),
    session_1_team_names: JSON.stringify(['', 'Alpha', 'Beta', 'Gamma']),
    session_1_question_names: JSON.stringify(['', 'Q1', 'Q2']),
    session_1_current_question: JSON.stringify(2),
    session_1_question_1_score: JSON.stringify(10),
    session_1_question_1_block: JSON.stringify(1),
    session_1_question_1_ignore: JSON.stringify('false'),
    session_1_question_1_team_1_score: JSON.stringify(8),
    session_1_question_1_team_1_extra_credit: JSON.stringify(0),
    session_1_question_1_team_2_score: JSON.stringify(9),
    session_1_question_1_team_2_extra_credit: JSON.stringify(0),
    session_1_question_1_team_3_score: JSON.stringify(7),
    session_1_question_1_team_3_extra_credit: JSON.stringify(0),
    session_1_question_2_score: JSON.stringify(10),
    session_1_question_2_block: JSON.stringify(2),
    session_1_question_2_ignore: JSON.stringify('false'),
    session_1_question_2_team_1_score: JSON.stringify(6),
    session_1_question_2_team_1_extra_credit: JSON.stringify(0),
    session_1_question_2_team_2_score: JSON.stringify(5),
    session_1_question_2_team_2_extra_credit: JSON.stringify(0),
    session_1_question_2_team_3_score: JSON.stringify(10),
    session_1_question_2_team_3_extra_credit: JSON.stringify(0),
  };
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
  const { context, localStorage } = loadApp(buildReorderSeed());

  context.reorder_teams(['3', '1', '2']);

  const stored = localStorage.dump();
  assert.equal(
    stored.session_1_team_names,
    JSON.stringify(['', 'Gamma', 'Alpha', 'Beta'])
  );
  assert.equal(stored.session_1_question_1_team_1_score, JSON.stringify(7));
  assert.equal(stored.session_1_question_2_team_1_score, JSON.stringify(10));
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
  const { context, localStorage } = loadApp(buildReorderSeed());

  context.reorder_blocks(['2', '1']);

  const stored = localStorage.dump();
  assert.equal(
    stored.session_1_block_names,
    JSON.stringify(['No Block/Group', 'Block B', 'Block A'])
  );
  assert.equal(stored.session_1_question_1_block, '2');
  assert.equal(stored.session_1_question_2_block, '1');
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
