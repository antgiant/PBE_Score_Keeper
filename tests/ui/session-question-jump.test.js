const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

// Create seed with 2 sessions: Session 1 has 5 questions, Session 2 has 2 questions
function buildMultiSessionSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [
      {
        name: 'Session 1 (5 questions)',
        maxPointsPerQuestion: 5,
        rounding: false,
        teams: ['Team A'],
        blocks: ['No Block'],
        questions: [
          { name: 'Q1', score: 5, block: 0, ignore: false, teamScores: [{ score: 5, extraCredit: 0 }] },
          { name: 'Q2', score: 5, block: 0, ignore: false, teamScores: [{ score: 5, extraCredit: 0 }] },
          { name: 'Q3', score: 5, block: 0, ignore: false, teamScores: [{ score: 5, extraCredit: 0 }] },
          { name: 'Q4', score: 5, block: 0, ignore: false, teamScores: [{ score: 5, extraCredit: 0 }] },
          { name: 'Q5', score: 5, block: 0, ignore: false, teamScores: [{ score: 5, extraCredit: 0 }] }
        ],
        currentQuestion: 5
      },
      {
        name: 'Session 2 (2 questions)',
        maxPointsPerQuestion: 5,
        rounding: false,
        teams: ['Team A'],
        blocks: ['No Block'],
        questions: [
          { name: 'Q1', score: 5, block: 0, ignore: false, teamScores: [{ score: 3, extraCredit: 0 }] },
          { name: 'Q2', score: 5, block: 0, ignore: false, teamScores: [{ score: 4, extraCredit: 0 }] }
        ],
        currentQuestion: 2
      }
    ]
  });
}

test('switching from session with more questions to fewer jumps to last question', async (t) => {
  const { context } = loadApp(buildMultiSessionSeed());
  
  // Start at Session 1 question 5
  assert.equal(context.current_question_index, 5, 'Should start at Q5 of Session 1');
  
  // Switch to Session 2 (only 2 questions)
  await context.switchSession(2);
  
  assert.equal(context.current_question_index, 2, 'Should jump to Q2 (last question) of Session 2');
});

test('switching from session with fewer questions to more jumps to last question', async (t) => {
  const { context } = loadApp(buildMultiSessionSeed());
  
  // Switch to Session 2 first
  await context.switchSession(2);
  assert.equal(context.current_question_index, 2, 'Should be at Q2 of Session 2');
  
  // Switch back to Session 1 (5 questions)
  await context.switchSession(1);
  
  assert.equal(context.current_question_index, 5, 'Should jump to Q5 (last question) of Session 1');
});
