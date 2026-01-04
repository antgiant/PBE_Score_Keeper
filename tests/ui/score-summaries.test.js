const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');

function buildScoreSummarySeed() {
  return {
    data_version: JSON.stringify(1.5),
    session_names: JSON.stringify(['', 'Session 1']),
    current_session: JSON.stringify(1),
    session_1_max_points_per_question: JSON.stringify(10),
    session_1_rounding: JSON.stringify('false'),
    session_1_block_names: JSON.stringify(['No Block/Group', 'Block A']),
    session_1_team_names: JSON.stringify(['', 'Alpha', 'Beta', 'Gamma']),
    session_1_question_names: JSON.stringify(['', 'Q1', 'Q2']),
    session_1_current_question: JSON.stringify(2),
    session_1_question_1_score: JSON.stringify(10),
    session_1_question_1_block: JSON.stringify(0),
    session_1_question_1_ignore: JSON.stringify('false'),
    session_1_question_1_team_1_score: JSON.stringify(9),
    session_1_question_1_team_1_extra_credit: JSON.stringify(1),
    session_1_question_1_team_2_score: JSON.stringify(10),
    session_1_question_1_team_2_extra_credit: JSON.stringify(0),
    session_1_question_1_team_3_score: JSON.stringify(7),
    session_1_question_1_team_3_extra_credit: JSON.stringify(0),
    session_1_question_2_score: JSON.stringify(10),
    session_1_question_2_block: JSON.stringify(1),
    session_1_question_2_ignore: JSON.stringify('false'),
    session_1_question_2_team_1_score: JSON.stringify(6),
    session_1_question_2_team_1_extra_credit: JSON.stringify(0),
    session_1_question_2_team_2_score: JSON.stringify(8),
    session_1_question_2_team_2_extra_credit: JSON.stringify(2),
    session_1_question_2_team_3_score: JSON.stringify(5),
    session_1_question_2_team_3_extra_credit: JSON.stringify(0),
  };
}

test('score summaries show team totals, rounded totals, block totals, and team-by-block totals', () => {
  const { context } = loadApp(buildScoreSummarySeed());

  context.sync_data_to_display();

  const teamScores = context.$('#team_scores').html();
  assert.ok(teamScores.includes('Alpha'));
  assert.ok(teamScores.includes('Beta'));
  assert.ok(teamScores.includes('Gamma'));
  assert.ok(teamScores.includes('80.00%'));
  assert.ok(teamScores.includes('100.00%'));
  assert.ok(teamScores.includes('60.00%'));
  assert.ok(teamScores.includes('16/20'));
  assert.ok(teamScores.includes('20/20'));
  assert.ok(teamScores.includes('12/20'));
  assert.ok(teamScores.includes('First Place'));
  assert.ok(teamScores.includes('Second Place'));
  assert.ok(teamScores.includes('Third Place'));

  const roundedScores = context.$('#rounded_team_scores').html();
  assert.ok(roundedScores.includes('Alpha'));
  assert.ok(roundedScores.includes('Beta'));
  assert.ok(roundedScores.includes('Gamma'));
  assert.ok(roundedScores.includes('88.89%'));
  assert.ok(roundedScores.includes('111.11%'));
  assert.ok(roundedScores.includes('66.67%'));
  assert.ok(roundedScores.includes('16/18'));
  assert.ok(roundedScores.includes('20/18'));
  assert.ok(roundedScores.includes('12/18'));
  assert.ok(roundedScores.includes('First Place'));
  assert.ok(roundedScores.includes('Second Place'));
  assert.ok(roundedScores.includes('Third Place'));

  const blockScores = context.$('#block_scores').html();
  assert.ok(blockScores.includes('No Block/Group'));
  assert.ok(blockScores.includes('Block A'));
  assert.ok(blockScores.includes('90.00%'));
  assert.ok(blockScores.includes('70.00%'));
  assert.ok(blockScores.includes('27/30'));
  assert.ok(blockScores.includes('21/30'));

  const teamAndBlockScores = context.$('#team_and_block_scores').html();
  assert.ok(teamAndBlockScores.includes('Alpha'));
  assert.ok(teamAndBlockScores.includes('Beta'));
  assert.ok(teamAndBlockScores.includes('Gamma'));
  assert.ok(teamAndBlockScores.includes('No Block/Group'));
  assert.ok(teamAndBlockScores.includes('Block A'));
  assert.ok(teamAndBlockScores.includes('100.00%'));
  assert.ok(teamAndBlockScores.includes('70.00%'));
  assert.ok(teamAndBlockScores.includes('60.00%'));
  assert.ok(teamAndBlockScores.includes('50.00%'));
  assert.ok(teamAndBlockScores.includes('10/10'));
  assert.ok(teamAndBlockScores.includes('7/10'));
  assert.ok(teamAndBlockScores.includes('6/10'));
  assert.ok(teamAndBlockScores.includes('5/10'));
});

test('question log shows questions, blocks, possible points, and team scores', () => {
  const { context } = loadApp(buildScoreSummarySeed());

  context.sync_data_to_display();

  const questionLog = context.$('#scores').html();
  assert.ok(questionLog.includes('<th>Question</th>'));
  assert.ok(questionLog.includes('<th>Block/Group</th>'));
  assert.ok(questionLog.includes('<th>Possible Points</th>'));
  assert.ok(questionLog.includes('<th>Alpha Score</th>'));
  assert.ok(questionLog.includes('<th>Beta Score</th>'));
  assert.ok(questionLog.includes('<th>Gamma Score</th>'));
  assert.ok(
    questionLog.includes(
      '<td>Q1</td><td>No Block/Group</td><td>10</td><td>9 + 1</td><td>10</td><td>7</td>'
    )
  );
  assert.ok(
    questionLog.includes(
      '<td>Q2</td><td>Block A</td><td>10</td><td>6</td><td>8 + 2</td><td>5</td>'
    )
  );
});
