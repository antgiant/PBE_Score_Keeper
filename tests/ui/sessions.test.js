const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');

function buildSessionSeed(questionScores) {
  const questionNames = [''];
  const seed = {
    data_version: JSON.stringify(1.5),
    session_names: JSON.stringify(['', 'Session 1']),
    current_session: JSON.stringify(1),
    session_1_max_points_per_question: JSON.stringify(6),
    session_1_rounding: JSON.stringify('false'),
    session_1_block_names: JSON.stringify(['No Block/Group', 'Block A']),
    session_1_team_names: JSON.stringify(['', 'Team 1']),
    session_1_current_question: JSON.stringify(questionScores.length),
  };

  questionScores.forEach((score, index) => {
    const questionNumber = index + 1;
    questionNames.push(`Q${questionNumber}`);
    seed[`session_1_question_${questionNumber}_score`] = JSON.stringify(score);
    seed[`session_1_question_${questionNumber}_block`] = JSON.stringify(1);
    seed[`session_1_question_${questionNumber}_ignore`] = JSON.stringify('false');
    seed[`session_1_question_${questionNumber}_team_1_score`] = JSON.stringify(Math.max(0, score - 1));
    seed[`session_1_question_${questionNumber}_team_1_extra_credit`] = JSON.stringify(0);
  });

  seed.session_1_question_names = JSON.stringify(questionNames);

  return seed;
}

test('renaming a session updates session_names storage', () => {
  const seed = {
    data_version: JSON.stringify(1.5),
    session_names: JSON.stringify(['', 'Session 1']),
    current_session: JSON.stringify(1),
    session_1_max_points_per_question: JSON.stringify(6),
    session_1_rounding: JSON.stringify('false'),
    session_1_block_names: JSON.stringify(['No Block/Group', 'Block A']),
    session_1_team_names: JSON.stringify(['', 'Team 1']),
    session_1_question_names: JSON.stringify(['', 'Q1']),
    session_1_current_question: JSON.stringify(1),
    session_1_question_1_score: JSON.stringify(4),
    session_1_question_1_block: JSON.stringify(1),
    session_1_question_1_ignore: JSON.stringify('false'),
    session_1_question_1_team_1_score: JSON.stringify(3),
    session_1_question_1_team_1_extra_credit: JSON.stringify(0),
  };

  const { context, localStorage } = loadApp(seed);

  context.$('#session_name').text('Finals Round');
  context.update_data_element('session_name');

  const names = JSON.parse(localStorage.getItem('session_names'));
  assert.equal(names[1], 'Finals Round');
});

test('new session stays disabled until the first question has a score', () => {
  const { context } = loadApp(buildSessionSeed([0]));

  context.sync_data_to_display();

  assert.equal(context.$('#new_session').prop('disabled'), true);
});

test('creating a new session works after scoring and writes to storage', () => {
  const { context, localStorage } = loadApp(buildSessionSeed([5, 3]));

  context.sync_data_to_display();

  assert.equal(context.$('#new_session').prop('disabled'), false);

  context.update_data_element('new_session');

  const sessionNames = JSON.parse(localStorage.getItem('session_names'));
  assert.equal(sessionNames.length, 3);
  assert.equal(JSON.parse(localStorage.getItem('current_session')), 2);
  assert.deepEqual(
    JSON.parse(localStorage.getItem('session_2_question_names')),
    ['', 'Question 1']
  );
  assert.equal(JSON.parse(localStorage.getItem('session_2_question_1_score')), 0);
});
