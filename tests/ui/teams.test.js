const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

function buildSingleTeamSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 6,
      rounding: false,
      teams: ['Team 1'],
      blocks: ['No Block/Group', 'Block A'],
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

test('adding a team updates score entry and team score tables', () => {
  const { context } = loadApp(buildSingleTeamSeed());

  context.sync_data_to_display();
  const initialTeamCount = context.$('#team_names').children().length;
  const initialScoreEntryCount = context.$('#question_teams').children().length;
  const initialSetupTeamCount = Number(context.$('#total_teams').text());

  context.update_data_element('total_teams_increase');
  context.sync_data_to_display();

  assert.equal(context.$('#team_names').children().length, initialTeamCount + 1);
  assert.equal(context.$('#question_teams').children().length, initialScoreEntryCount + 1);
  assert.equal(Number(context.$('#total_teams').text()), initialSetupTeamCount + 1);
  assert.ok(context.$('#team_scores').html().includes('Team 2'));
  assert.ok(context.$('#rounded_team_scores').html().includes('Team 2'));
});

test('removing a team updates score entry and team score tables', () => {
  const { context } = loadApp(buildSingleTeamSeed());

  context.sync_data_to_display();
  context.update_data_element('total_teams_increase');
  context.sync_data_to_display();

  const expandedTeamCount = context.$('#team_names').children().length;
  const expandedScoreEntryCount = context.$('#question_teams').children().length;
  const expandedSetupTeamCount = Number(context.$('#total_teams').text());

  context.update_data_element('total_teams_decrease');
  context.sync_data_to_display();

  assert.equal(context.$('#team_names').children().length, expandedTeamCount - 1);
  assert.equal(context.$('#question_teams').children().length, expandedScoreEntryCount - 1);
  assert.equal(Number(context.$('#total_teams').text()), expandedSetupTeamCount - 1);
  assert.ok(!context.$('#team_scores').html().includes('Team 2'));
  assert.ok(!context.$('#rounded_team_scores').html().includes('Team 2'));
});

test('renaming a team updates score entry and team score tables', () => {
  const { context } = loadApp(buildSingleTeamSeed());

  context.sync_data_to_display();
  context.update_data_element('team_1_name', 'Falcons');
  context.sync_data_to_display();

  assert.equal(context.$('#team_1_points_label').text().includes('Falcons'), true);
  assert.ok(context.$('#team_scores').html().includes('Falcons'));
  assert.ok(context.$('#rounded_team_scores').html().includes('Falcons'));
});
