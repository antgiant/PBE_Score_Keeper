/**
 * Unit tests for import/export compatibility across formats.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

function ensureBase64Helpers(context) {
  if (!context.atob) {
    context.atob = (base64) => Buffer.from(base64, 'base64').toString('binary');
  }
  if (!context.btoa) {
    context.btoa = (binary) => Buffer.from(binary, 'binary').toString('base64');
  }
}

function buildV5SessionDoc(context, sessionId, name) {
  const sessionDoc = new context.Y.Doc();
  const session = sessionDoc.getMap('session');

  sessionDoc.transact(() => {
    session.set('id', sessionId);
    session.set('name', name);
    session.set('dataVersion', '5.0');

    const config = new context.Y.Map();
    config.set('maxPointsPerQuestion', 12);
    config.set('rounding', false);
    session.set('config', config);

    session.set('teamsById', new context.Y.Map());
    session.set('teamOrder', new context.Y.Array());
    session.set('blocksById', new context.Y.Map());
    session.set('blockOrder', new context.Y.Array());
    session.set('questionsById', new context.Y.Map());
    session.set('questionOrder', new context.Y.Array());
    session.set('nextQuestionNumber', 1);
  });

  return sessionDoc;
}

test('importSessionData imports binary single session updates', async () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [{ name: 'Base', teams: [], blocks: [], questions: [] }] }));

  const sessionDoc = buildV5SessionDoc(context, 'binary-session-1', 'Binary Import');
  const update = context.Y.encodeStateAsUpdate(sessionDoc);

  const result = await context.importSessionData(update);
  assert.equal(result.success, true);
  assert.equal(result.importedCount, 1);

  const sessions = context.getAllSessions();
  assert.ok(sessions.some((session) => session.name === 'Binary Import'));
});

test('importSessionData imports binary full container', async () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [{ name: 'Base', teams: [], blocks: [], questions: [] }] }));

  ensureBase64Helpers(context);

  const sessionId = 'binary-full-1';
  const sessionDoc = buildV5SessionDoc(context, sessionId, 'Binary Full Import');
  const sessionUpdate = context.Y.encodeStateAsUpdate(sessionDoc);
  const globalUpdate = context.Y.encodeStateAsUpdate(new context.Y.Doc());

  const container = {
    format: 'pbe-multi-doc',
    global: Buffer.from(globalUpdate).toString('base64'),
    sessions: {
      [sessionId]: Buffer.from(sessionUpdate).toString('base64')
    }
  };

  const result = await context.importSessionData(container);
  assert.equal(result.success, true);
  assert.equal(result.importedCount, 1);

  const sessions = context.getAllSessions();
  assert.ok(sessions.some((session) => session.name === 'Binary Full Import'));
});

test('importSessionData imports v4 JSON format', async () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [{ name: 'Base', teams: [], blocks: [], questions: [] }] }));

  const data = {
    dataVersion: '4.0',
    currentSession: 1,
    sessions: [
      null,
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'V4 Import',
        config: { maxPointsPerQuestion: 10, rounding: false },
        teamsById: { 't-1': { name: 'Team A' } },
        teamOrder: ['t-1'],
        blocksById: { 'b-1': { name: 'No Block/Group', isDefault: true } },
        blockOrder: ['b-1'],
        questionsById: {
          'q-old': {
            name: 'Question 1',
            score: 5,
            blockId: 'b-1',
            ignore: false,
            scores: { 't-1': { score: 3, extraCredit: 1 } }
          }
        },
        questionOrder: ['q-old']
      }
    ]
  };

  const result = await context.importSessionData(data);
  assert.equal(result.success, true);
  assert.equal(result.importedCount, 1);

  const sessions = context.getAllSessions();
  assert.ok(sessions.some((session) => session.name === 'V4 Import'));
});

test('importSessionData imports v3 and v2 JSON formats', async () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [{ name: 'Base', teams: [], blocks: [], questions: [] }] }));

  for (const version of [3.0, 2.0]) {
    const baseSession = {
      id: version === 3.0
        ? '22222222-2222-4222-8222-222222222222'
        : '33333333-3333-4333-8333-333333333333',
      name: version === 3.0 ? 'Legacy Import v3' : 'Legacy Import v2',
      config: { maxPointsPerQuestion: 8, rounding: true },
      teams: [null, { name: 'Team A' }],
      blocks: [{ name: 'No Block/Group' }],
      questions: [
        null,
        {
          name: 'Question 1',
          score: 4,
          block: 0,
          ignore: false,
          teams: [null, { score: 2, extraCredit: 0 }]
        }
      ]
    };

    const data = {
      dataVersion: version,
      currentSession: 1,
      sessions: [null, baseSession]
    };

    const result = await context.importSessionData(data);
    assert.equal(result.success, true);
    assert.equal(result.importedCount, 1);
  }

  const sessions = context.getAllSessions();
  assert.ok(sessions.some((session) => session.name === 'Legacy Import v3'));
  assert.ok(sessions.some((session) => session.name === 'Legacy Import v2'));
});

test('importSessionData imports legacy flat localStorage format', async () => {
  const { context } = loadApp(createYjsDoc({ currentSession: 1, sessions: [{ name: 'Legacy Source', teams: ['Team A'], blocks: ['No Block/Group'], questions: [] }] }));

  const legacyData = {
    data_version: JSON.stringify(1.5),
    current_session: JSON.stringify(1),
    session_names: JSON.stringify(['', 'Legacy Flat Import']),
    session_1_max_points_per_question: JSON.stringify(10),
    session_1_rounding: JSON.stringify(false),
    session_1_team_names: JSON.stringify(['', 'Team A']),
    session_1_block_names: JSON.stringify(['No Block/Group']),
    session_1_question_names: JSON.stringify(['', 'Question 1']),
    session_1_question_1_score: JSON.stringify(4),
    session_1_question_1_block: JSON.stringify(0),
    session_1_question_1_ignore: JSON.stringify(false),
    session_1_question_1_team_1_score: JSON.stringify(3),
    session_1_question_1_team_1_extra_credit: JSON.stringify(1),
    session_1_current_question: JSON.stringify(1)
  };
  const result = await context.importSessionData(legacyData);

  assert.equal(result.success, true);
  assert.equal(result.importedCount, 1);

  const sessions = context.getAllSessions();
  assert.ok(sessions.some((session) => session.name === 'Legacy Flat Import'));
});
