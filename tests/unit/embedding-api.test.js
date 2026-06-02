/**
 * @fileoverview Unit tests for the core iframe embedding API.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const globalsCode = fs.readFileSync(
  path.join(__dirname, '../../scripts/app-globals.js'),
  'utf8'
);
const embeddingCode = fs.readFileSync(
  path.join(__dirname, '../../scripts/app-embedding-api.js'),
  'utf8'
);

function createContext(options = {}) {
  const parentMessages = [];
  const rootAttrs = {};
  const bodyClasses = new Set();

  const parentWindow = {
    postMessage(message, targetOrigin) {
      parentMessages.push({ message, targetOrigin });
    },
  };

  const windowStub = {
    location: {
      href: options.href || 'https://app.example.test/?embedded=1',
      search: options.search || '?embedded=1',
      origin: options.origin || 'https://app.example.test',
    },
    parent: parentWindow,
    addEventListener(event, handler) {
      this.listeners[event] = handler;
    },
    listeners: {},
  };

  const documentStub = {
    documentElement: {
      setAttribute(name, value) {
        rootAttrs[name] = value;
      },
      getAttribute(name) {
        return rootAttrs[name] || null;
      },
    },
    body: {
      classList: {
        add(className) {
          bodyClasses.add(className);
        },
        contains(className) {
          return bodyClasses.has(className);
        },
      },
    },
    createTextNode(text) {
      return { nodeValue: text };
    },
    createElement() {
      return {
        _child: null,
        appendChild(node) {
          this._child = node;
        },
        get innerHTML() {
          return this._child ? String(this._child.nodeValue ?? '') : '';
        },
      };
    },
    querySelector() {
      return null;
    },
  };

  const context = {
    console: {
      log() {},
      warn() {},
      error() {},
    },
    window: windowStub,
    document: documentStub,
    URL,
    URLSearchParams,
    Promise,
    Error,
    APP_VERSION: '9.9.9-test',
  };

  vm.createContext(context);
  vm.runInContext(globalsCode, context);
  vm.runInContext(embeddingCode, context);

  return {
    context,
    parentMessages,
    rootAttrs,
    bodyClasses,
    windowStub,
  };
}

function createSource() {
  const messages = [];
  return {
    messages,
    postMessage(message, targetOrigin) {
      messages.push({ message, targetOrigin });
    },
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('detectEmbeddedMode enables embedded styling from ?embedded=1', () => {
  const { context, rootAttrs, bodyClasses } = createContext();

  assert.equal(context.EmbeddingAPI.detectEmbeddedMode(), true);
  assert.equal(context.EmbeddingAPI.shouldInitialize(), true);

  context.EmbeddingAPI.applyEmbeddedMode();

  assert.equal(rootAttrs['data-embedded'], 'true');
  assert.equal(bodyClasses.has('pbe-embedded'), true);
  assert.equal(context.EMBEDDING_CONFIG.enabled, true);
});

test('init posts ready message and registers message listener', () => {
  const { context, parentMessages, windowStub } = createContext();

  const initialized = context.EmbeddingAPI.init();

  assert.equal(initialized, true);
  assert.equal(typeof windowStub.listeners.message, 'function');
  assert.equal(parentMessages.length, 1);
  assert.equal(parentMessages[0].targetOrigin, '*');
  assert.deepEqual(plain(parentMessages[0].message), {
    type: 'embedding:ready',
    apiVersion: 1,
    appVersion: '9.9.9-test',
  });
});

test('hello handshake responds to same-origin host', () => {
  const { context } = createContext();
  const source = createSource();
  context.EmbeddingAPI.init();

  context.EmbeddingAPI.handleMessage({
    origin: 'https://app.example.test',
    source,
    data: {
      type: 'embedding:hello',
      id: 'hello-1',
    },
  });

  assert.equal(source.messages.length, 1);
  assert.equal(source.messages[0].targetOrigin, 'https://app.example.test');
  assert.equal(source.messages[0].message.type, 'embedding:response');
  assert.equal(source.messages[0].message.ok, true);
  assert.equal(source.messages[0].message.id, 'hello-1');
  assert.equal(source.messages[0].message.result.embedded, true);
});

test('cross-origin hosts are permitted by default and lock the active origin', () => {
  const { context } = createContext();
  const source = createSource();
  context.EmbeddingAPI.init();

  const handled = context.EmbeddingAPI.handleMessage({
    origin: 'https://host.example.test',
    source,
    data: {
      type: 'embedding:hello',
      id: 'host-1',
    },
  });

  assert.equal(handled, true);
  assert.equal(source.messages.length, 1);
  assert.equal(source.messages[0].message.ok, true);
  assert.equal(context.EMBEDDING_CONFIG.hostOrigin, 'https://host.example.test');
});

test('explicit allowedOrigins still block unlisted origins', () => {
  const { context } = createContext();
  const source = createSource();
  context.EMBEDDING_CONFIG.allowedOrigins = ['https://trusted.example.test'];
  context.EmbeddingAPI.init();

  const handled = context.EmbeddingAPI.handleMessage({
    origin: 'https://blocked.example.test',
    source,
    data: {
      type: 'embedding:hello',
      id: 'blocked-1',
    },
  });

  assert.equal(handled, null);
  assert.equal(source.messages.length, 0);
});

test('allowedOrigins permits cross-origin command dispatch', async () => {
  const { context } = createContext();
  const source = createSource();
  context.EMBEDDING_CONFIG.allowedOrigins = ['https://host.example.test'];
  context.EmbeddingAPI.init();
  context.EmbeddingAPI.registerCommand('test:echo', (payload, commandContext) => ({
    payload,
    origin: commandContext.origin,
  }));

  await context.EmbeddingAPI.handleMessage({
    origin: 'https://host.example.test',
    source,
    data: {
      type: 'embedding:command',
      id: 'cmd-1',
      command: 'test:echo',
      payload: { value: 42 },
    },
  });

  assert.equal(source.messages.length, 1);
  assert.deepEqual(plain(source.messages[0].message), {
    type: 'embedding:response',
    id: 'cmd-1',
    command: 'test:echo',
    ok: true,
    result: {
      payload: { value: 42 },
      origin: 'https://host.example.test',
    },
  });
});

test('allowedHosts permits normalized cross-origin hosts', () => {
  const { context } = createContext();
  const source = createSource();
  context.EMBEDDING_CONFIG.allowedHosts = ['host.example.test'];
  context.EmbeddingAPI.init();

  context.EmbeddingAPI.handleMessage({
    origin: 'https://host.example.test',
    source,
    data: {
      type: 'embedding:hello',
      id: 'host-1',
    },
  });

  assert.equal(source.messages.length, 1);
  assert.equal(source.messages[0].message.ok, true);
  assert.equal(context.EMBEDDING_CONFIG.hostOrigin, 'https://host.example.test');
});

test('oversized messages receive a structured payload error', async () => {
  const { context } = createContext();
  const source = createSource();
  context.EMBEDDING_CONFIG.maxPayloadBytes = 80;
  context.EmbeddingAPI.init();
  context.EmbeddingAPI.registerCommand('test:echo', (payload) => payload);

  await context.EmbeddingAPI.handleMessage({
    origin: 'https://app.example.test',
    source,
    data: {
      type: 'embedding:command',
      id: 'large-1',
      command: 'test:echo',
      payload: { value: 'x'.repeat(200) },
    },
  });

  assert.equal(source.messages.length, 1);
  assert.equal(source.messages[0].message.ok, false);
  assert.equal(source.messages[0].message.error.code, 'payload_too_large');
});

test('rate limiting blocks excess command messages', async () => {
  const { context } = createContext();
  const source = createSource();
  context.EMBEDDING_CONFIG.rateLimit = {
    enabled: true,
    windowMs: 1000,
    maxMessages: 10,
    maxCommands: 1,
  };
  context.EmbeddingAPI.init();
  context.EmbeddingAPI.registerCommand('test:echo', (payload) => payload);

  await context.EmbeddingAPI.handleMessage({
    origin: 'https://app.example.test',
    source,
    data: {
      type: 'embedding:command',
      id: 'rate-1',
      command: 'test:echo',
      payload: { value: 1 },
    },
  });

  await context.EmbeddingAPI.handleMessage({
    origin: 'https://app.example.test',
    source,
    data: {
      type: 'embedding:command',
      id: 'rate-2',
      command: 'test:echo',
      payload: { value: 2 },
    },
  });

  assert.equal(source.messages.length, 2);
  assert.equal(source.messages[0].message.ok, true);
  assert.equal(source.messages[1].message.ok, false);
  assert.equal(source.messages[1].message.error.code, 'rate_limited');
});

test('unknown commands return formatted errors', async () => {
  const { context } = createContext();
  const source = createSource();
  context.EmbeddingAPI.init();

  await context.EmbeddingAPI.handleMessage({
    origin: 'https://app.example.test',
    source,
    data: {
      type: 'embedding:command',
      id: 'cmd-missing',
      command: 'missing:command',
      payload: {},
    },
  });

  assert.equal(source.messages.length, 1);
  assert.equal(source.messages[0].message.ok, false);
  assert.equal(source.messages[0].message.error.code, 'unknown_command');
});

test('subscribed clients receive emitted events', () => {
  const { context } = createContext();
  const source = createSource();
  context.EmbeddingAPI.init();

  context.EmbeddingAPI.handleMessage({
    origin: 'https://app.example.test',
    source,
    data: {
      type: 'embedding:subscribe',
      id: 'sub-1',
      events: ['session:created'],
    },
  });

  const delivered = context.EmbeddingAPI.emit('session:created', { id: 's-1' });

  assert.equal(delivered, 1);
  assert.equal(source.messages.length, 2);
  assert.equal(source.messages[0].message.command, 'embedding:subscribe');
  assert.deepEqual(plain(source.messages[1].message), {
    type: 'embedding:event',
    event: 'session:created',
    data: { id: 's-1' },
    apiVersion: 1,
  });
});

test('unsubscribe removes event delivery', () => {
  const { context } = createContext();
  const source = createSource();
  context.EmbeddingAPI.init();

  context.EmbeddingAPI.handleMessage({
    origin: 'https://app.example.test',
    source,
    data: {
      type: 'embedding:subscribe',
      events: ['session:created'],
    },
  });
  context.EmbeddingAPI.handleMessage({
    origin: 'https://app.example.test',
    source,
    data: {
      type: 'embedding:unsubscribe',
      events: ['session:created'],
    },
  });

  const delivered = context.EmbeddingAPI.emit('session:created', { id: 's-1' });

  assert.equal(delivered, 0);
});
