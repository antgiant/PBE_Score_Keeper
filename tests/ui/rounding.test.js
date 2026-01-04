const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');

function buildRoundingSeed() {
  const questionScores = [5, 5, 5];
  const teamScores = [
    [4, 4, 5],
    [4, 4, 4],
  ];
  const seed = {
    data_version: JSON.stringify(1.5),
    session_names: JSON.stringify(['', 'Session 1']),
    current_session: JSON.stringify(1),
    session_1_max_points_per_question: JSON.stringify(5),
    session_1_rounding: JSON.stringify('false'),
    session_1_block_names: JSON.stringify(['No Block/Group']),
    session_1_team_names: JSON.stringify(['', 'Alpha', 'Beta']),
    session_1_question_names: JSON.stringify(['', 'Q1', 'Q2', 'Q3']),
    session_1_current_question: JSON.stringify(3),
  };

  questionScores.forEach((score, index) => {
    const questionNumber = index + 1;
    seed[`session_1_question_${questionNumber}_score`] = JSON.stringify(score);
    seed[`session_1_question_${questionNumber}_block`] = JSON.stringify(0);
    seed[`session_1_question_${questionNumber}_ignore`] = JSON.stringify('false');
    teamScores.forEach((scores, teamIndex) => {
      const teamNumber = teamIndex + 1;
      seed[`session_1_question_${questionNumber}_team_${teamNumber}_score`] =
        JSON.stringify(scores[index]);
      seed[`session_1_question_${questionNumber}_team_${teamNumber}_extra_credit`] =
        JSON.stringify(0);
    });
  });

  return seed;
}

test('rounding uses the top team total for live scores and totals', () => {
  const { context } = loadApp(buildRoundingSeed());

  context.sync_data_to_display();

  const teamScores = context.$('#team_scores').html();
  assert.ok(teamScores.includes('86.67%'));
  assert.ok(teamScores.includes('13/15'));
  assert.ok(teamScores.includes('80.00%'));
  assert.ok(teamScores.includes('12/15'));
  assert.ok(teamScores.includes('Second Place'));
  assert.ok(context.$('#team_1_points_label').text().includes('86.67%'));
  assert.ok(context.$('#team_2_points_label').text().includes('80.00%'));

  const roundedScores = context.$('#rounded_team_scores').html();
  assert.ok(roundedScores.includes('100.00%'));
  assert.ok(roundedScores.includes('13/13'));
  assert.ok(roundedScores.includes('92.31%'));
  assert.ok(roundedScores.includes('12/13'));
  assert.ok(roundedScores.includes('First Place'));

  context.update_data_element('rounding_yes');
  context.sync_data_to_display();

  assert.ok(context.$('#team_1_points_label').text().includes('100.00%'));
  assert.ok(context.$('#team_2_points_label').text().includes('92.31%'));
});
