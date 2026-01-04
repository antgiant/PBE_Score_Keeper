const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');

function buildSingleTeamSeed() {
  return {
    data_version: JSON.stringify(1.5),
    session_names: JSON.stringify(['', 'Session 1']),
    current_session: JSON.stringify(1),
    session_1_max_points_per_question: JSON.stringify(6),
    session_1_rounding: JSON.stringify('false'),
    session_1_block_names: JSON.stringify(['No Block/Group', 'Block A']),
    session_1_team_names: JSON.stringify(['', 'Team 1']),
    session_1_question_names: JSON.stringify(['', 'Q1']),
    session_1_current_question: JSON.stringify(1),
    session_1_question_1_score: JSON.stringify(4),
    session_1_question_1_block: JSON.stringify(1),
    session_1_question_1_ignore: JSON.stringify('false'),
    session_1_question_1_team_1_score: JSON.stringify(3),
    session_1_question_1_team_1_extra_credit: JSON.stringify(0),
  };
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
