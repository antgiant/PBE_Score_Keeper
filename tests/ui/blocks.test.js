const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

function buildBlockSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 6,
      rounding: false,
      teams: ['Team 1'],
      blocks: ['No Block', 'Block 1'],
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
  assert.ok(context.$('#block_scores').html().includes('Block 2'));
  assert.ok(context.$('#team_and_block_scores').html().includes('Block 2'));
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

function buildSingleBlockSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 6,
      rounding: false,
      teams: ['Team 1'],
      blocks: ['No Block', 'Block 1'],  // block_count = 1 (single visible block)
      questions: [{
        name: 'Q1',
        score: 4,
        block: 1,  // Assigned to Block 1
        ignore: false,
        teamScores: [{ score: 3, extraCredit: 0 }]
      }],
      currentQuestion: 1
    }]
  });
}

function buildMultiBlockSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 6,
      rounding: false,
      teams: ['Team 1'],
      blocks: ['No Block', 'Block 1', 'Block 2'],  // block_count = 2 (multiple visible blocks)
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

test('single block auto-selects and hides block-related UI', () => {
  const { context } = loadApp(buildSingleBlockSeed());

  context.sync_data_to_display();
  
  // Block should be auto-selected
  assert.equal(context.$('#question_block_1').prop('checked'), true);
  
  // Block selector container (including drag handle) should be hidden
  assert.equal(context.$('#score_entry_block_container').css('display'), 'none');
  
  // Score by Block accordion sections should be hidden
  assert.equal(context.$('#accordion_score_by_block').css('display'), 'none');
  assert.equal(context.$('#accordion_score_by_block_panel').css('display'), 'none');
  
  // Score by Team & Block accordion sections should be hidden
  assert.equal(context.$('#accordion_score_by_team_and_block').css('display'), 'none');
  assert.equal(context.$('#accordion_score_by_team_and_block_panel').css('display'), 'none');
});

test('block-related UI shows when multiple blocks exist', () => {
  const { context } = loadApp(buildMultiBlockSeed());

  context.sync_data_to_display();
  
  // Block selector container should be visible
  assert.notEqual(context.$('#score_entry_block_container').css('display'), 'none');
  
  // Score by Block accordion sections should be visible (empty string means no inline style hiding)
  assert.notEqual(context.$('#accordion_score_by_block').css('display'), 'none');
  assert.notEqual(context.$('#accordion_score_by_block_panel').css('display'), 'none');
  
  // Score by Team & Block accordion sections should be visible
  assert.notEqual(context.$('#accordion_score_by_team_and_block').css('display'), 'none');
  assert.notEqual(context.$('#accordion_score_by_team_and_block_panel').css('display'), 'none');
});

test('adding second block shows block-related UI', () => {
  const { context } = loadApp(buildSingleBlockSeed());

  context.sync_data_to_display();
  
  // Initially hidden with single block
  assert.equal(context.$('#score_entry_block_container').css('display'), 'none');
  
  // Add a second block
  context.update_data_element('total_blocks_increase');
  context.sync_data_to_display();
  
  // Block selector container should now be visible
  assert.notEqual(context.$('#score_entry_block_container').css('display'), 'none');
  
  // Score by Block accordion sections should now be visible
  assert.notEqual(context.$('#accordion_score_by_block').css('display'), 'none');
  assert.notEqual(context.$('#accordion_score_by_block_panel').css('display'), 'none');
  
  // Score by Team & Block accordion sections should now be visible
  assert.notEqual(context.$('#accordion_score_by_team_and_block').css('display'), 'none');
  assert.notEqual(context.$('#accordion_score_by_team_and_block_panel').css('display'), 'none');
});
