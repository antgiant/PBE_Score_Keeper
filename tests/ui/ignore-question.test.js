const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');

function buildIgnoreSeed() {
  return {
    data_version: JSON.stringify(1.5),
    session_names: JSON.stringify(['', 'Session 1']),
    current_session: JSON.stringify(1),
    session_1_max_points_per_question: JSON.stringify(5),
    session_1_rounding: JSON.stringify('false'),
    session_1_block_names: JSON.stringify(['No Block/Group']),
    session_1_team_names: JSON.stringify(['', 'Alpha', 'Beta']),
    session_1_question_names: JSON.stringify(['', 'Q1', 'Q2']),
    session_1_current_question: JSON.stringify(2),
    session_1_question_1_score: JSON.stringify(5),
    session_1_question_1_block: JSON.stringify(0),
    session_1_question_1_ignore: JSON.stringify('false'),
    session_1_question_1_team_1_score: JSON.stringify(5),
    session_1_question_1_team_1_extra_credit: JSON.stringify(0),
    session_1_question_1_team_2_score: JSON.stringify(3),
    session_1_question_1_team_2_extra_credit: JSON.stringify(0),
    session_1_question_2_score: JSON.stringify(5),
    session_1_question_2_block: JSON.stringify(0),
    session_1_question_2_ignore: JSON.stringify('true'),
    session_1_question_2_team_1_score: JSON.stringify(2),
    session_1_question_2_team_1_extra_credit: JSON.stringify(0),
    session_1_question_2_team_2_score: JSON.stringify(5),
    session_1_question_2_team_2_extra_credit: JSON.stringify(0),
  };
}

test('ignoring a question disables score entry and removes it from totals', () => {
  const { context } = loadApp(buildIgnoreSeed());

  context.sync_data_to_display();

  const ignoredContainer = context.$('#ignored_question');
  assert.equal(ignoredContainer.css('opacity'), 0.25);
  assert.equal(ignoredContainer.css('pointer-events'), 'none');
  assert.notEqual(context.$('#ignore_question').prop('disabled'), true);
  assert.notEqual(context.$('#previous_question').prop('disabled'), true);
  assert.notEqual(context.$('#next_question').prop('disabled'), true);
  assert.notEqual(context.$('#previous_question_2').prop('disabled'), true);
  assert.notEqual(context.$('#next_question_2').prop('disabled'), true);

  const teamScores = context.$('#team_scores').html();
  assert.ok(teamScores.includes('100.00%'));
  assert.ok(teamScores.includes('5/5'));
  assert.ok(teamScores.includes('60.00%'));
  assert.ok(teamScores.includes('3/5'));
  assert.ok(!teamScores.includes('7/10'));

  const roundedScores = context.$('#rounded_team_scores').html();
  assert.ok(roundedScores.includes('100.00%'));
  assert.ok(roundedScores.includes('5/5'));
  assert.ok(roundedScores.includes('60.00%'));
  assert.ok(roundedScores.includes('3/5'));

  const questionSelector = context.$('#current_question_title_count').html();
  assert.ok(questionSelector.includes('🚫2 of 2'));
});
