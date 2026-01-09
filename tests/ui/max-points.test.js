const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

function buildMaxPointsSeed(maxPoints, questionScore) {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: maxPoints,
      rounding: false,
      teams: ['Team 1'],
      blocks: ['No Block/Group'],
      questions: [{
        name: 'Q1',
        score: questionScore,
        block: 0,
        ignore: false,
        teamScores: [{ score: 0, extraCredit: 0 }]
      }],
      currentQuestion: 1
    }]
  });
}

function buildQuestionPointsSeed(questionScore) {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 6,
      rounding: false,
      teams: ['Alpha', 'Beta'],
      blocks: ['No Block/Group'],
      questions: [{
        name: 'Q1',
        score: questionScore,
        block: 0,
        ignore: false,
        teamScores: [
          { score: 0, extraCredit: 0 },
          { score: 0, extraCredit: 0 }
        ]
      }],
      currentQuestion: 1
    }]
  });
}

test('max points increase updates totals and possible point options', () => {
  const { context, ydoc } = loadApp(buildMaxPointsSeed(4, 2));

  context.sync_data_to_display();

  assert.equal(Number(context.$('#max_points').text()), 4);
  assert.equal(context.$('#question_score').children().length, 4);

  context.update_data_element('max_points_increase');
  context.sync_data_to_display();

  // Check Yjs instead of localStorage
  const session = ydoc.getArray('sessions').get(1);
  const config = session.get('config');
  assert.equal(config.get('maxPointsPerQuestion'), 5);
  assert.equal(Number(context.$('#max_points').text()), 5);
  assert.equal(context.$('#question_score').children().length, 5);
});

test('max points decrease updates totals and possible point options', () => {
  const { context, ydoc } = loadApp(buildMaxPointsSeed(6, 4));

  context.sync_data_to_display();

  assert.equal(Number(context.$('#max_points').text()), 6);
  assert.equal(context.$('#question_score').children().length, 6);

  context.update_data_element('max_points_decrease');
  context.sync_data_to_display();

  // Check Yjs instead of localStorage
  const session = ydoc.getArray('sessions').get(1);
  const config = session.get('config');
  assert.equal(config.get('maxPointsPerQuestion'), 5);
  assert.equal(Number(context.$('#max_points').text()), 5);
  assert.equal(context.$('#question_score').children().length, 5);
});

test('changing question possible points updates team score options', () => {
  const { context } = loadApp(buildQuestionPointsSeed(2));

  context.sync_data_to_display();

  assert.equal(context.$('#team_1_score').children().length, 3);
  assert.equal(context.$('#team_2_score').children().length, 3);

  context.update_data_element('question_score_4', '4');
  context.sync_data_to_display();

  assert.equal(context.$('#team_1_score').children().length, 5);
  assert.equal(context.$('#team_2_score').children().length, 5);
});
