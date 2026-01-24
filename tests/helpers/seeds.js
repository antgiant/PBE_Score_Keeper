const { createYjsDoc } = require('./yjs-seeds');

function buildSessionSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 6,
      rounding: false,
      teams: ['Alpha', 'Beta'],
      blocks: ['No Block', 'Block A'],
      questions: [
        {
          name: 'Q1',
          score: 4,
          block: 1,
          ignore: false,
          teamScores: [
            { score: 3, extraCredit: 1 },
            { score: 2, extraCredit: 0 }
          ]
        },
        {
          name: 'Q2',
          score: 6,
          block: 0,
          ignore: false,
          teamScores: [
            { score: 4, extraCredit: 0 },
            { score: 6, extraCredit: 0 }
          ]
        }
      ],
      currentQuestion: 2
    }]
  });
}

module.exports = { buildSessionSeed };
