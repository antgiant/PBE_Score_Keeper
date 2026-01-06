/**
 * Yjs Seed Builders for PBE Score Keeper Tests
 *
 * This module provides utilities for creating Yjs Y.Doc test data structures.
 * Instead of using flat localStorage key-value pairs, these helpers create
 * proper nested Yjs CRDT structures with Y.Map and Y.Array objects.
 *
 * Key Patterns:
 * - All data changes wrapped in ydoc.transact() with 'test' origin
 * - Arrays use 1-indexed with null placeholders (except blocks which are 0-indexed)
 * - Use array.push([item]) not array.push(item)
 * - Types are native (numbers, booleans) not JSON strings
 */

/**
 * Create a complete Yjs document from plain JSON configuration
 * @param {Object} config - Configuration object
 * @param {number} config.currentSession - Current active session number (default: 1)
 * @param {Array<Object>} config.sessions - Array of session configurations
 * @returns {Y.Doc} A fully initialized Yjs document
 *
 * @example
 * const ydoc = createYjsDoc({
 *   currentSession: 1,
 *   sessions: [{
 *     name: 'Test Session',
 *     maxPointsPerQuestion: 12,
 *     rounding: false,
 *     teams: ['Team A', 'Team B'],
 *     blocks: ['No Block/Group', 'Block 1'],
 *     questions: [{
 *       name: 'Q1',
 *       score: 4,
 *       block: 0,
 *       ignore: false,
 *       teamScores: [
 *         { score: 3, extraCredit: 0 },
 *         { score: 2, extraCredit: 0 }
 *       ]
 *     }],
 *     currentQuestion: 1
 *   }]
 * });
 */
function createYjsDoc(config) {
  // We need to require Y here since it's loaded by the VM context
  // In tests, Y will be available globally after scripts load
  const Y = typeof global.Y !== 'undefined' ? global.Y : require('../../scripts/yjs.min.js');

  const ydoc = new Y.Doc();

  ydoc.transact(() => {
    // Set metadata
    const meta = ydoc.getMap('meta');
    meta.set('dataVersion', 2.0);
    meta.set('currentSession', config.currentSession || 1);

    // Create sessions array with null placeholder at index 0
    const sessions = ydoc.getArray('sessions');
    sessions.push([null]); // 1-indexed placeholder

    // Build each session
    if (config.sessions) {
      config.sessions.forEach(sessionConfig => {
        const session = buildSession(sessionConfig, Y);
        sessions.push([session]);
      });
    }
  }, 'test');

  return ydoc;
}

/**
 * Build a session Y.Map from configuration
 * @param {Object} config - Session configuration
 * @param {string} config.name - Session name (default: 'Test Session')
 * @param {number} config.maxPointsPerQuestion - Max points per question (default: 12)
 * @param {boolean} config.rounding - Enable rounding (default: false)
 * @param {Array<string>} config.teams - Team names (default: ['Team 1'])
 * @param {Array<string>} config.blocks - Block names (default: ['No Block/Group'])
 * @param {Array<Object>} config.questions - Question configurations (default: [])
 * @param {number} config.currentQuestion - Current question number (default: 1)
 * @param {Object} Y - Yjs library instance
 * @returns {Y.Map} Session map
 */
function buildSession(config, Y) {
  const session = new Y.Map();
  session.set('name', config.name || 'Test Session');

  // Build config map
  const configMap = new Y.Map();
  configMap.set('maxPointsPerQuestion', config.maxPointsPerQuestion || 12);
  configMap.set('rounding', config.rounding || false);
  session.set('config', configMap);

  // Build teams array (1-indexed with null placeholder)
  const teams = new Y.Array();
  teams.push([null]); // Placeholder at index 0
  const teamNames = config.teams || ['Team 1'];
  teamNames.forEach(teamName => {
    const team = new Y.Map();
    team.set('name', teamName);
    teams.push([team]);
  });
  session.set('teams', teams);

  // Build blocks array (0-indexed, NO null placeholder)
  const blocks = new Y.Array();
  const blockNames = config.blocks || ['No Block/Group'];
  blockNames.forEach(blockName => {
    const block = new Y.Map();
    block.set('name', blockName);
    blocks.push([block]);
  });
  session.set('blocks', blocks);

  // Build questions array (1-indexed with null placeholder)
  const questions = new Y.Array();
  questions.push([null]); // Placeholder at index 0
  const questionConfigs = config.questions || [];
  questionConfigs.forEach(qConfig => {
    const question = buildQuestion(qConfig, teamNames.length, Y);
    questions.push([question]);
  });
  session.set('questions', questions);
  session.set('currentQuestion', config.currentQuestion || 1);

  return session;
}

/**
 * Build a question Y.Map from configuration
 * @param {Object} config - Question configuration
 * @param {string} config.name - Question name (default: 'Question 1')
 * @param {number} config.score - Max score for question (default: 0)
 * @param {number} config.block - Block index (default: 0)
 * @param {boolean} config.ignore - Ignore in calculations (default: false)
 * @param {Array<Object>} config.teamScores - Team scores [{score, extraCredit}, ...]
 * @param {number} teamCount - Number of teams
 * @param {Object} Y - Yjs library instance
 * @returns {Y.Map} Question map
 */
function buildQuestion(config, teamCount, Y) {
  const question = new Y.Map();
  question.set('name', config.name || 'Question 1');
  question.set('score', config.score || 0);
  question.set('block', config.block || 0);
  question.set('ignore', config.ignore || false);

  // Build question teams array (1-indexed with null placeholder)
  const questionTeams = new Y.Array();
  questionTeams.push([null]); // Placeholder at index 0

  for (let i = 0; i < teamCount; i++) {
    const teamScore = new Y.Map();
    const scoreData = config.teamScores && config.teamScores[i] ? config.teamScores[i] : {};
    teamScore.set('score', scoreData.score || 0);
    teamScore.set('extraCredit', scoreData.extraCredit || 0);
    questionTeams.push([teamScore]);
  }
  question.set('teams', questionTeams);

  return question;
}

/**
 * Build a basic seed with 2 teams, 1 question
 * Useful for simple tests that don't need complex data
 * @returns {Y.Doc} Basic Yjs document
 */
function buildBasicSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 12,
      rounding: false,
      teams: ['Team 1', 'Team 2'],
      blocks: ['No Block/Group'],
      questions: [
        {
          name: 'Q1',
          score: 4,
          block: 0,
          ignore: false,
          teamScores: [
            { score: 3, extraCredit: 0 },
            { score: 2, extraCredit: 0 }
          ]
        }
      ],
      currentQuestion: 1
    }]
  });
}

/**
 * Build a seed with multiple questions for testing scoring logic
 * @param {Array<number>} questionScores - Array of max scores for each question
 * @returns {Y.Doc} Yjs document with multiple questions
 */
function buildMultiQuestionSeed(questionScores) {
  const questions = questionScores.map((score, index) => ({
    name: `Q${index + 1}`,
    score: score,
    block: 0,
    ignore: false,
    teamScores: [
      { score: Math.min(score, 3), extraCredit: 0 },
      { score: Math.min(score, 2), extraCredit: 0 }
    ]
  }));

  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: Math.max(...questionScores),
      rounding: false,
      teams: ['Team 1', 'Team 2'],
      blocks: ['No Block/Group'],
      questions: questions,
      currentQuestion: questions.length
    }]
  });
}

/**
 * Build a seed with multiple sessions for testing session navigation
 * @param {number} sessionCount - Number of sessions to create
 * @returns {Y.Doc} Yjs document with multiple sessions
 */
function buildMultiSessionSeed(sessionCount) {
  const sessions = [];
  for (let i = 0; i < sessionCount; i++) {
    sessions.push({
      name: `Session ${i + 1}`,
      maxPointsPerQuestion: 12,
      rounding: false,
      teams: ['Team 1', 'Team 2'],
      blocks: ['No Block/Group'],
      questions: [
        {
          name: 'Q1',
          score: 4,
          block: 0,
          ignore: false,
          teamScores: [
            { score: 2, extraCredit: 0 },
            { score: 3, extraCredit: 0 }
          ]
        }
      ],
      currentQuestion: 1
    });
  }

  return createYjsDoc({
    currentSession: 1,
    sessions: sessions
  });
}

module.exports = {
  createYjsDoc,
  buildSession,
  buildQuestion,
  buildBasicSeed,
  buildMultiQuestionSeed,
  buildMultiSessionSeed
};
