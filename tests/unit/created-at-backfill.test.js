const test = require('node:test');
const assert = require('node:assert');
const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

function buildSeed(sessionCount) {
  const sessions = [];
  for (let i = 0; i < sessionCount; i++) {
    sessions.push({
      name: `Seed ${i + 1}`,
      teams: ['Team 1'],
      blocks: ['No Block'],
      questions: [
        {
          name: 'Q1',
          score: 1,
          block: 0,
          ignore: false,
          teamScores: [{ score: 0, extraCredit: 0 }]
        }
      ]
    });
  }
  return createYjsDoc({ currentSession: 1, sessions });
}

function getSession(context, index) {
  const sessionId = context.get_session_order()[index];
  const sessionDoc = context.getSessionDoc(sessionId);
  return sessionDoc.getMap('session');
}

test('backfillMissingSessionCreatedAtFromName parses legacy "Session {date}" names', async () => {
  const { context } = loadApp(buildSeed(1));
  const session = getSession(context, 0);
  const dateText = '2/21/2025, 3:04:05 PM';
  const expected = Date.parse(dateText);

  assert.ok(Number.isFinite(expected), 'Test date should be parseable');

  session.set('name', `Session ${dateText}`);
  session.delete('createdAt');

  const result = await context.backfillMissingSessionCreatedAtFromName();
  assert.strictEqual(result.updatedCount, 1);
  assert.strictEqual(session.get('createdAt'), expected);
});

test('backfillMissingSessionCreatedAtFromName parses translated prefix names', async () => {
  const { context } = loadApp(buildSeed(1));
  const session = getSession(context, 0);
  const dateText = '2/20/2025, 10:11:12 AM';
  const expected = Date.parse(dateText);

  assert.ok(Number.isFinite(expected), 'Test date should be parseable');

  session.set('name', `Sesión ${dateText}`);
  session.delete('createdAt');

  const result = await context.backfillMissingSessionCreatedAtFromName();
  assert.strictEqual(result.updatedCount, 1);
  assert.strictEqual(session.get('createdAt'), expected);
});

test('backfillMissingSessionCreatedAtFromName runs once using migration flag', async () => {
  const { context } = loadApp(buildSeed(2));
  const sessionA = getSession(context, 0);
  const sessionB = getSession(context, 1);

  sessionA.set('name', 'Session 2/19/2025, 9:08:07 AM');
  sessionA.delete('createdAt');

  const firstRun = await context.backfillMissingSessionCreatedAtFromName();
  assert.strictEqual(firstRun.updatedCount, 1);

  sessionB.set('name', 'Session 2/18/2025, 8:07:06 AM');
  sessionB.delete('createdAt');

  const secondRun = await context.backfillMissingSessionCreatedAtFromName();
  assert.strictEqual(secondRun.skipped, true);
  assert.strictEqual(sessionB.get('createdAt'), undefined);
});
