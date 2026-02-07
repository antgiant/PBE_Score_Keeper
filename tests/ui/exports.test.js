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
      blocks: ['No Block', 'Block A'],
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

function buildUnicodeExportSeed() {
  return createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Unicode Session',
      maxPointsPerQuestion: 10,
      rounding: false,
      teams: ['Zoë 🧪', 'Niño 🚀'],
      blocks: ['No Block', 'Blök 🧊'],
      questions: [
        {
          name: 'Q✨',
          score: 10,
          block: 1,
          ignore: false,
          teamScores: [
            { score: 5, extraCredit: 0 },
            { score: 10, extraCredit: 1 }
          ]
        }
      ],
      currentQuestion: 1
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

function getCsvLines(content) {
  return content.split('\r\n');
}

test('export score by team downloads the expected CSV', () => {
  const { context } = loadApp(buildExportSeed());
  const downloads = captureDownloads(context);

  context.local_data_update({ id: 'export_team' });

  assert.equal(downloads.length, 1);
  const { content, filename, contentType } = downloads[0];
  assert.equal(filename, 'team_data.csv');
  assert.equal(contentType, 'text/csv;charset=utf-8;');
  const lines = getCsvLines(content);
  assert.equal(lines.length, 4, 'Expected header + 3 team rows');
  assert.equal(
    lines[0],
    '"Team Name","Percent","Score","Placement","Earned Points","Total Points","Total Points (Rounded)","Percent (Rounded)","Score (Rounded)","Placement (Rounded)"'
  );
  assert.equal(
    lines[1],
    '"Alpha","80.00%","16/20","Second Place","16","20","18","88.89%","16/18","Second Place"'
  );
  assert.equal(
    lines[2],
    '"Beta","100.00%","20/20","First Place","20","20","18","111.11%","20/18","First Place"'
  );
  assert.equal(
    lines[3],
    '"Gamma","60.00%","12/20","Third Place","12","20","18","66.67%","12/18","Third Place"'
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
  const lines = getCsvLines(content);
  assert.equal(lines.length, 3, 'Expected header + 2 block rows');
  assert.equal(lines[0], '"Block Name","Percent","Score","Earned Points","Total Points"');
  assert.equal(lines[1], '"No Block","90.00%","27/30","27","30"');
  assert.equal(lines[2], '"Block A","70.00%","21/30","21","30"');
});

test('export score by block/group excludes empty blocks', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 10,
      rounding: false,
      teams: ['Alpha', 'Beta'],
      blocks: ['No Block', 'Block A', 'Empty Block'],
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
  // Should have header + 2 data rows (No Block and Block A)
  const lines = getCsvLines(content);
  assert.equal(lines.length, 3, 'Should have 1 header + 2 data rows (no empty blocks)');
  // Should NOT contain "Empty Block"
  assert.ok(!content.includes('Empty Block'), 'Export should not contain empty blocks');
  // Should contain the blocks with data
  assert.ok(content.includes('"No Block"'));
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
  const lines = getCsvLines(content);
  assert.equal(lines.length, 7, 'Expected header + 6 team/block rows');
  assert.equal(lines[0], '"Team Name","Block Name","Percent","Score","Earned Points","Total Points"');
  assert.equal(lines[1], '"Alpha","No Block","100.00%","10/10","10","10"');
  assert.equal(lines[2], '"Alpha","Block A","60.00%","6/10","6","10"');
  assert.equal(lines[3], '"Beta","No Block","100.00%","10/10","10","10"');
  assert.equal(lines[4], '"Beta","Block A","100.00%","10/10","10","10"');
  assert.equal(lines[5], '"Gamma","No Block","70.00%","7/10","7","10"');
  assert.equal(lines[6], '"Gamma","Block A","50.00%","5/10","5","10"');
});

test('export score by team and block/group excludes empty blocks', () => {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [{
      name: 'Session 1',
      maxPointsPerQuestion: 10,
      rounding: false,
      teams: ['Alpha', 'Beta'],
      blocks: ['No Block', 'Block A', 'Empty Block'],
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
  const lines = getCsvLines(content);
  assert.equal(lines.length, 5, 'Should have 1 header + 4 data rows (no empty blocks)');
  // Should NOT contain "Empty Block"
  assert.ok(!content.includes('Empty Block'), 'Export should not contain empty blocks');
  // Should contain the blocks with data
  assert.ok(content.includes('"No Block"'));
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
  const lines = getCsvLines(content);
  assert.equal(lines.length, 3, 'Expected header + 2 question rows');
  assert.equal(
    lines[0],
    '"Question","Block","Possible Points","Ignore Question","Alpha","Beta","Gamma"'
  );
  assert.equal(lines[1], '"Q1","No Block","10","false","9 + 1","10","7"');
  assert.equal(lines[2], '"Q2","Block A","10","false","6","8 + 2","5"');
});

test('export CSV preserves unicode and emojis', () => {
  const { context } = loadApp(buildUnicodeExportSeed());
  const downloads = captureDownloads(context);

  context.local_data_update({ id: 'export_team' });
  context.local_data_update({ id: 'export_question_log' });

  assert.equal(downloads.length, 2);

  const teamExport = downloads.find((item) => item.filename === 'team_data.csv');
  const questionExport = downloads.find((item) => item.filename === 'question_log_data.csv');
  assert.ok(teamExport, 'Expected team export');
  assert.ok(questionExport, 'Expected question log export');

  const teamLines = getCsvLines(teamExport.content);
  assert.equal(teamLines.length, 3, 'Expected header + 2 team rows');
  assert.equal(
    teamLines[1],
    '"Zoë 🧪","50.00%","5/10","Third Place","5","10","10","50.00%","5/10","Third Place"'
  );
  assert.equal(
    teamLines[2],
    '"Niño 🚀","110.00%","11/10","First Place","11","10","10","110.00%","11/10","First Place"'
  );

  const questionLines = getCsvLines(questionExport.content);
  assert.equal(questionLines.length, 2, 'Expected header + 1 question row');
  assert.equal(
    questionLines[0],
    '"Question","Block","Possible Points","Ignore Question","Zoë 🧪","Niño 🚀"'
  );
  assert.equal(
    questionLines[1],
    '"Q✨","Blök 🧊","10","false","5","10 + 1"'
  );
});
