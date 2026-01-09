const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

function buildExportSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 10,
      rounding: false,
      teams: ['Alpha', 'Beta', 'Gamma'],
      blocks: ['No Block/Group', 'Block A'],
      questions: [
        {
          name: 'Q1',
          score: 10,
          block: 0,
          ignore: false,
          teamScores: [
            { score: 9, extraCredit: 1 },
            { score: 10, extraCredit: 0 },
            { score: 7, extraCredit: 0 }
          ]
        },
        {
          name: 'Q2',
          score: 10,
          block: 1,
          ignore: false,
          teamScores: [
            { score: 6, extraCredit: 0 },
            { score: 8, extraCredit: 2 },
            { score: 5, extraCredit: 0 }
          ]
        }
      ],
      currentQuestion: 2
    }]
  });
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

test('export score by block/group excludes empty blocks', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 10,
      rounding: false,
      teams: ['Alpha', 'Beta'],
      blocks: ['No Block/Group', 'Block A', 'Empty Block'],
      questions: [
        {
          name: 'Q1',
          score: 10,
          block: 0,
          ignore: false,
          teamScores: [
            { score: 5, extraCredit: 0 },
            { score: 8, extraCredit: 0 }
          ]
        },
        {
          name: 'Q2',
          score: 10,
          block: 1,
          ignore: false,
          teamScores: [
            { score: 7, extraCredit: 0 },
            { score: 9, extraCredit: 0 }
          ]
        }
      ],
      currentQuestion: 2
    }]
  }));
  const downloads = captureDownloads(context);

  context.local_data_update({ id: 'export_block' });

  assert.equal(downloads.length, 1);
  const { content } = downloads[0];
  // Should have header + 2 data rows (No Block/Group and Block A)
  const lines = content.trim().split('\n');
  assert.equal(lines.length, 3, 'Should have 1 header + 2 data rows (no empty blocks)');
  // Should NOT contain "Empty Block"
  assert.ok(!content.includes('Empty Block'), 'Export should not contain empty blocks');
  // Should contain the blocks with data
  assert.ok(content.includes('"No Block/Group"'));
  assert.ok(content.includes('"Block A"'));
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

test('export score by team and block/group excludes empty blocks', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 10,
      rounding: false,
      teams: ['Alpha', 'Beta'],
      blocks: ['No Block/Group', 'Block A', 'Empty Block'],
      questions: [
        {
          name: 'Q1',
          score: 10,
          block: 0,
          ignore: false,
          teamScores: [
            { score: 5, extraCredit: 0 },
            { score: 8, extraCredit: 0 }
          ]
        },
        {
          name: 'Q2',
          score: 10,
          block: 1,
          ignore: false,
          teamScores: [
            { score: 7, extraCredit: 0 },
            { score: 9, extraCredit: 0 }
          ]
        }
      ],
      currentQuestion: 2
    }]
  }));
  const downloads = captureDownloads(context);

  context.local_data_update({ id: 'export_team_and_block' });

  assert.equal(downloads.length, 1);
  const { content } = downloads[0];
  // Should have header + 4 data rows (2 teams x 2 blocks with data = 4)
  const lines = content.trim().split('\n');
  assert.equal(lines.length, 5, 'Should have 1 header + 4 data rows (no empty blocks)');
  // Should NOT contain "Empty Block"
  assert.ok(!content.includes('Empty Block'), 'Export should not contain empty blocks');
  // Should contain the blocks with data
  assert.ok(content.includes('"No Block/Group"'));
  assert.ok(content.includes('"Block A"'));
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
