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
  const { context } = loadApp(buildMaxPointsSeed(4, 2));

  context.sync_data_to_display();

  assert.equal(Number(context.$('#max_points').text()), 4);
  assert.equal(context.$('#question_score').children().length, 4);

  context.update_data_element('max_points_increase');
  context.sync_data_to_display();

  // Check Yjs session doc
  const session = context.get_current_session();
  const config = session.get('config');
  assert.equal(config.get('maxPointsPerQuestion'), 5);
  assert.equal(Number(context.$('#max_points').text()), 5);
  assert.equal(context.$('#question_score').children().length, 5);
});

test('max points decrease updates totals and possible point options', () => {
  const { context } = loadApp(buildMaxPointsSeed(6, 4));

  context.sync_data_to_display();

  assert.equal(Number(context.$('#max_points').text()), 6);
  assert.equal(context.$('#question_score').children().length, 6);

  context.update_data_element('max_points_decrease');
  context.sync_data_to_display();

  // Check Yjs session doc
  const session = context.get_current_session();
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

// ============================================================================
// V5 (UUID-BASED) SESSION TESTS
// ============================================================================

test('max points decrease works on fresh v5 session with no scored questions', () => {
  // Start with empty session list, then create a v5 session
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Create a fresh v5 session using createNewSessionV4 (which creates v5.0 with deterministic IDs)
  const testDoc = new context.Y.Doc();
  const session = context.createNewSessionV4(testDoc, {
    id: 'test-v5-session',
    name: 'Fresh V5 Session',
    maxPointsPerQuestion: 4,
    rounding: false,
    teamNames: ['Team 1'],
    blockNames: ['No Block']
  });
  
  // Store in DocManager and set as active
  context.DocManager.sessionDocs.set('test-v5-session', testDoc);
  context.DocManager.activeSessionId = 'test-v5-session';
  
  // Verify it's a v5 session
  assert.equal(context.isUUIDSession(session), true, 'Should be UUID session');
  assert.equal(session.get('dataVersion'), '5.0', 'Should be v5.0');
  
  // Get initial max points
  const config = session.get('config');
  assert.equal(config.get('maxPointsPerQuestion'), 4, 'Initial max should be 4');
  
  // The session has 1 initial question with 0 points - no constraints on decreasing
  const questions = context.getOrderedQuestions(session);
  assert.equal(questions.length, 1, 'Should have 1 placeholder question');
  assert.equal(questions[0].data.get('score'), 0, 'Placeholder should have 0 points');
  
  // Mock get_current_session to return our v5 session
  const originalGetSession = context.get_current_session;
  context.get_current_session = () => session;
  
  // Mock getActiveSessionDoc to return our doc
  const originalGetDoc = context.getActiveSessionDoc;
  context.getActiveSessionDoc = () => testDoc;
  
  // Decrease max points - should work since no questions have > 1 points
  context.update_data_element('max_points_decrease');
  
  assert.equal(config.get('maxPointsPerQuestion'), 3, 'Max should decrease to 3');
  
  // Decrease again
  context.update_data_element('max_points_decrease');
  assert.equal(config.get('maxPointsPerQuestion'), 2, 'Max should decrease to 2');
  
  // Decrease to 1
  context.update_data_element('max_points_decrease');
  assert.equal(config.get('maxPointsPerQuestion'), 1, 'Max should decrease to 1');
  
  // Restore mocks
  context.get_current_session = originalGetSession;
  context.getActiveSessionDoc = originalGetDoc;
  
  // Cleanup
  context.DocManager.sessionDocs.delete('test-v5-session');
});

test('max points direct set works on fresh v5 session', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Create a fresh v5 session
  const testDoc = new context.Y.Doc();
  const session = context.createNewSessionV4(testDoc, {
    id: 'test-v5-direct',
    name: 'V5 Direct Edit Session',
    maxPointsPerQuestion: 10,
    rounding: false,
    teamNames: ['Team 1'],
    blockNames: ['No Block']
  });
  
  context.DocManager.sessionDocs.set('test-v5-direct', testDoc);
  context.DocManager.activeSessionId = 'test-v5-direct';
  
  const config = session.get('config');
  assert.equal(config.get('maxPointsPerQuestion'), 10);
  
  // Mock session access
  const originalGetSession = context.get_current_session;
  context.get_current_session = () => session;
  const originalGetDoc = context.getActiveSessionDoc;
  context.getActiveSessionDoc = () => testDoc;
  
  // Direct set to lower value should work (no scored questions)
  context.update_data_element('max_points_direct', '3');
  assert.equal(config.get('maxPointsPerQuestion'), 3, 'Direct set to 3 should work');
  
  // Can even set to 1
  context.update_data_element('max_points_direct', '1');
  assert.equal(config.get('maxPointsPerQuestion'), 1, 'Direct set to 1 should work');
  
  // Restore mocks
  context.get_current_session = originalGetSession;
  context.getActiveSessionDoc = originalGetDoc;
  context.DocManager.sessionDocs.delete('test-v5-direct');
});

test('max points respects highest question score in v5 session', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Create a v5 session
  const testDoc = new context.Y.Doc();
  const session = context.createNewSessionV4(testDoc, {
    id: 'test-v5-scored',
    name: 'V5 Scored Session',
    maxPointsPerQuestion: 6,
    rounding: false,
    teamNames: ['Team 1'],
    blockNames: ['No Block']
  });
  
  context.DocManager.sessionDocs.set('test-v5-scored', testDoc);
  context.DocManager.activeSessionId = 'test-v5-scored';
  
  // Add a question with 4 points
  const questions = context.getOrderedQuestions(session);
  const q1 = questions[0];
  testDoc.transact(() => {
    q1.data.set('score', 4);
  }, 'test');
  
  const config = session.get('config');
  
  // Mock session access
  const originalGetSession = context.get_current_session;
  context.get_current_session = () => session;
  const originalGetDoc = context.getActiveSessionDoc;
  context.getActiveSessionDoc = () => testDoc;
  
  // Decrease from 6 to 5 should work
  context.update_data_element('max_points_decrease');
  assert.equal(config.get('maxPointsPerQuestion'), 5, 'Decrease to 5 should work');
  
  // Decrease to 4 should work (matches question score)
  context.update_data_element('max_points_decrease');
  assert.equal(config.get('maxPointsPerQuestion'), 4, 'Decrease to 4 should work');
  
  // Decrease below 4 should NOT work (question has 4 points)
  context.update_data_element('max_points_decrease');
  assert.equal(config.get('maxPointsPerQuestion'), 4, 'Should not decrease below 4');
  
  // Direct set to 3 should be clamped to 4
  context.update_data_element('max_points_direct', '3');
  assert.equal(config.get('maxPointsPerQuestion'), 4, 'Direct set to 3 should clamp to 4');
  
  // Restore mocks
  context.get_current_session = originalGetSession;
  context.getActiveSessionDoc = originalGetDoc;
  context.DocManager.sessionDocs.delete('test-v5-scored');
});
