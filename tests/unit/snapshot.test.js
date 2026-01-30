/**
 * Unit tests for snapshot validation infrastructure (app-snapshot.js)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

test('serializeSnapshot / deserializeSnapshot round-trips correctly', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const snapshot = {
    meta: {
      capturedAt: '2025-01-01T00:00:00.000Z',
      snapshotVersion: 1,
      sessionId: 'test-session-123',
      sessionName: 'Test Session',
      dataVersion: '3.0'
    },
    raw: {
      teams: [{ index: 0, name: '' }, { index: 1, name: 'Team A' }],
      questions: [],
      blocks: [],
      config: { rounding: false },
      history: []
    },
    calculated: {},
    display: { teamNames: ['', 'Team A'], teamCount: 1 }
  };

  const serialized = context.serializeSnapshot(snapshot);
  assert.equal(typeof serialized, 'string');

  const deserialized = context.deserializeSnapshot(serialized);
  assert.deepEqual(deserialized, snapshot);
});

test('deserializeSnapshot returns null for invalid JSON', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  const result = context.deserializeSnapshot('not valid json');
  assert.equal(result, null);
});

test('compareSnapshots returns match=true for identical snapshots', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const snapshot = {
    raw: {
      teams: [{ index: 0, name: '' }, { index: 1, name: 'Team A' }],
      questions: [],
      blocks: [],
      config: { rounding: false },
      history: []
    },
    calculated: {
      teamScoreSummary: null,
      blockScoreSummary: null,
      teamAndBlockScoreSummary: null,
      questionLog: null
    },
    display: {
      teamNames: ['', 'Team A'],
      blockNames: [''],
      teamCount: 1,
      blockCount: 0,
      questionCount: 0
    }
  };

  const result = context.compareSnapshots(snapshot, snapshot);
  assert.equal(result.match, true);
  assert.equal(result.differences.length, 0);
});

test('compareSnapshots detects team name differences', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const before = {
    raw: {
      teams: [{ index: 0, name: '' }, { index: 1, name: 'Team A' }],
      questions: [],
      blocks: [],
      config: { rounding: false }
    },
    calculated: {},
    display: { teamNames: ['', 'Team A'], blockNames: [''], teamCount: 1, blockCount: 0, questionCount: 0 }
  };

  const after = {
    raw: {
      teams: [{ index: 0, name: '' }, { index: 1, name: 'Team B' }],
      questions: [],
      blocks: [],
      config: { rounding: false }
    },
    calculated: {},
    display: { teamNames: ['', 'Team B'], blockNames: [''], teamCount: 1, blockCount: 0, questionCount: 0 }
  };

  const result = context.compareSnapshots(before, after);
  assert.equal(result.match, false);
  assert.ok(result.differences.some(d => d.path.includes('teams')));
});

test('compareSnapshots detects team count differences', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const before = {
    raw: {
      teams: [{ index: 0, name: '' }, { index: 1, name: 'Team A' }],
      questions: [],
      blocks: [],
      config: { rounding: false }
    },
    calculated: {},
    display: { teamNames: ['', 'Team A'], blockNames: [''], teamCount: 1, blockCount: 0, questionCount: 0 }
  };

  const after = {
    raw: {
      teams: [{ index: 0, name: '' }, { index: 1, name: 'Team A' }, { index: 2, name: 'Team B' }],
      questions: [],
      blocks: [],
      config: { rounding: false }
    },
    calculated: {},
    display: { teamNames: ['', 'Team A', 'Team B'], blockNames: [''], teamCount: 2, blockCount: 0, questionCount: 0 }
  };

  const result = context.compareSnapshots(before, after);
  assert.equal(result.match, false);
  assert.ok(result.differences.some(d => d.type === 'count'));
});

test('compareSnapshots detects score differences in questions', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const before = {
    raw: {
      teams: [{ index: 0, name: '' }, { index: 1, name: 'Team A' }],
      questions: [{
        index: 1,
        score: 10,
        block: 0,
        ignore: false,
        teamScores: [{ teamIndex: 0, score: 0, extraCredit: 0 }, { teamIndex: 1, score: 5, extraCredit: 0 }]
      }],
      blocks: [],
      config: { rounding: false }
    },
    calculated: {},
    display: { teamNames: ['', 'Team A'], blockNames: [''], teamCount: 1, blockCount: 0, questionCount: 1 }
  };

  const after = {
    raw: {
      teams: [{ index: 0, name: '' }, { index: 1, name: 'Team A' }],
      questions: [{
        index: 1,
        score: 10,
        block: 0,
        ignore: false,
        teamScores: [{ teamIndex: 0, score: 0, extraCredit: 0 }, { teamIndex: 1, score: 8, extraCredit: 0 }]
      }],
      blocks: [],
      config: { rounding: false }
    },
    calculated: {},
    display: { teamNames: ['', 'Team A'], blockNames: [''], teamCount: 1, blockCount: 0, questionCount: 1 }
  };

  const result = context.compareSnapshots(before, after);
  assert.equal(result.match, false);
  assert.ok(result.differences.some(d => d.path.includes('teamScores') && d.path.includes('score')));
});

test('compareSnapshots detects config differences', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const before = {
    raw: {
      teams: [],
      questions: [],
      blocks: [],
      config: { rounding: false }
    },
    calculated: {},
    display: { teamNames: [], blockNames: [], teamCount: 0, blockCount: 0, questionCount: 0 }
  };

  const after = {
    raw: {
      teams: [],
      questions: [],
      blocks: [],
      config: { rounding: true }
    },
    calculated: {},
    display: { teamNames: [], blockNames: [], teamCount: 0, blockCount: 0, questionCount: 0 }
  };

  const result = context.compareSnapshots(before, after);
  assert.equal(result.match, false);
  assert.ok(result.differences.some(d => d.path === 'raw.config.rounding'));
});

test('compareSnapshots handles null snapshots gracefully', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  const snapshot = { raw: {}, calculated: {}, display: {} };

  const result1 = context.compareSnapshots(null, snapshot);
  assert.equal(result1.match, false);
  assert.ok(result1.differences.some(d => d.type === 'error'));

  const result2 = context.compareSnapshots(snapshot, null);
  assert.equal(result2.match, false);
});

test('compareSnapshots detects differences in team score summary', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const before = {
    raw: { teams: [], questions: [], blocks: [], config: { rounding: false } },
    calculated: {
      teamScoreSummary: [
        ['Team', 'Score'],
        ['Team A', 100]
      ],
      blockScoreSummary: null,
      teamAndBlockScoreSummary: null,
      questionLog: null
    },
    display: { teamNames: [], blockNames: [], teamCount: 0, blockCount: 0, questionCount: 0 }
  };

  const after = {
    raw: { teams: [], questions: [], blocks: [], config: { rounding: false } },
    calculated: {
      teamScoreSummary: [
        ['Team', 'Score'],
        ['Team A', 95]
      ],
      blockScoreSummary: null,
      teamAndBlockScoreSummary: null,
      questionLog: null
    },
    display: { teamNames: [], blockNames: [], teamCount: 0, blockCount: 0, questionCount: 0 }
  };

  const result = context.compareSnapshots(before, after);
  assert.equal(result.match, false);
  assert.ok(result.differences.some(d => d.path.includes('teamScoreSummary')));
});

test('compareSnapshots tolerates floating point differences within threshold', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const before = {
    raw: { teams: [], questions: [], blocks: [], config: { rounding: false } },
    calculated: {
      teamScoreSummary: [
        ['Team', 'Percent'],
        ['Team A', 0.9000001]
      ]
    },
    display: { teamNames: [], blockNames: [], teamCount: 0, blockCount: 0, questionCount: 0 }
  };

  const after = {
    raw: { teams: [], questions: [], blocks: [], config: { rounding: false } },
    calculated: {
      teamScoreSummary: [
        ['Team', 'Percent'],
        ['Team A', 0.9]
      ]
    },
    display: { teamNames: [], blockNames: [], teamCount: 0, blockCount: 0, questionCount: 0 }
  };

  const result = context.compareSnapshots(before, after);
  assert.equal(result.match, true);
});

test('generateComparisonReport shows pass for identical snapshots', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const comparison = {
    match: true,
    differences: [],
    warnings: [],
    summary: {
      rawDataMatch: true,
      calculatedMatch: true,
      displayMatch: true
    }
  };

  const report = context.generateComparisonReport(comparison);
  assert.ok(report.includes('✅ PASS'));
  assert.ok(report.includes('Raw Data Match: ✅'));
});

test('generateComparisonReport shows fail for different snapshots', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const comparison = {
    match: false,
    differences: [
      { type: 'value', path: 'raw.teams[1].name', before: 'Team A', after: 'Team B' }
    ],
    warnings: [],
    summary: {
      rawDataMatch: false,
      calculatedMatch: true,
      displayMatch: true
    }
  };

  const report = context.generateComparisonReport(comparison);
  assert.ok(report.includes('❌ FAIL'));
  assert.ok(report.includes('Raw Data Match: ❌'));
  assert.ok(report.includes('raw.teams[1].name'));
});

test('generateComparisonReport includes warnings', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  const comparison = {
    match: true,
    differences: [],
    warnings: [
      { type: 'missing', path: 'calculated.questionLog', message: 'Summary array missing from one snapshot' }
    ],
    summary: {
      rawDataMatch: true,
      calculatedMatch: true,
      displayMatch: true
    }
  };

  const report = context.generateComparisonReport(comparison);
  assert.ok(report.includes('Warnings'));
  assert.ok(report.includes('questionLog'));
});

test('captureSessionSnapshot returns null when session not found', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // Try to capture a non-existent session
  const result = context.captureSessionSnapshot('non-existent-session-id');
  assert.equal(result, null);
});

test('captureSessionSnapshot captures a valid session', () => {
  // Create a doc with a real session
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Test Session',
      teams: ['Team A', 'Team B'],
      blocks: ['Block 1'],
      questions: [
        { score: 10, block: 0, teamScores: [{ score: 5, extraCredit: 0 }, { score: 8, extraCredit: 0 }] }
      ]
    }]
  }));
  
  // Get the session ID - in test context it's 'test-session-1'
  const sessionId = 'test-session-1';
  
  const snapshot = context.captureSessionSnapshot(sessionId);
  
  assert.ok(snapshot, 'Snapshot should not be null');
  assert.ok(snapshot.meta, 'Snapshot should have meta');
  assert.equal(snapshot.meta.sessionId, sessionId);
  assert.ok(snapshot.raw, 'Snapshot should have raw data');
  assert.ok(snapshot.raw.teams.length > 0, 'Should have teams');
  assert.ok(snapshot.calculated, 'Snapshot should have calculated values');
  assert.ok(snapshot.display, 'Snapshot should have display values');
});
