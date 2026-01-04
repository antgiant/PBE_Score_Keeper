const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');

function buildBlockSeed() {
  return {
    data_version: JSON.stringify(1.5),
    session_names: JSON.stringify(['', 'Session 1']),
    current_session: JSON.stringify(1),
    session_1_max_points_per_question: JSON.stringify(6),
    session_1_rounding: JSON.stringify('false'),
    session_1_block_names: JSON.stringify(['No Block/Group', 'Block/Group 1']),
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

test('adding a block updates score entry and summaries', () => {
  const { context } = loadApp(buildBlockSeed());

  context.sync_data_to_display();
  const initialBlockCount = context.$('#block_names').children().length;
  const initialScoreEntryCount = context.$('#question_block').children().length;
  const initialSetupBlockCount = Number(context.$('#total_blocks').text());

  context.update_data_element('total_blocks_increase');
  context.update_data_element('question_block_2', 2);
  context.sync_data_to_display();

  assert.equal(context.$('#block_names').children().length, initialBlockCount + 1);
  assert.equal(context.$('#question_block').children().length, initialScoreEntryCount + 1);
  assert.equal(Number(context.$('#total_blocks').text()), initialSetupBlockCount + 1);
  assert.ok(context.$('#block_scores').html().includes('Block/Group 2'));
  assert.ok(context.$('#team_and_block_scores').html().includes('Block/Group 2'));
});

test('removing a block updates score entry', () => {
  const { context } = loadApp(buildBlockSeed());

  context.sync_data_to_display();
  context.update_data_element('total_blocks_increase');
  context.sync_data_to_display();

  const expandedBlockCount = context.$('#block_names').children().length;
  const expandedScoreEntryCount = context.$('#question_block').children().length;
  const expandedSetupBlockCount = Number(context.$('#total_blocks').text());

  context.update_data_element('total_blocks_decrease');
  context.sync_data_to_display();

  assert.equal(context.$('#block_names').children().length, expandedBlockCount - 1);
  assert.equal(context.$('#question_block').children().length, expandedScoreEntryCount - 1);
  assert.equal(Number(context.$('#total_blocks').text()), expandedSetupBlockCount - 1);
});

test('renaming a block updates score entry and summaries', () => {
  const { context } = loadApp(buildBlockSeed());

  context.sync_data_to_display();
  context.update_data_element('block_1_name', 'Alpha Block');
  context.sync_data_to_display();

  assert.equal(context.$('#block_1_name').val(), 'Alpha Block');
  assert.equal(context.$('#block_1_label').text(), 'Alpha Block');
  assert.ok(context.$('#block_scores').html().includes('Alpha Block'));
  assert.ok(context.$('#team_and_block_scores').html().includes('Alpha Block'));
});
