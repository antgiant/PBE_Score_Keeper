const test = require('node:test');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

function buildScoreSummarySeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 10,
      rounding: false,
      teams: ['Alpha', 'Beta', 'Gamma'],
      blocks: ['No Block', 'Block A'],
      questions: [
        {
          name: 'Q1',
          score: 10,
          block: 0,
          ignore: false,
          teamScores: [
            { score: 9, extraCredit: 1 },
            { score: 10, extraCredit: 0 },
            { score: 7, extraCredit: 0 }
          ]
        },
        {
          name: 'Q2',
          score: 10,
          block: 1,
          ignore: false,
          teamScores: [
            { score: 6, extraCredit: 0 },
            { score: 8, extraCredit: 2 },
            { score: 5, extraCredit: 0 }
          ]
        }
      ],
      currentQuestion: 2
    }]
  });
}

function buildDeleteSessionSeed() {
  return createYjsDoc({
    currentSession: 2,
    sessions: [
      {
        name: 'Session 1',
        maxPointsPerQuestion: 5,
        rounding: false,
        teams: ['Alpha'],
        blocks: ['No Block'],
        questions: [{
          name: 'Q1',
          score: 5,
          block: 0,
          ignore: false,
          teamScores: [{ score: 4, extraCredit: 0 }]
        }],
        currentQuestion: 1
      },
      {
        name: 'Session 2',
        maxPointsPerQuestion: 10,
        rounding: false,
        teams: ['Beta'],
        blocks: ['No Block'],
        questions: [{
          name: 'Q1',
          score: 10,
          block: 0,
          ignore: false,
          teamScores: [{ score: 7, extraCredit: 1 }]
        }],
        currentQuestion: 1
      }
    ]
  });
}

// Test that seed data loads correctly into Yjs (v5.0 multi-doc)
test('score summary seed data loads correctly', () => {
  const { context, ydoc } = loadApp(buildScoreSummarySeed());
  const meta = ydoc.getMap('meta');
  const sessionOrder = meta.get('sessionOrder');
  
  if (sessionOrder && sessionOrder.length > 0) {
    const sessionDoc = context.DocManager.sessionDocs.get(sessionOrder[0]);
    if (sessionDoc) {
      const session = sessionDoc.getMap('session');
      const name = session.get('name');
      if (name === 'Session 1') {
        // Success - data structure is correct
      } else {
        throw new Error('Session name mismatch, got: ' + name);
      }
    } else {
      throw new Error('Session doc not found');
    }
  } else {
    throw new Error('No sessions found');
  }
});

// Test that question log seed data is correct (v5.0 multi-doc)
test('question log seed data is valid', () => {
  const { context, ydoc } = loadApp(buildScoreSummarySeed());
  const meta = ydoc.getMap('meta');
  const sessionOrder = meta.get('sessionOrder');
  const sessionDoc = context.DocManager.sessionDocs.get(sessionOrder[0]);
  const session = sessionDoc.getMap('session');
  // v5 uses questionsById (Y.Map) instead of questions array
  const questionsById = session.get('questionsById');
  if (!questionsById || questionsById.size < 2) {
    throw new Error('Questions not properly loaded');
  }
});

// Test that delete session seed has two sessions (v5.0 multi-doc)
test('delete session seed has correct structure', () => {
  const { context, ydoc } = loadApp(buildDeleteSessionSeed());
  const meta = ydoc.getMap('meta');
  const sessionOrder = meta.get('sessionOrder');
  // sessionOrder should have 2 UUIDs for 2 sessions
  if (!sessionOrder || sessionOrder.length !== 2) {
    throw new Error(`Expected 2 sessions in sessionOrder, got ${sessionOrder ? sessionOrder.length : 0}`);
  }
});
