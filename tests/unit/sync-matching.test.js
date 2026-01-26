const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// Mock browser globals
global.localStorage = {
  store: {},
  getItem(key) { return this.store[key] || null; },
  setItem(key, value) { this.store[key] = value; },
  removeItem(key) { delete this.store[key]; },
  clear() { this.store = {}; }
};

// Mock document
global.document = {
  getElementById: function() { return null; },
  querySelector: function() { return null; },
  querySelectorAll: function() { return []; },
  createElement: function(tag) {
    return {
      tagName: tag.toUpperCase(),
      className: '',
      id: '',
      textContent: '',
      innerHTML: '',
      style: {},
      dataset: {},
      classList: { add: function() {}, remove: function() {}, contains: function() { return false; } },
      setAttribute: function() {},
      getAttribute: function() { return null; },
      addEventListener: function() {},
      removeEventListener: function() {},
      appendChild: function() {},
      remove: function() {},
      focus: function() {},
      closest: function() { return null; }
    };
  },
  body: { appendChild: function() {} },
  addEventListener: function() {},
  removeEventListener: function() {},
  activeElement: null
};

describe('Sync Matching', () => {
  let syncModule;
  
  beforeEach(() => {
    global.localStorage.clear();
    delete require.cache[require.resolve('../../scripts/app-sync.js')];
    syncModule = require('../../scripts/app-sync.js');
  });

  describe('compareArrays', () => {
    it('should find exact name matches', () => {
      const local = [null, 'Eagles', 'Hawks', 'Lions'];
      const remote = [null, 'Eagles', 'Hawks', 'Lions'];
      
      const result = syncModule.compareArrays(local, remote, 'team');
      
      assert.strictEqual(result.matches.length, 3, 'Should have 3 matches');
      assert.strictEqual(result.matches[0].confidence, 'exact');
      assert.strictEqual(result.matches[1].confidence, 'exact');
      assert.strictEqual(result.matches[2].confidence, 'exact');
      assert.strictEqual(result.needsReview, false, 'Should not need review');
    });
    
    it('should be case-insensitive', () => {
      const local = [null, 'Eagles', 'HAWKS'];
      const remote = [null, 'eagles', 'Hawks'];
      
      const result = syncModule.compareArrays(local, remote, 'team');
      
      assert.strictEqual(result.matches.length, 2, 'Should find both matches');
      assert.strictEqual(result.matches[0].confidence, 'exact');
      assert.strictEqual(result.matches[1].confidence, 'exact');
    });
    
    it('should detect position-only matches when names differ', () => {
      const local = [null, 'Team A', 'Team B'];
      const remote = [null, 'Eagles', 'Hawks'];
      
      const result = syncModule.compareArrays(local, remote, 'team');
      
      // No exact matches, so should use position matching
      assert.strictEqual(result.matches.length, 2, 'Should have 2 position matches');
      assert.strictEqual(result.matches[0].confidence, 'position');
      assert.strictEqual(result.matches[1].confidence, 'position');
      assert.strictEqual(result.needsReview, true, 'Should need review');
    });
    
    it('should track unmatched remote items', () => {
      const local = [null, 'Eagles'];
      const remote = [null, 'Eagles', 'Hawks', 'Lions'];
      
      const result = syncModule.compareArrays(local, remote, 'team');
      
      assert.strictEqual(result.matches.length, 1, 'Should match Eagles');
      assert.strictEqual(result.unmatched.remote.length, 2, 'Should have 2 unmatched remote');
      assert.strictEqual(result.unmatched.remote[0].name, 'Hawks');
      assert.strictEqual(result.unmatched.remote[1].name, 'Lions');
      assert.strictEqual(result.needsReview, true);
    });
    
    it('should track unmatched local items', () => {
      const local = [null, 'Eagles', 'Hawks', 'Lions'];
      const remote = [null, 'Eagles'];
      
      const result = syncModule.compareArrays(local, remote, 'team');
      
      assert.strictEqual(result.matches.length, 1, 'Should match Eagles');
      assert.strictEqual(result.unmatched.local.length, 2, 'Should have 2 unmatched local');
      assert.strictEqual(result.unmatched.local[0].name, 'Hawks');
      assert.strictEqual(result.unmatched.local[1].name, 'Lions');
    });
    
    it('should handle empty arrays', () => {
      const local = [null];
      const remote = [null];
      
      const result = syncModule.compareArrays(local, remote, 'team');
      
      assert.strictEqual(result.matches.length, 0);
      assert.strictEqual(result.unmatched.local.length, 0);
      assert.strictEqual(result.unmatched.remote.length, 0);
      assert.strictEqual(result.needsReview, false);
    });
    
    it('should handle null entries correctly', () => {
      const local = [null, 'Eagles', null, 'Hawks'];
      const remote = [null, 'Eagles', 'Lions', null];
      
      const result = syncModule.compareArrays(local, remote, 'team');
      
      // Should match Eagles exactly
      assert.ok(result.matches.some(m => m.localName === 'Eagles' && m.confidence === 'exact'));
    });
    
    it('should prefer exact matches over position matches', () => {
      const local = [null, 'Hawks', 'Eagles'];
      const remote = [null, 'Eagles', 'Hawks'];
      
      const result = syncModule.compareArrays(local, remote, 'team');
      
      // Should find exact matches even though positions differ
      assert.strictEqual(result.matches.length, 2);
      assert.ok(result.matches.every(m => m.confidence === 'exact'), 'All matches should be exact');
    });
  });
  
  describe('compareSessionData', () => {
    it('should compare all categories', () => {
      const local = {
        teams: [null, 'Team 1', 'Team 2'],
        blocks: [null, 'Block A', 'Block B'],
        questions: [null, 'Q1', 'Q2']
      };
      
      const remote = {
        teams: [null, 'Team 1', 'Team 2'],
        blocks: [null, 'Block A', 'Block B'],
        questions: [null, 'Q1', 'Q2']
      };
      
      const result = syncModule.compareSessionData(local, remote);
      
      assert.ok(result.teams, 'Should have teams comparison');
      assert.ok(result.blocks, 'Should have blocks comparison');
      assert.ok(result.questions, 'Should have questions comparison');
      
      assert.strictEqual(result.teams.matches.length, 2);
      assert.strictEqual(result.blocks.matches.length, 2);
      assert.strictEqual(result.questions.matches.length, 2);
    });
    
    it('should handle missing categories gracefully', () => {
      const local = { teams: [null, 'Team 1'] };
      const remote = { blocks: [null, 'Block A'] };
      
      const result = syncModule.compareSessionData(local, remote);
      
      assert.ok(result.teams);
      assert.ok(result.blocks);
      assert.ok(result.questions);
    });
  });
  
  describe('getMatchStats', () => {
    it('should calculate correct totals', () => {
      const comparison = {
        teams: {
          matches: [
            { confidence: 'exact' },
            { confidence: 'position' }
          ],
          unmatched: { remote: [{ name: 'New Team' }], local: [] },
          needsReview: true
        },
        blocks: {
          matches: [{ confidence: 'exact' }],
          unmatched: { remote: [], local: [] },
          needsReview: false
        },
        questions: {
          matches: [],
          unmatched: { remote: [{ name: 'Q1' }], local: [] },
          needsReview: true
        }
      };
      
      const stats = syncModule.getMatchStats(comparison);
      
      assert.strictEqual(stats.teams.total, 3);
      assert.strictEqual(stats.teams.exact, 1);
      assert.strictEqual(stats.teams.needsReview, true);
      
      assert.strictEqual(stats.blocks.total, 1);
      assert.strictEqual(stats.blocks.exact, 1);
      assert.strictEqual(stats.blocks.needsReview, false);
      
      assert.strictEqual(stats.questions.total, 1);
      assert.strictEqual(stats.questions.exact, 0);
      assert.strictEqual(stats.questions.needsReview, true);
    });
    
    it('should set overallNeedsReview correctly', () => {
      const comparisonNeedsReview = {
        teams: { matches: [], unmatched: { remote: [{ name: 'X' }], local: [] }, needsReview: true },
        blocks: { matches: [], unmatched: { remote: [], local: [] }, needsReview: false },
        questions: { matches: [], unmatched: { remote: [], local: [] }, needsReview: false }
      };
      
      const statsNeedsReview = syncModule.getMatchStats(comparisonNeedsReview);
      assert.strictEqual(statsNeedsReview.overallNeedsReview, true);
      
      const comparisonNoReview = {
        teams: { matches: [{ confidence: 'exact' }], unmatched: { remote: [], local: [] }, needsReview: false },
        blocks: { matches: [], unmatched: { remote: [], local: [] }, needsReview: false },
        questions: { matches: [], unmatched: { remote: [], local: [] }, needsReview: false }
      };
      
      const statsNoReview = syncModule.getMatchStats(comparisonNoReview);
      assert.strictEqual(statsNoReview.overallNeedsReview, false);
    });
  });
  
  describe('applyMappings', () => {
    it('should handle null inputs gracefully', () => {
      // Should not throw
      syncModule.applyMappings(null, null);
      syncModule.applyMappings({}, null);
    });
    
    it('should accept valid mappings structure', () => {
      const mappings = {
        teams: { 1: 1, 2: 2 },
        blocks: { 1: 'new' },
        questions: {}
      };
      
      // Should not throw with null doc
      syncModule.applyMappings(mappings, null);
    });
  });
});
