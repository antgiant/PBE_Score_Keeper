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
      blocks: ['No Block/Group', 'Block A'],
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
        blocks: ['No Block/Group'],
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
        blocks: ['No Block/Group'],
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

// Test that seed data loads correctly into Yjs
test('score summary seed data loads correctly', () => {
  const { ydoc } = loadApp(buildScoreSummarySeed());
  const sessions = ydoc.getArray('sessions');
  if (sessions && sessions.length > 0) {
    const session = sessions.get(1);
    if (session && session.get) {
      const name = session.get('name');
      if (name === 'Session 1') {
        // Success - data structure is correct
      } else {
        throw new Error('Session name mismatch');
      }
    } else {
      throw new Error('Session not found');
    }
  } else {
    throw new Error('No sessions found');
  }
});

// Test that question log seed data is correct
test('question log seed data is valid', () => {
  const { ydoc } = loadApp(buildScoreSummarySeed());
  const sessions = ydoc.getArray('sessions');
  const session = sessions.get(1);
  const questions = session.get('questions');
  if (!questions || questions.length < 2) {
    throw new Error('Questions not properly loaded');
  }
});

// Test that delete session seed has two sessions
test('delete session seed has correct structure', () => {
  const { ydoc } = loadApp(buildDeleteSessionSeed());
  const sessions = ydoc.getArray('sessions');
  // Yjs arrays have null placeholder at index 0, so length should be 3 (null + 2 sessions)
  if (!sessions || sessions.length !== 3) {
    throw new Error(`Expected 3 total sessions (including null placeholder), got ${sessions.length}`);
  }
});
