/**
 * @fileoverview Integration tests for embedding postMessage roundtrips.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadApp } = require('../helpers/dom');
const { createYjsDoc } = require('../helpers/yjs-seeds');

function createSessionConfig(name = 'Embedded Integration') {
  return {
    name,
    teams: ['Alpha', 'Beta'],
    blocks: ['No Block', 'Round 1'],
    questions: [
      {
        name: 'Question 1',
        score: 5,
        block: 0,
        teamScores: [{ score: 0 }, { score: 0 }],
      },
      {
        name: 'Question 2',
        score: 4,
        block: 1,
        teamScores: [{ score: 1 }, { score: 2 }],
      },
    ],
    currentQuestion: 1,
  };
}

function loadEmbeddingApp(sessionConfig = createSessionConfig()) {
  const { context } = loadApp(createYjsDoc({
    currentSession: 1,
    sessions: [sessionConfig],
  }));
  context.window.location = {
    origin: 'https://scorekeeper.example',
    search: '?embedded=1',
  };
  context.EmbeddingAPI.resetForTests();
  context.EmbeddingCommands.resetForTests();
  context.EmbeddingEvents.resetForTests();
  context.EmbeddingAPI.configure({
    enabled: true,
    allowedOrigins: ['https://host.example'],
    rateLimit: { enabled: false },
  });
  context.EmbeddingCommands.init();
  context.EmbeddingEvents.init();
  context.EmbeddingAPI.init();
  return context;
}

function createSource() {
  return {
    messages: [],
    postMessage(message, targetOrigin) {
      this.messages.push({ message, targetOrigin });
    },
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

async function sendCommand(context, source, command, payload = {}) {
  const id = `${command}-${source.messages.length + 1}`;
  await context.EmbeddingAPI.handleMessage({
    origin: 'https://host.example',
    source,
    data: {
      type: 'embedding:command',
      id,
      command,
      payload,
    },
  });
  const response = source.messages.find((entry) => entry.message.id === id);
  assert.ok(response, `missing response for ${command}`);
  return plain(response.message);
}

function eventMessages(source, eventName) {
  return source.messages
    .filter((entry) => entry.message.type === 'embedding:event' && entry.message.event === eventName)
    .map((entry) => plain(entry.message.data));
}

test('postMessage command roundtrip returns formatted command response', async () => {
  const context = loadEmbeddingApp();
  const source = createSource();

  const response = await sendCommand(context, source, 'score:set', {
    teamIndex: 1,
    score: 4,
  });

  assert.equal(response.type, 'embedding:response');
  assert.equal(response.command, 'score:set');
  assert.equal(response.ok, true);
  assert.equal(response.result.score, 4);
  assert.equal(response.targetOrigin, undefined);
});

test('postMessage subscribe roundtrip delivers subsequent events', async () => {
  const context = loadEmbeddingApp();
  const source = createSource();

  context.EmbeddingAPI.handleMessage({
    origin: 'https://host.example',
    source,
    data: {
      type: 'embedding:subscribe',
      id: 'sub-1',
      events: ['question:scored'],
    },
  });

  await sendCommand(context, source, 'score:set', {
    teamIndex: 2,
    score: 3,
  });

  const scored = eventMessages(source, 'question:scored');
  assert.equal(scored.length >= 1, true);
  assert.equal(scored.at(-1).teamIndex, 2);
  assert.equal(scored.at(-1).score, 3);
});

test('postMessage multi-command sequence mutates question and score state', async () => {
  const context = loadEmbeddingApp();
  const source = createSource();

  const created = await sendCommand(context, source, 'question:create', {
    name: 'Sequence Question',
    maxPoints: 6,
  });
  assert.equal(created.result.name, 'Sequence Question');

  const score = await sendCommand(context, source, 'score:set', {
    teamIndex: 1,
    score: 5,
  });
  assert.equal(score.result.questionId, created.result.id);

  const total = await sendCommand(context, source, 'score:getTotalPoints', {
    questionId: created.result.id,
  });
  assert.equal(total.result.total, 5);
  assert.equal(total.result.teams[0].score, 5);
});

test('postMessage import accepts Yjs binary exported by another embedded app', async () => {
  const questions = [];
  for (let i = 1; i <= 60; i++) {
    questions.push({
      name: `Question ${i}`,
      score: (i % 5) + 1,
      block: i % 2,
      teamScores: [{ score: i % 3 }, { score: i % 4 }],
    });
  }

  const exportingContext = loadEmbeddingApp({
    ...createSessionConfig('Export Source'),
    questions,
  });
  const importingContext = loadEmbeddingApp(createSessionConfig('Import Target'));
  const exportSource = createSource();
  const importSource = createSource();

  const exported = await sendCommand(exportingContext, exportSource, 'session:export');
  assert.equal(exported.result.format, 'yjs-update');
  assert.equal(exported.result.bytes.length > 0, true);

  const imported = await sendCommand(importingContext, importSource, 'session:import', {
    bytes: exported.result.bytes,
  });

  assert.equal(imported.ok, true);
  assert.equal(imported.result.import.success, true);
  assert.equal(imported.result.import.importedCount >= 1, true);
});

test('postMessage state preview reports conflicts before full import', async () => {
  const exportingContext = loadEmbeddingApp(createSessionConfig('Shared Name'));
  const importingContext = loadEmbeddingApp(createSessionConfig('Shared Name'));
  const exportSource = createSource();
  const importSource = createSource();

  const exported = await sendCommand(exportingContext, exportSource, 'state:export');
  assert.equal(exported.result.format, 'pbe-multi-doc');
  assert.equal(exported.result.bytes.length > 0, true);

  const preview = await sendCommand(importingContext, importSource, 'state:previewImport', {
    bytes: exported.result.bytes,
  });

  assert.equal(preview.ok, true);
  assert.equal(preview.result.format, 'binary-full');
  assert.equal(preview.result.sessions.length, 1);
  assert.equal(preview.result.conflicts.length >= 1, true);

  const imported = await sendCommand(importingContext, importSource, 'state:import', {
    bytes: exported.result.bytes,
  });
  assert.equal(imported.ok, true);
  assert.equal(imported.result.import.success, true);
});
