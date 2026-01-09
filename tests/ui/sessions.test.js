const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

function buildSessionSeed(questionScores) {
  const questions = [];
  questionScores.forEach((score, index) => {
    const questionNumber = index + 1;
    questions.push({
      name: `Q${questionNumber}`,
      score: score,
      block: 1,
      ignore: false,
      teamScores: [{ score: Math.max(0, score - 1), extraCredit: 0 }]
    });
  });

  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 6,
      rounding: false,
      teams: ['Team 1'],
      blocks: ['No Block/Group', 'Block A'],
      questions: questions,
      currentQuestion: questionScores.length
    }]
  });
}

function buildBasicSessionSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 6,
      rounding: false,
      teams: ['Team 1'],
      blocks: ['No Block/Group', 'Block A'],
      questions: [{
        name: 'Q1',
        score: 4,
        block: 1,
        ignore: false,
        teamScores: [{ score: 3, extraCredit: 0 }]
      }],
      currentQuestion: 1
    }]
  });
}

test('renaming a session updates session_names storage', () => {
  const { context, ydoc } = loadApp(buildBasicSessionSeed());

  context.$('#session_name').text('Finals Round');
  context.update_data_element('session_name');

  // Check Yjs instead of localStorage
  const session = ydoc.getArray('sessions').get(1);
  assert.equal(session.get('name'), 'Finals Round');
});

test('new session stays disabled until the first question has a score', () => {
  const { context } = loadApp(buildSessionSeed([0]));

  context.sync_data_to_display();

  assert.equal(context.$('#new_session').prop('disabled'), true);
});

test('creating a new session works after scoring and writes to storage', () => {
  const { context, ydoc } = loadApp(buildSessionSeed([5, 3]));

  context.sync_data_to_display();

  assert.equal(context.$('#new_session').prop('disabled'), false);

  context.update_data_element('new_session');

  // Check Yjs instead of localStorage
  const sessions = ydoc.getArray('sessions');
  assert.equal(sessions.length, 3);
  const meta = ydoc.getMap('meta');
  assert.equal(meta.get('currentSession'), 2);
  const newSession = sessions.get(2);
  assert.equal(newSession.get('questions').length, 2);
});