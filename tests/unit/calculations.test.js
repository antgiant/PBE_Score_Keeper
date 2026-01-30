/**
 * Calculation Regression Tests
 * 
 * These tests validate that score calculations remain correct across code changes.
 * They use fixtures from tests/fixtures/calculations/ to verify expected outputs.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Load a calculation fixture file
 * @param {string} name - Fixture filename without extension
 * @returns {Object} Parsed fixture data
 */
function loadFixture(name) {
  const fixturePath = path.join(__dirname, '../fixtures/calculations', `${name}.json`);
  const content = fs.readFileSync(fixturePath, 'utf8');
  return JSON.parse(content);
}

/**
 * Build a Yjs session config from fixture input
 * @param {Object} input - Fixture input data
 * @returns {Object} Session config for createYjsDoc
 */
function buildSessionFromFixture(input) {
  const questions = input.questions.map((q, index) => {
    // Handle both simple array format and object format for team scores
    const teamScores = q.teamScores.map(ts => {
      if (typeof ts === 'number') {
        return { score: ts, extraCredit: 0 };
      }
      return { score: ts.score || 0, extraCredit: ts.extraCredit || 0 };
    });

    return {
      name: `Q${index + 1}`,
      score: q.score,
      block: q.block,
      ignore: q.ignore,
      teamScores: teamScores
    };
  });

  return {
    name: 'Test Session',
    maxPointsPerQuestion: Math.max(...input.questions.map(q => q.score)),
    rounding: input.rounding || false,
    teams: input.teams,
    blocks: input.blocks,
    questions: questions,
    currentQuestion: questions.length
  };
}

/**
 * Parse percentage string to number
 * @param {string} percentStr - e.g., "85%"
 * @returns {number} e.g., 0.85
 */
function parsePercent(percentStr) {
  if (typeof percentStr === 'number') return percentStr;
  return parseFloat(percentStr.replace('%', '')) / 100;
}

test('standard-scoring: basic percentage calculations', () => {
  const fixture = loadFixture('standard-scoring');
  const sessionConfig = buildSessionFromFixture(fixture.input);

  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [sessionConfig]
  }));

  const summary = context.get_team_score_summary();

  // Verify each team's scores (skip header row)
  fixture.expected.teamScores.forEach((expected, index) => {
    const row = summary[index + 1];
    assert.ok(row, `Row ${index + 1} should exist`);

    // Check team name
    assert.equal(row[0], expected.team, `Team name should match`);

    // Check earned points (column 4)
    assert.equal(row[4], expected.earned, `${expected.team} earned points should be ${expected.earned}`);

    // Check total points (column 5)
    assert.equal(row[5], expected.total, `${expected.team} total points should be ${expected.total}`);

    // Check placement (column 3)
    assert.equal(row[3], expected.placement, `${expected.team} placement should be ${expected.placement}`);
  });
});

test('extra-credit: scores can exceed 100%', () => {
  const fixture = loadFixture('extra-credit');
  const sessionConfig = buildSessionFromFixture(fixture.input);

  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [sessionConfig]
  }));

  const summary = context.get_team_score_summary();

  fixture.expected.teamScores.forEach((expected, index) => {
    const row = summary[index + 1];

    // Check earned points includes extra credit
    assert.equal(row[4], expected.earned, `${expected.team} earned should include extra credit`);

    // Verify percentage can exceed 100%
    if (expected.percent > 1.0) {
      assert.ok(row[4] > row[5], `${expected.team} earned should exceed total when >100%`);
    }
  });
});

test('ignored-questions: ignored questions do not affect totals', () => {
  const fixture = loadFixture('ignored-questions');
  const sessionConfig = buildSessionFromFixture(fixture.input);

  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [sessionConfig]
  }));

  const summary = context.get_team_score_summary();

  fixture.expected.teamScores.forEach((expected, index) => {
    const row = summary[index + 1];

    // Total should be 20, not 30, because Q2 is ignored
    assert.equal(row[5], expected.total, `Total should exclude ignored question`);
    assert.equal(row[4], expected.earned, `Earned should exclude ignored question`);
  });
});

test('rounding-mode: placement based on highest team score', () => {
  const fixture = loadFixture('rounding-mode');
  const sessionConfig = buildSessionFromFixture(fixture.input);

  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [sessionConfig]
  }));

  const summary = context.get_team_score_summary();

  // Check that rounding total (column 6) equals highest team score without EC
  const expectedHighest = fixture.expected.roundingMode.highestTeamScoreWithoutExtraCredit;

  fixture.expected.roundingMode.teamScores.forEach((expected, index) => {
    const row = summary[index + 1];

    // Rounding total should be the highest team score without extra credit
    assert.equal(row[6], expectedHighest, `Rounding total should be ${expectedHighest}`);

    // Rounding placement (column 9)
    assert.equal(row[9], expected.placementRounded, `${expected.team} rounded placement should be ${expected.placementRounded}`);
  });
});

test('block-scoring: blocks have independent totals', () => {
  const fixture = loadFixture('block-scoring');
  const sessionConfig = buildSessionFromFixture(fixture.input);

  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [sessionConfig]
  }));

  const blockSummary = context.get_block_score_summary();

  // Verify block scores (skip header row)
  fixture.expected.blockScores.forEach((expected, index) => {
    const row = blockSummary[index + 1];
    assert.ok(row, `Block row ${index + 1} should exist`);

    // Check block name
    assert.equal(row[0], expected.block, `Block name should match`);

    // Check earned points (column 3)
    assert.equal(row[3], expected.earned, `${expected.block} earned should be ${expected.earned}`);

    // Check total points (column 4)
    assert.equal(row[4], expected.total, `${expected.block} total should be ${expected.total}`);
  });
});

test('block-scoring: team-block combinations are correct', () => {
  const fixture = loadFixture('block-scoring');
  const sessionConfig = buildSessionFromFixture(fixture.input);

  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [sessionConfig]
  }));

  const teamBlockSummary = context.get_team_and_block_score_summary();

  // Verify each team-block combination
  fixture.expected.teamBlockScores.forEach(expected => {
    // Find the row for this team-block combination
    const row = teamBlockSummary.find(r =>
      r[0] === expected.team && r[1] === expected.block
    );

    assert.ok(row, `Should have row for ${expected.team} / ${expected.block}`);
    assert.equal(row[4], expected.earned, `${expected.team}/${expected.block} earned should be ${expected.earned}`);
    assert.equal(row[5], expected.total, `${expected.team}/${expected.block} total should be ${expected.total}`);
  });
});
