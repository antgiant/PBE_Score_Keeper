const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');

function buildExportSeed() {
  return {
    data_version: JSON.stringify(1.5),
    session_names: JSON.stringify(['', 'Session 1']),
    current_session: JSON.stringify(1),
    session_1_max_points_per_question: JSON.stringify(10),
    session_1_rounding: JSON.stringify('false'),
    session_1_block_names: JSON.stringify(['No Block/Group', 'Block A']),
    session_1_team_names: JSON.stringify(['', 'Alpha', 'Beta', 'Gamma']),
    session_1_question_names: JSON.stringify(['', 'Q1', 'Q2']),
    session_1_current_question: JSON.stringify(2),
    session_1_question_1_score: JSON.stringify(10),
    session_1_question_1_block: JSON.stringify(0),
    session_1_question_1_ignore: JSON.stringify('false'),
    session_1_question_1_team_1_score: JSON.stringify(9),
    session_1_question_1_team_1_extra_credit: JSON.stringify(1),
    session_1_question_1_team_2_score: JSON.stringify(10),
    session_1_question_1_team_2_extra_credit: JSON.stringify(0),
    session_1_question_1_team_3_score: JSON.stringify(7),
    session_1_question_1_team_3_extra_credit: JSON.stringify(0),
    session_1_question_2_score: JSON.stringify(10),
    session_1_question_2_block: JSON.stringify(1),
    session_1_question_2_ignore: JSON.stringify('false'),
    session_1_question_2_team_1_score: JSON.stringify(6),
    session_1_question_2_team_1_extra_credit: JSON.stringify(0),
    session_1_question_2_team_2_score: JSON.stringify(8),
    session_1_question_2_team_2_extra_credit: JSON.stringify(2),
    session_1_question_2_team_3_score: JSON.stringify(5),
    session_1_question_2_team_3_extra_credit: JSON.stringify(0),
  };
}

function captureDownloads(context) {
  const downloads = [];
  context.downloadBlob = (content, filename, contentType) => {
    downloads.push({ content, filename, contentType });
  };
  return downloads;
}

test('export score by team downloads the expected CSV', () => {
  const { context } = loadApp(buildExportSeed());
  const downloads = captureDownloads(context);

  context.local_data_update({ id: 'export_team' });

  assert.equal(downloads.length, 1);
  const { content, filename, contentType } = downloads[0];
  assert.equal(filename, 'team_data.csv');
  assert.equal(contentType, 'text/csv;charset=utf-8;');
  assert.ok(
    content.includes(
      '"Team Name","Percent","Score","Placement","Earned Points","Total Points","Total Points (Rounded)","Percent (Rounded)","Score (Rounded)","Placement (Rounded)"'
    )
  );
  assert.ok(
    content.includes(
      '"Alpha","80.00%","16/20","Second Place","16","20","18","88.89%","16/18","Second Place"'
    )
  );
  assert.ok(
    content.includes(
      '"Beta","100.00%","20/20","First Place","20","20","18","111.11%","20/18","First Place"'
    )
  );
  assert.ok(
    content.includes(
      '"Gamma","60.00%","12/20","Third Place","12","20","18","66.67%","12/18","Third Place"'
    )
  );
});

test('export score by block/group downloads the expected CSV', () => {
  const { context } = loadApp(buildExportSeed());
  const downloads = captureDownloads(context);

  context.local_data_update({ id: 'export_block' });

  assert.equal(downloads.length, 1);
  const { content, filename, contentType } = downloads[0];
  assert.equal(filename, 'block_data.csv');
  assert.equal(contentType, 'text/csv;charset=utf-8;');
  assert.ok(
    content.includes('"Block/Group Name","Percent","Score","Earned Points","Total Points"')
  );
  assert.ok(content.includes('"No Block/Group","90.00%","27/30","27","30"'));
  assert.ok(content.includes('"Block A","70.00%","21/30","21","30"'));
});

test('export score by team and block/group downloads the expected CSV', () => {
  const { context } = loadApp(buildExportSeed());
  const downloads = captureDownloads(context);

  context.local_data_update({ id: 'export_team_and_block' });

  assert.equal(downloads.length, 1);
  const { content, filename, contentType } = downloads[0];
  assert.equal(filename, 'team_and_block_data.csv');
  assert.equal(contentType, 'text/csv;charset=utf-8;');
  assert.ok(
    content.includes('"Team Name","Block/Group Name","Percent","Score","Earned Points","Total Points"')
  );
  assert.ok(content.includes('"Alpha","No Block/Group","100.00%","10/10","10","10"'));
  assert.ok(content.includes('"Alpha","Block A","60.00%","6/10","6","10"'));
  assert.ok(content.includes('"Beta","Block A","100.00%","10/10","10","10"'));
  assert.ok(content.includes('"Gamma","Block A","50.00%","5/10","5","10"'));
});

test('export question log downloads the expected CSV', () => {
  const { context } = loadApp(buildExportSeed());
  const downloads = captureDownloads(context);

  context.local_data_update({ id: 'export_question_log' });

  assert.equal(downloads.length, 1);
  const { content, filename, contentType } = downloads[0];
  assert.equal(filename, 'question_log_data.csv');
  assert.equal(contentType, 'text/csv;charset=utf-8;');
  assert.ok(
    content.includes('"Question","Block/Group","Possible Points","Ignore Question","Alpha","Beta","Gamma"')
  );
  assert.ok(
    content.includes('"Q1","No Block/Group","10","false","9 + 1","10","7"')
  );
  assert.ok(content.includes('"Q2","Block A","10","false","6","8 + 2","5"'));
});
