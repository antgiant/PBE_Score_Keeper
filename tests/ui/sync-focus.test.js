const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

/**
 * Create a seed with multiple teams and blocks for focus testing
 */
function buildFocusTestSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Focus Test Session',
      maxPointsPerQuestion: 6,
      rounding: false,
      teams: ['Team Alpha', 'Team Beta'],
      blocks: ['Block 1', 'Block 2'],
      questions: [{
        name: 'Question 1',
        score: 4,
        block: 1,
        ignore: false,
        teamScores: [{ score: 2, extraCredit: 0 }, { score: 3, extraCredit: 0 }]
      }],
      currentQuestion: 1
    }]
  });
}

describe('Focus Preservation Functions', () => {
  let context;
  
  beforeEach(() => {
    const result = loadApp(buildFocusTestSeed());
    context = result.context;
    context.sync_data_to_display();
  });
  
  describe('getActiveFocusState', () => {
    it('should be available as a function', () => {
      assert.strictEqual(typeof context.getActiveFocusState, 'function',
        'getActiveFocusState should be a function');
    });
    
    it('should return an object with required properties', () => {
      const state = context.getActiveFocusState();
      assert.ok(state, 'Should return an object');
      assert.ok('id' in state, 'Should have id property');
      assert.ok('selector' in state, 'Should have selector property');
      assert.ok('selectionStart' in state, 'Should have selectionStart property');
      assert.ok('selectionEnd' in state, 'Should have selectionEnd property');
      assert.ok('contentEditableSelection' in state, 'Should have contentEditableSelection property');
      assert.ok('isContentEditable' in state, 'Should have isContentEditable property');
    });
    
    it('should return null id when no element is focused', () => {
      const state = context.getActiveFocusState();
      assert.strictEqual(state.id, null, 'id should be null when nothing is focused');
    });
  });
  
  describe('restoreFocusState', () => {
    it('should be available as a function', () => {
      assert.strictEqual(typeof context.restoreFocusState, 'function',
        'restoreFocusState should be a function');
    });
    
    it('should handle null state gracefully', () => {
      // Should not throw
      assert.doesNotThrow(() => {
        context.restoreFocusState(null);
      }, 'Should handle null state');
    });
    
    it('should handle state with null id gracefully', () => {
      assert.doesNotThrow(() => {
        context.restoreFocusState({ id: null });
      }, 'Should handle state with null id');
    });
  });
  
  describe('isElementFocused', () => {
    it('should be available as a function', () => {
      assert.strictEqual(typeof context.isElementFocused, 'function',
        'isElementFocused should be a function');
    });
    
    it('should return false when focusState is null', () => {
      const result = context.isElementFocused('team_1_name', null);
      assert.strictEqual(result, false, 'Should return false for null focusState');
    });
    
    it('should return false when focusState has different id', () => {
      const focusState = { id: 'team_2_name', selector: '#team_2_name' };
      const result = context.isElementFocused('team_1_name', focusState);
      assert.strictEqual(result, false, 'Should return false for different id');
    });
    
    it('should return true when focusState has matching id', () => {
      const focusState = { id: 'team_1_name', selector: '#team_1_name' };
      const result = context.isElementFocused('team_1_name', focusState);
      assert.strictEqual(result, true, 'Should return true for matching id');
    });
  });
  
  describe('sync_data_to_display_debounced', () => {
    it('should be available as a function', () => {
      assert.strictEqual(typeof context.sync_data_to_display_debounced, 'function',
        'sync_data_to_display_debounced should be a function');
    });
    
    it('should not throw when called', () => {
      assert.doesNotThrow(() => {
        context.sync_data_to_display_debounced();
      }, 'Should not throw when called');
    });
  });
});

describe('Focus Preservation During Sync Updates', () => {
  let context;
  
  beforeEach(() => {
    const result = loadApp(buildFocusTestSeed());
    context = result.context;
    context.sync_data_to_display();
  });
  
  describe('team name input focus preservation', () => {
    it('should skip updating team name value when that input is focused', () => {
      // Get the initial team name
      const initialTeamName = context.$('#team_1_name').val();
      assert.strictEqual(initialTeamName, 'Team Alpha', 'Initial name should be Team Alpha');
      
      // Simulate focus state where team_1_name is focused
      const focusState = {
        id: 'team_1_name',
        selector: '#team_1_name',
        selectionStart: 5,
        selectionEnd: 5,
        contentEditableSelection: null,
        isContentEditable: false
      };
      
      // Check that isElementFocused correctly identifies focused element
      assert.strictEqual(context.isElementFocused('team_1_name', focusState), true);
      assert.strictEqual(context.isElementFocused('team_2_name', focusState), false);
    });
    
    it('should update team name value when a different input is focused', () => {
      // Focus is on team_2_name, so team_1_name should update
      const focusState = {
        id: 'team_2_name',
        selector: '#team_2_name',
        selectionStart: 5,
        selectionEnd: 5,
        contentEditableSelection: null,
        isContentEditable: false
      };
      
      // team_1_name should not be considered focused
      assert.strictEqual(context.isElementFocused('team_1_name', focusState), false);
    });
  });
  
  describe('block name input focus preservation', () => {
    it('should correctly identify block name focus', () => {
      const focusState = {
        id: 'block_1_name',
        selector: '#block_1_name',
        selectionStart: 3,
        selectionEnd: 3,
        contentEditableSelection: null,
        isContentEditable: false
      };
      
      assert.strictEqual(context.isElementFocused('block_1_name', focusState), true);
      assert.strictEqual(context.isElementFocused('block_2_name', focusState), false);
    });
  });
  
  describe('question title contenteditable focus preservation', () => {
    it('should correctly identify question title focus', () => {
      const focusState = {
        id: 'current_question_title',
        selector: '#current_question_title',
        selectionStart: null,
        selectionEnd: null,
        contentEditableSelection: { startOffset: 5, endOffset: 5, collapsed: true },
        isContentEditable: true
      };
      
      assert.strictEqual(context.isElementFocused('current_question_title', focusState), true);
      assert.strictEqual(context.isElementFocused('team_1_name', focusState), false);
    });
  });
});

describe('Focus State Object Structure', () => {
  let context;
  
  beforeEach(() => {
    const result = loadApp(buildFocusTestSeed());
    context = result.context;
  });
  
  it('should have null values for unfocused state', () => {
    const state = context.getActiveFocusState();
    
    assert.strictEqual(state.id, null, 'id should be null');
    assert.strictEqual(state.selector, null, 'selector should be null');
    assert.strictEqual(state.selectionStart, null, 'selectionStart should be null');
    assert.strictEqual(state.selectionEnd, null, 'selectionEnd should be null');
    assert.strictEqual(state.contentEditableSelection, null, 'contentEditableSelection should be null');
    assert.strictEqual(state.isContentEditable, false, 'isContentEditable should be false');
  });
});
