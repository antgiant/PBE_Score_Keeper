const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');

function buildExtraCreditSeed() {
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
    session_1_question_1_team_1_score: JSON.stringify(4),
    session_1_question_1_team_1_extra_credit: JSON.stringify(1),
    session_1_question_1_team_2_score: JSON.stringify(5),
    session_1_question_1_team_2_extra_credit: JSON.stringify(2),
    session_1_question_2_score: JSON.stringify(5),
    session_1_question_2_block: JSON.stringify(0),
    session_1_question_2_ignore: JSON.stringify('false'),
    session_1_question_2_team_1_score: JSON.stringify(4),
    session_1_question_2_team_1_extra_credit: JSON.stringify(0),
    session_1_question_2_team_2_score: JSON.stringify(5),
    session_1_question_2_team_2_extra_credit: JSON.stringify(0),
  };
}

function buildExtraCreditUiSeed() {
  return {
    data_version: JSON.stringify(1.5),
    session_names: JSON.stringify(['', 'Session 1']),
    current_session: JSON.stringify(1),
    session_1_max_points_per_question: JSON.stringify(5),
    session_1_rounding: JSON.stringify('false'),
    session_1_block_names: JSON.stringify(['No Block/Group']),
    session_1_team_names: JSON.stringify(['', 'Alpha', 'Beta']),
    session_1_question_names: JSON.stringify(['', 'Q1']),
    session_1_current_question: JSON.stringify(1),
    session_1_question_1_score: JSON.stringify(5),
    session_1_question_1_block: JSON.stringify(0),
    session_1_question_1_ignore: JSON.stringify('false'),
    session_1_question_1_team_1_score: JSON.stringify(0),
    session_1_question_1_team_1_extra_credit: JSON.stringify(0),
    session_1_question_1_team_2_score: JSON.stringify(0),
    session_1_question_1_team_2_extra_credit: JSON.stringify(0),
  };
}

function buildExtraCreditRoundingSeed() {
  return {
    data_version: JSON.stringify(1.5),
    session_names: JSON.stringify(['', 'Session 1']),
    current_session: JSON.stringify(1),
    session_1_max_points_per_question: JSON.stringify(5),
    session_1_rounding: JSON.stringify('true'),
    session_1_block_names: JSON.stringify(['No Block/Group']),
    session_1_team_names: JSON.stringify(['', 'Alpha', 'Beta']),
    session_1_question_names: JSON.stringify(['', 'Q1', 'Q2']),
    session_1_current_question: JSON.stringify(2),
    session_1_question_1_score: JSON.stringify(5),
    session_1_question_1_block: JSON.stringify(0),
    session_1_question_1_ignore: JSON.stringify('false'),
    session_1_question_1_team_1_score: JSON.stringify(5),
    session_1_question_1_team_1_extra_credit: JSON.stringify(0),
    session_1_question_1_team_2_score: JSON.stringify(4),
    session_1_question_1_team_2_extra_credit: JSON.stringify(2),
    session_1_question_2_score: JSON.stringify(5),
    session_1_question_2_block: JSON.stringify(0),
    session_1_question_2_ignore: JSON.stringify('false'),
    session_1_question_2_team_1_score: JSON.stringify(4),
    session_1_question_2_team_1_extra_credit: JSON.stringify(0),
    session_1_question_2_team_2_score: JSON.stringify(4),
    session_1_question_2_team_2_extra_credit: JSON.stringify(3),
  };
}

test('allowing extra credit shows extra credit controls for each team', () => {
  const { context } = loadApp(buildExtraCreditUiSeed());

  context.$('#extra_credit').prop('checked', true);
  context.sync_data_to_display();

  assert.equal(context.$('#extra_credit').prop('checked'), true);
  assert.equal(context.$('#team_1_extra_credit_label').css('display'), 'block');
  assert.equal(context.$('#team_2_extra_credit_label').css('display'), 'block');
});

test('extra credit buttons update the stored value and display', () => {
  const { context, localStorage } = loadApp(buildExtraCreditUiSeed());

  context.$('#extra_credit').prop('checked', true);
  context.sync_data_to_display();

  context.update_data_element('team_1_extra_credit_increase');
  context.update_data_element('team_1_extra_credit_increase');
  context.update_data_element('team_1_extra_credit_decrease');
  context.sync_data_to_display();

  assert.equal(context.$('#team_1_extra_credit').text(), '1');
  assert.equal(localStorage.getItem('session_1_question_1_team_1_extra_credit'), '1');
});

test('extra credit points are included in team score totals', () => {
  const { context } = loadApp(buildExtraCreditSeed());

  context.sync_data_to_display();

  const teamScores = context.$('#team_scores').html();
  assert.ok(teamScores.includes('90.00%'));
  assert.ok(teamScores.includes('9/10'));
  assert.ok(teamScores.includes('120.00%'));
  assert.ok(teamScores.includes('12/10'));
});

test('rounded team scores use the top non-extra-credit total', () => {
  const { context } = loadApp(buildExtraCreditRoundingSeed());

  context.sync_data_to_display();

  const roundedScores = context.$('#rounded_team_scores').html();
  assert.ok(roundedScores.includes('144.44%'));
  assert.ok(roundedScores.includes('13/9'));
});
