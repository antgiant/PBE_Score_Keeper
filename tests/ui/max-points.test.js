const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');

function buildMaxPointsSeed(maxPoints, questionScore) {
  return {
    data_version: JSON.stringify(1.5),
    session_names: JSON.stringify(['', 'Session 1']),
    current_session: JSON.stringify(1),
    session_1_max_points_per_question: JSON.stringify(maxPoints),
    session_1_rounding: JSON.stringify('false'),
    session_1_block_names: JSON.stringify(['No Block/Group']),
    session_1_team_names: JSON.stringify(['', 'Team 1']),
    session_1_question_names: JSON.stringify(['', 'Q1']),
    session_1_current_question: JSON.stringify(1),
    session_1_question_1_score: JSON.stringify(questionScore),
    session_1_question_1_block: JSON.stringify(0),
    session_1_question_1_ignore: JSON.stringify('false'),
    session_1_question_1_team_1_score: JSON.stringify(0),
    session_1_question_1_team_1_extra_credit: JSON.stringify(0),
  };
}

test('max points increase updates totals and possible point options', () => {
  const { context, localStorage } = loadApp(buildMaxPointsSeed(4, 2));

  context.sync_data_to_display();

  assert.equal(Number(context.$('#max_points').text()), 4);
  assert.equal(context.$('#question_score').children().length, 4);

  context.update_data_element('max_points_increase');
  context.sync_data_to_display();

  assert.equal(Number(localStorage.getItem('session_1_max_points_per_question')), 5);
  assert.equal(Number(context.$('#max_points').text()), 5);
  assert.equal(context.$('#question_score').children().length, 5);
});

test('max points decrease updates totals and possible point options', () => {
  const { context, localStorage } = loadApp(buildMaxPointsSeed(6, 4));

  context.sync_data_to_display();

  assert.equal(Number(context.$('#max_points').text()), 6);
  assert.equal(context.$('#question_score').children().length, 6);

  context.update_data_element('max_points_decrease');
  context.sync_data_to_display();

  assert.equal(Number(localStorage.getItem('session_1_max_points_per_question')), 5);
  assert.equal(Number(context.$('#max_points').text()), 5);
  assert.equal(context.$('#question_score').children().length, 5);
});
