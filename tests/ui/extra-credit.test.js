const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, exportYjsToLocalStorageFormat } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

function buildExtraCreditSeed() {
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
            { score: 4, extraCredit: 1 },
            { score: 5, extraCredit: 2 }
          ]
        },
        {
          name: 'Q2',
          score: 5,
          block: 0,
          ignore: false,
          teamScores: [
            { score: 4, extraCredit: 0 },
            { score: 5, extraCredit: 0 }
          ]
        }
      ],
      currentQuestion: 2
    }]
  });
}

function buildExtraCreditUiSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 5,
      rounding: false,
      teams: ['Alpha', 'Beta'],
      blocks: ['No Block/Group'],
      questions: [{
        name: 'Q1',
        score: 5,
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

function buildExtraCreditRoundingSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 5,
      rounding: true,
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
            { score: 4, extraCredit: 2 }
          ]
        },
        {
          name: 'Q2',
          score: 5,
          block: 0,
          ignore: false,
          teamScores: [
            { score: 4, extraCredit: 0 },
            { score: 4, extraCredit: 3 }
          ]
        }
      ],
      currentQuestion: 2
    }]
  });
}

test('allowing extra credit shows extra credit controls for each team', () => {
  const { context } = loadApp(buildExtraCreditUiSeed());

  context.$('#extra_credit').prop('checked', true);
  context.sync_data_to_display();

  assert.equal(context.$('#extra_credit').prop('checked'), true);
  assert.equal(context.$('#team_1_extra_credit_label').css('display'), 'block');
  assert.equal(context.$('#team_2_extra_credit_label').css('display'), 'block');
});

test('extra credit buttons update the stored value and display', () => {
  const { context } = loadApp(buildExtraCreditUiSeed());

  context.$('#extra_credit').prop('checked', true);
  context.sync_data_to_display();

  context.update_data_element('team_1_extra_credit_increase');
  context.update_data_element('team_1_extra_credit_increase');
  context.update_data_element('team_1_extra_credit_decrease');
  context.sync_data_to_display();

  assert.equal(context.$('#team_1_extra_credit').text(), '1');
  
  // Check Yjs session doc
  const session = context.get_current_session();
  const question = session.get('questions').get(1);
  const teamScore = question.get('teams').get(1);
  assert.equal(teamScore.get('extraCredit'), 1);
});

test('extra credit points are included in team score totals', () => {
  const { context } = loadApp(buildExtraCreditSeed());

  context.sync_data_to_display();

  const teamScores = context.$('#team_scores').html();
  assert.ok(teamScores.includes('90.00%'));
  assert.ok(teamScores.includes('9/10'));
  assert.ok(teamScores.includes('120.00%'));
  assert.ok(teamScores.includes('12/10'));
});

test('rounded team scores use the top non-extra-credit total', () => {
  const { context } = loadApp(buildExtraCreditRoundingSeed());

  context.sync_data_to_display();

  const roundedScores = context.$('#rounded_team_scores').html();
  assert.ok(roundedScores.includes('144.44%'));
  assert.ok(roundedScores.includes('13/9'));
});
