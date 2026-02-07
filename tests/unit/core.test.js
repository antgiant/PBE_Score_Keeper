const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');
const { buildSessionSeed } = require('../helpers/seeds');
const { createYjsDoc } = require('../helpers/yjs-seeds');

test('arrayToCsv escapes commas and quotes', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  const csv = context.arrayToCsv([
    ['a', 'b'],
    ['x,y', '"quote"'],
  ]);
  assert.equal(csv, '"a","b"\r\n"x,y","""quote"""');
});

test('filter_to_current_session keeps only the current session data', () => {
  const { context, localStorage } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));

  // Set up localStorage for legacy export utility functions
  localStorage.setItem('current_session', JSON.stringify(2));
  localStorage.setItem('session_names', JSON.stringify(['', 'Session 1', 'Session 2']));

  assert.equal(
    context.filter_to_current_session('session_1_max_points_per_question', '12'),
    undefined,
  );
  assert.equal(
    context.filter_to_current_session('session_names', JSON.stringify(['', 'Session 1', 'Session 2'])),
    '["","Session 2"]',
  );
  assert.equal(
    context.filter_to_current_session('current_session', '2'),
    '1',
  );
});

test('validate_data accepts well-formed exports and rejects invalid data', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  const valid = {
    data_version: JSON.stringify(1.5),
    session_names: JSON.stringify(['', 'Session 1']),
    current_session: JSON.stringify(1),
    session_1_max_points_per_question: JSON.stringify(4),
    session_1_rounding: JSON.stringify('false'),
    session_1_block_names: JSON.stringify(['No Block', 'Block A']),
    session_1_team_names: JSON.stringify(['', 'Alpha']),
    session_1_question_names: JSON.stringify(['', 'Q1']),
    session_1_current_question: JSON.stringify(1),
    session_1_question_1_score: JSON.stringify(4),
    session_1_question_1_block: JSON.stringify(1),
    session_1_question_1_ignore: JSON.stringify('false'),
    session_1_question_1_team_1_score: JSON.stringify(4),
    session_1_question_1_team_1_extra_credit: JSON.stringify(0),
  };

  assert.equal(context.validate_data(valid), true);

  const invalid = {
    ...valid,
    session_1_question_1_team_1_extra_credit: JSON.stringify(-1),
  };
  assert.equal(context.validate_data(invalid), false);
});

test('data_upgrades adds missing extra credit fields for legacy data', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  const legacy = {
    data_version: JSON.stringify(1.4),
    session_names: JSON.stringify(['', 'Session 1']),
    current_session: JSON.stringify(1),
    session_1_max_points_per_question: JSON.stringify(3),
    session_1_rounding: JSON.stringify('false'),
    session_1_block_names: JSON.stringify(['No Block']),
    session_1_team_names: JSON.stringify(['', 'Alpha']),
    session_1_question_names: JSON.stringify(['', 'Q1']),
    session_1_current_question: JSON.stringify(1),
    session_1_question_1_score: JSON.stringify(3),
    session_1_question_1_block: JSON.stringify(0),
    session_1_question_1_ignore: JSON.stringify('false'),
    session_1_question_1_team_1_score: JSON.stringify(3),
  };

  context.data_upgrades(1.4, legacy);

  assert.equal(legacy.data_version, 1.5);
  assert.equal(legacy.session_1_question_1_team_1_extra_credit, '0');
});

test('get_team_score_summary returns expected totals and placements', () => {
  const { context } = loadApp(buildSessionSeed());
  const summary = context.get_team_score_summary();

  assert.equal(summary[1][0], 'Alpha');
  assert.equal(summary[1][1], '80.00%');
  assert.equal(summary[1][2], '8/10');
  assert.equal(summary[1][3], 'Second Place');
  assert.equal(summary[1][7], '100.00%');
  assert.equal(summary[1][9], 'First Place');

  assert.equal(summary[2][0], 'Beta');
  assert.equal(summary[2][1], '80.00%');
  assert.equal(summary[2][2], '8/10');
  assert.equal(summary[2][3], 'Second Place');
  assert.equal(summary[2][7], '100.00%');
  assert.equal(summary[2][9], 'First Place');
});

test('get_block_score_summary rolls up blocks correctly', () => {
  const { context } = loadApp(buildSessionSeed());
  const summary = context.get_block_score_summary();

  assert.equal(summary[1][0], 'No Block');
  assert.equal(summary[1][1], '83.33%');
  assert.equal(summary[1][2], '10/12');

  assert.equal(summary[2][0], 'Block A');
  assert.equal(summary[2][1], '75.00%');
  assert.equal(summary[2][2], '6/8');
});

test('get_team_and_block_score_summary splits results by team and block', () => {
  const { context } = loadApp(buildSessionSeed());
  const summary = context.get_team_and_block_score_summary();

  assert.equal(summary[1][0], 'Alpha');
  assert.equal(summary[1][1], 'No Block');
  assert.equal(summary[1][2], '66.67%');
  assert.equal(summary[1][3], '4/6');

  assert.equal(summary[2][0], 'Alpha');
  assert.equal(summary[2][1], 'Block A');
  assert.equal(summary[2][2], '100.00%');
  assert.equal(summary[2][3], '4/4');
});

test('get_question_log renders question rows with extra credit', () => {
  const { context } = loadApp(buildSessionSeed());
  const log = context.get_question_log();

  assert.equal(log[1][0], 'Q1');
  assert.equal(log[1][1], 'Block A');
  assert.equal(log[1][2], 4);
  assert.equal(log[1][3], false);  // Yjs stores booleans natively, not as 'false' string
});

test('has_yjs_data recognizes all current data version formats', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // These constants should match what's defined in app-yjs.js
  const DATA_VERSION_CURRENT = context.DATA_VERSION_CURRENT || '5.0';
  const DATA_VERSION_UUID = context.DATA_VERSION_UUID || '4.0';
  const DATA_VERSION_DETERMINISTIC = context.DATA_VERSION_DETERMINISTIC || '5.0';
  
  // Get the validVersions array from has_yjs_data by checking what versions it accepts
  // The function should recognize all current version formats
  const allVersions = [DATA_VERSION_CURRENT, DATA_VERSION_UUID, DATA_VERSION_DETERMINISTIC];
  
  for (const version of allVersions) {
    // Create a mock global doc with this version
    const meta = context.getGlobalDoc().getMap('meta');
    meta.set('dataVersion', version);
    
    assert.equal(
      context.has_yjs_data(), 
      true, 
      `has_yjs_data() should return true for version ${version}`
    );
  }
});

test('is_multi_doc recognizes all multi-doc version formats', () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [] }));
  
  // v3.0+ are all multi-doc
  const multiDocVersions = ['3.0', '4.0', '5.0'];
  
  for (const version of multiDocVersions) {
    const meta = context.getGlobalDoc().getMap('meta');
    meta.set('dataVersion', version);
    
    assert.equal(
      context.is_multi_doc(), 
      true, 
      `is_multi_doc() should return true for version ${version}`
    );
  }
});
