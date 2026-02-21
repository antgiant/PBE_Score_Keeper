const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

function buildRoundingSeed() {
  const questionScores = [5, 5, 5];
  const teamScores = [
    [4, 4, 5],
    [4, 4, 4],
  ];

  // Build questions array from the scores
  const questions = questionScores.map((score, index) => ({
    name: `Q${index + 1}`,
    score: score,
    block: 0,
    ignore: false,
    teamScores: teamScores.map(scores => ({
      score: scores[index],
      extraCredit: 0
    }))
  }));

  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 5,
      rounding: false,
      teams: ['Alpha', 'Beta'],
      blocks: ['No Block/Group'],
      questions: questions,
      currentQuestion: 3
    }]
  });
}

test('rounding uses the top team total for live scores and totals', () => {
  const { context } = loadApp(buildRoundingSeed());

  if (process.env.TEST_LOGS) {
    // Execute debug code directly in VM to check state
    const vm = require('vm');
    const debugScript = `
      (function() {
        return {
          current_session: typeof current_session !== 'undefined' ? current_session : 'UNDEFINED',
          has_ydoc: typeof ydoc !== 'undefined',
          session_result: typeof get_current_session !== 'undefined' ? (get_current_session() ? 'HAS_SESSION' : 'NULL_SESSION') : 'NO_FUNCTION'
        };
      })()
    `;
    const debugInfo = vm.runInContext(debugScript, context);
    console.log('Debug from VM:', debugInfo);
  }

  try {
    context.sync_data_to_display();
  } catch (err) {
    console.error('Error during sync_data_to_display:');
    console.error('Message:', err.message);
    console.error('Stack:', err.stack);
    throw err;
  }

  const teamScores = context.$('#team_scores').html();
  assert.ok(teamScores.includes('86.67%'));
  assert.ok(teamScores.includes('13/15'));
  assert.ok(teamScores.includes('80.00%'));
  assert.ok(teamScores.includes('12/15'));
  assert.ok(teamScores.includes('Second Place'));
  assert.ok(context.$('#team_1_points_label').text().includes('86.67%'));
  assert.ok(context.$('#team_2_points_label').text().includes('80.00%'));

  const roundedScores = context.$('#rounded_team_scores').html();
  assert.ok(roundedScores.includes('100.00%'));
  assert.ok(roundedScores.includes('13/13'));
  assert.ok(roundedScores.includes('92.31%'));
  assert.ok(roundedScores.includes('12/13'));
  assert.ok(roundedScores.includes('First Place'));

  context.update_data_element('rounding_yes');
  context.sync_data_to_display();

  assert.ok(context.$('#team_1_points_label').text().includes('100.00%'));
  assert.ok(context.$('#team_2_points_label').text().includes('92.31%'));
});

test('rounding toggle labels follow active language', () => {
  const { context } = loadApp(buildRoundingSeed());

  context.i18n_current_language = 'es';
  context.sync_data_to_display();
  assert.equal(context.$('#rounding_no_label').text(), 'Exacto');
  assert.equal(context.$('#rounding_yes_label').text(), 'Redondeado');

  context.i18n_current_language = 'pig';
  context.sync_data_to_display();
  assert.equal(context.$('#rounding_no_label').text(), 'Exact-ay');
  assert.equal(context.$('#rounding_yes_label').text(), 'Ounded-Ray');
});
