const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

function buildIgnoreSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 5,
      rounding: false,
      teams: ['Alpha', 'Beta'],
      blocks: ['No Block/Group'],
      questions: [
        {
          name: 'Q1',
          score: 5,
          block: 0,
          ignore: false,
          teamScores: [
            { score: 5, extraCredit: 0 },
            { score: 3, extraCredit: 0 }
          ]
        },
        {
          name: 'Q2',
          score: 5,
          block: 0,
          ignore: true,
          teamScores: [
            { score: 2, extraCredit: 0 },
            { score: 5, extraCredit: 0 }
          ]
        }
      ],
      currentQuestion: 2
    }]
  });
}

test('ignoring a question disables score entry and removes it from totals', () => {
  const { context } = loadApp(buildIgnoreSeed());

  context.sync_data_to_display();

  const ignoredContainer = context.$('#ignored_question');
  assert.equal(ignoredContainer.css('opacity'), 0.25);
  assert.equal(ignoredContainer.css('pointer-events'), 'none');
  assert.notEqual(context.$('#ignore_question').prop('disabled'), true);
  assert.notEqual(context.$('#previous_question').prop('disabled'), true);
  assert.notEqual(context.$('#next_question').prop('disabled'), true);
  assert.notEqual(context.$('#previous_question_2').prop('disabled'), true);
  assert.notEqual(context.$('#next_question_2').prop('disabled'), true);

  const teamScores = context.$('#team_scores').html();
  assert.ok(teamScores.includes('100.00%'));
  assert.ok(teamScores.includes('5/5'));
  assert.ok(teamScores.includes('60.00%'));
  assert.ok(teamScores.includes('3/5'));
  assert.ok(!teamScores.includes('7/10'));

  const roundedScores = context.$('#rounded_team_scores').html();
  assert.ok(roundedScores.includes('100.00%'));
  assert.ok(roundedScores.includes('5/5'));
  assert.ok(roundedScores.includes('60.00%'));
  assert.ok(roundedScores.includes('3/5'));

  const questionSelector = context.$('#current_question_title_count').html();
  assert.ok(questionSelector.includes('🚫2 of 2'));
});
