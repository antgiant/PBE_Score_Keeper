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
      blocks: ['No Block', 'Block A'],
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
      blocks: ['No Block', 'Block A'],
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

  // Check session doc instead of old sessions array
  const session = context.get_current_session();
  assert.equal(session.get('name'), 'Finals Round');
});

test('new session stays disabled until the first question has a score', () => {
  const { context } = loadApp(buildSessionSeed([0]));

  context.sync_data_to_display();

  assert.equal(context.$('#new_session').prop('disabled'), true);
});

test('creating a new session works after scoring and writes to storage', async () => {
  const { context, ydoc } = loadApp(buildSessionSeed([5, 3]));

  context.sync_data_to_display();

  assert.equal(context.$('#new_session').prop('disabled'), false);

  // createNewSession is async
  await context.update_data_element('new_session');

  // Check v3.0 multi-doc structure
  const meta = ydoc.getMap('meta');
  const sessionOrder = meta.get('sessionOrder');
  assert.equal(sessionOrder.length, 2, 'Should have 2 sessions');
  
  // Current session should be the new one (index 1 in sessionOrder, but current_session is 2 for UI)
  const currentSessionId = meta.get('currentSession');
  assert.equal(sessionOrder.indexOf(currentSessionId), 1, 'Current session should be second');
  
  // New session should have the right structure
  const newSessionDoc = context.DocManager.sessionDocs.get(currentSessionId);
  const newSession = newSessionDoc.getMap('session');
  assert.equal(newSession.get('questions').length, 2, 'New session should have 2 questions (including placeholder)');
});