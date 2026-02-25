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

function buildTwoSessionSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 6,
      rounding: false,
      teams: ['Team 1'],
      blocks: ['No Block'],
      questions: [{
        name: 'Q1',
        score: 4,
        block: 0,
        ignore: false,
        teamScores: [{ score: 3, extraCredit: 0 }]
      }],
      currentQuestion: 1
    }, {
      name: 'Session 2',
      maxPointsPerQuestion: 6,
      rounding: false,
      teams: ['Team 1'],
      blocks: ['No Block'],
      questions: [{
        name: 'Q1',
        score: 5,
        block: 0,
        ignore: false,
        teamScores: [{ score: 4, extraCredit: 0 }]
      }],
      currentQuestion: 1
    }]
  });
}

test('renaming a session via renameSession updates session name', () => {
  const { context, ydoc } = loadApp(buildBasicSessionSeed());

  // Get the current session ID and rename via renameSession
  const session = context.get_current_session();
  const sessionId = session.get('id');
  context.renameSession(sessionId, 'Finals Round');

  // Check session doc for updated name
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

  // Check multi-doc structure
  const meta = ydoc.getMap('meta');
  const sessionOrder = meta.get('sessionOrder');
  assert.equal(sessionOrder.length, 2, 'Should have 2 sessions');
  
  // Current session should be the new one (index 1 in sessionOrder, but current_session is 2 for UI)
  const currentSessionId = meta.get('currentSession');
  assert.equal(sessionOrder.indexOf(currentSessionId), 1, 'Current session should be second');
  
  // New session should have the right structure
  const newSessionDoc = context.DocManager.sessionDocs.get(currentSessionId);
  const newSession = newSessionDoc.getMap('session');
  
  // Check v5 deterministic structure
  const questionOrder = newSession.get('questionOrder');
  assert.ok(questionOrder, 'New session should have questionOrder array');
  assert.equal(questionOrder.length, 1, 'New session should have 1 question in questionOrder (placeholder)');
  assert.equal(questionOrder.get(0), 'q-1', 'New session should start with deterministic q-1');
});

test('results session nav buttons switch sessions using shared handlers', async () => {
  const { context } = loadApp(buildTwoSessionSeed());

  assert.equal(context.get_current_session_index(), 1, 'Should start on session 1');

  await context.update_data_element('results_session_next_button');
  assert.equal(context.get_current_session_index(), 2, 'Should move to session 2 from results next button');

  await context.update_data_element('results_session_prev_button');
  assert.equal(context.get_current_session_index(), 1, 'Should move back to session 1 from results previous button');
});
