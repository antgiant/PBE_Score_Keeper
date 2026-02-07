const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { cleanupSyncModule } = require('../helpers/sync-cleanup');

class MockYMap {
  constructor() {
    this.data = new Map();
  }
  get(key) { return this.data.get(key); }
  set(key, value) { this.data.set(key, value); }
  delete(key) { this.data.delete(key); }
  has(key) { return this.data.has(key); }
  forEach(fn) { this.data.forEach((value, key) => fn(value, key)); }
  get size() { return this.data.size; }
}

class MockYDoc {
  constructor() {
    this.maps = new Map();
    this.clientID = 1;
    this.listeners = new Map();
  }
  getMap(name) {
    if (!this.maps.has(name)) {
      this.maps.set(name, new MockYMap());
    }
    return this.maps.get(name);
  }
  transact(fn) { fn(); }
  on(event, fn) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(fn);
  }
  off(event, fn) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(fn);
    }
  }
}

class MockAwareness {
  constructor() {
    this.states = new Map();
    this.clientID = 1;
    this.localState = null;
    this.handlers = new Set();
  }
  getStates() { return this.states; }
  getLocalState() { return this.localState; }
  setLocalState(state) {
    this.localState = state;
    this.states.set(this.clientID, state);
  }
  setLocalStateField(field, value) {
    const state = Object.assign({}, this.localState || {});
    state[field] = value;
    this.setLocalState(state);
  }
  on(event, fn) {
    if (event === 'change') {
      this.handlers.add(fn);
    }
  }
  triggerChange() {
    this.handlers.forEach((fn) => fn());
  }
}

class MockWebrtcProvider {
  constructor(roomName, doc, opts) {
    this.roomName = roomName;
    this.doc = doc;
    this.opts = opts;
    this.awareness = new MockAwareness();
    this.connected = true;
    this.handlers = new Map();
    this.destroyed = false;
  }
  on(event, fn) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event).add(fn);
    if (event === 'status') {
      fn({ status: 'connected' });
    }
    if (event === 'synced') {
      fn({ synced: true });
    }
  }
  destroy() {
    this.destroyed = true;
  }
}

class MockWebsocketProvider {
  constructor(url, room, doc) {
    this.url = url;
    this.room = room;
    this.doc = doc;
    this.wsconnected = true;
    this.handlers = new Map();
  }
  on(event, fn) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event).add(fn);
    if (event === 'status') {
      fn({ status: 'connected' });
    }
  }
  destroy() {}
}

class MockEncryptedWebsocketProvider {
  constructor(url, room, doc, password, opts) {
    this.url = url;
    this.room = room;
    this.doc = doc;
    this.password = password;
    this.opts = opts;
    this.awareness = new MockAwareness();
    this.handlers = new Map();
    this.destroyed = false;
  }
  on(event, fn) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event).add(fn);
    if (event === 'status') {
      fn({ status: 'connected' });
    }
  }
  destroy() {
    this.destroyed = true;
  }
}

function buildSessionDoc(sessionId) {
  const doc = new MockYDoc();
  const session = doc.getMap('session');
  const config = new MockYMap();
  session.set('config', config);
  session.set('id', sessionId);
  session.set('dataVersion', '5.0');
  doc.getMap('meta');
  return doc;
}

function buildGlobalDoc() {
  const meta = new MockYMap();
  return {
    getMap(name) {
      if (name === 'meta') return meta;
      return new MockYMap();
    },
    transact(fn) { fn(); }
  };
}

describe('Sync Flows', () => {
  let syncModule;
  let sessionDocs;
  let activeSessionId;
  let activeSessionDoc;
  let globalDoc;
  let registryDoc;
  let createEmptySessionCalls;

  beforeEach(() => {
    global.localStorage = {
      store: {},
      getItem(key) { return this.store[key] || null; },
      setItem(key, value) { this.store[key] = value; },
      removeItem(key) { delete this.store[key]; },
      clear() { this.store = {}; }
    };

    global.document = {
      getElementById: function() { return null; },
      querySelector: function() { return null; },
      querySelectorAll: function() { return []; },
      createElement: function() { return { setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} }, style: {}, focus() {} }; },
      body: { appendChild: function() {} },
      addEventListener: function() {},
      removeEventListener: function() {},
      visibilityState: 'visible',
      activeElement: null
    };

    global.window = {
      addEventListener: function() {},
      dispatchEvent: function() {}
    };

    global.navigator = {
      clipboard: { writeText: async function() {} }
    };

    global.t = function(key) { return key; };
    global.t_plural = function(key) { return key; };

    global.Y = {
      Map: MockYMap,
      Doc: MockYDoc
    };

    global.WebrtcProvider = MockWebrtcProvider;
    global.WebsocketProvider = MockWebsocketProvider;
    global.EncryptedWebsocketProvider = MockEncryptedWebsocketProvider;

    sessionDocs = new Map();
    activeSessionId = 'session-1';
    activeSessionDoc = buildSessionDoc(activeSessionId);
    sessionDocs.set(activeSessionId, activeSessionDoc);
    createEmptySessionCalls = 0;

    globalDoc = buildGlobalDoc();
    registryDoc = new MockYDoc();

    global.DocManager = {
      activeSessionId: activeSessionId,
      getActiveSessionDoc: function() { return activeSessionDoc; },
      sessionProviders: new Map(),
      sessionDocs: sessionDocs
    };

    global.getGlobalDoc = function() { return globalDoc; };
    global.getActiveSessionDoc = function() { return activeSessionDoc; };
    global.getSessionDoc = function(sessionId) { return sessionDocs.get(sessionId); };
    global.get_current_session_id = function() { return activeSessionId; };
    global.get_current_session = function() { return activeSessionDoc.getMap('session'); };

    global.createEmptySessionForSync = async function() {
      createEmptySessionCalls += 1;
      const newId = `session-${createEmptySessionCalls + 1}`;
      const newDoc = buildSessionDoc(newId);
      sessionDocs.set(newId, newDoc);
      activeSessionId = newId;
      activeSessionDoc = newDoc;
      global.DocManager.activeSessionId = newId;
      return newId;
    };

    global.sync_data_to_display = function() {};
    global.sync_data_to_display_debounced = function() {};
    global.showSyncLoadingState = function() {};
    global.hideSyncLoadingState = function() {};

    delete require.cache[require.resolve('../../scripts/app-sync.js')];
    syncModule = require('../../scripts/app-sync.js');

    syncModule.SyncManager.registryDoc = registryDoc;
    syncModule.SyncManager.registryConnected = true;
    syncModule.SyncManager.registrySynced = true;
  });

  afterEach(() => {
    cleanupSyncModule(syncModule);
  });

  it('creates a sync session and tracks presence', async () => {
    const room = await syncModule.startSync('Alice', null, 'secret', 'create');
    const config = activeSessionDoc.getMap('session').get('config');

    assert.match(room, /^[A-Z0-9]{6}$/);
    assert.strictEqual(syncModule.getSyncState(), 'connected');
    assert.strictEqual(config.get('syncRoom'), room);
    assert.strictEqual(globalDoc.getMap('meta').get('syncDisplayName'), 'Alice');

    const awareness = syncModule.SyncManager.provider.awareness;
    awareness.getStates().set(2, { displayName: 'Peer', color: '#123', dataVersion: '5.0' });
    awareness.triggerChange();

    const peers = syncModule.getSyncPeers();
    assert.strictEqual(peers.length, 1);
    assert.strictEqual(peers[0].displayName, 'Peer');
  });

  it('joins an existing sync session with a new doc', async () => {
    syncModule.registerRoom('ABC123', 'remote-session', true);
    const room = await syncModule.startSync('Bob', 'ABC123', 'secret', 'join');

    assert.strictEqual(room, 'ABC123');
    assert.strictEqual(createEmptySessionCalls, 1);
    assert.strictEqual(activeSessionId, 'session-2');

    const config = activeSessionDoc.getMap('session').get('config');
    assert.strictEqual(config.get('syncRoom'), 'ABC123');
  });

  it('expires old sync rooms', async () => {
    const expired = syncModule.isSyncRoomExpired(Date.now() - (13 * 60 * 60 * 1000));
    const fresh = syncModule.isSyncRoomExpired(Date.now());

    assert.strictEqual(expired, true);
    assert.strictEqual(fresh, false);

    const config = activeSessionDoc.getMap('session').get('config');
    config.set('syncRoom', 'OLD123');
    config.set('syncCreatedAt', Date.now() - (13 * 60 * 60 * 1000));

    global.get_session_order = function() { return [activeSessionId]; };
    global.initSessionDoc = async function(sessionId) { return sessionDocs.get(sessionId); };

    await syncModule.repairSessionSyncRoomsCache();
    assert.strictEqual(config.get('syncRoom'), undefined);
  });

  it('creates and joins large event sync sessions', async () => {
    await syncModule.startWebsocketSync('Cara', 'ABC123', 'pass123', 'create');
    const meta = activeSessionDoc.getMap('meta');

    assert.strictEqual(syncModule.getSyncState(), 'connected');
    assert.strictEqual(syncModule.SyncManager.connectionType, 'websocket');
    assert.strictEqual(meta.get('syncType'), 'websocket');
    assert.strictEqual(meta.get('syncRoomCode'), 'ABC123');
    assert.strictEqual(globalDoc.getMap('meta').get('syncDisplayName'), 'Cara');

    const awareness = syncModule.SyncManager.wsProvider.awareness;
    awareness.getStates().set(2, { displayName: 'Guest', color: '#123', dataVersion: '5.0' });
    awareness.triggerChange();
    assert.strictEqual(syncModule.getSyncPeers().length, 1);

    syncModule.stopSync(false);
    syncModule.SyncManager.registryConnected = true;
    syncModule.SyncManager.registrySynced = true;

    syncModule.registerRoom('L-DEF456', 'remote-session', true);
    await syncModule.startWebsocketSync('Dana', 'DEF456', 'pass123', 'join');

    assert.strictEqual(syncModule.getSyncState(), 'connected');
    assert.strictEqual(syncModule.SyncManager.roomCode, 'DEF456');
  });

  it('expires large event metadata', () => {
    const meta = activeSessionDoc.getMap('meta');
    meta.set('syncType', 'websocket');
    meta.set('syncRoomCode', 'LARGE1');
    meta.set('syncConnectedDate', new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString().split('T')[0]);

    assert.strictEqual(syncModule.isLargeEventSyncExpired(), true);
    syncModule.clearExpiredLargeEventSync();
    assert.strictEqual(meta.get('syncType'), undefined);
  });

  it('disconnects on data version mismatch (webrtc)', async () => {
    await syncModule.startSync('Eli', null, 'secret', 'create');

    const awareness = syncModule.SyncManager.provider.awareness;
    awareness.getStates().set(2, { displayName: 'OldPeer', dataVersion: '4.0' });
    awareness.triggerChange();

    assert.strictEqual(syncModule.getSyncState(), 'offline');
  });

  it('disconnects on data version mismatch (websocket)', async () => {
    await syncModule.startWebsocketSync('Finn', 'WS1234', 'pass123', 'create');

    const awareness = syncModule.SyncManager.wsProvider.awareness;
    awareness.getStates().set(2, { displayName: 'OldPeer', dataVersion: '4.0' });
    awareness.triggerChange();

    assert.strictEqual(syncModule.getSyncState(), 'offline');
  });

  it('reconnects regular and large event sessions', async () => {
    await syncModule.startSync('Gina', null, 'secret', 'create');
    syncModule.stopSync(false);

    const reconnected = await syncModule.tryAutoReconnectForCurrentSession();
    assert.strictEqual(reconnected, true);
    assert.strictEqual(syncModule.getSyncState(), 'connected');

    syncModule.stopSync(false);

    syncModule.SyncManager.registryConnected = true;
    syncModule.SyncManager.registrySynced = true;
    await syncModule.startWebsocketSync('Gina', 'ZZ9999', 'pass123', 'create');
    syncModule.stopSync(false);
    syncModule.SyncManager.registryConnected = true;
    syncModule.SyncManager.registrySynced = true;

    const largeReconnected = await syncModule.tryAutoReconnectForCurrentSession();
    assert.strictEqual(largeReconnected, true);
    assert.strictEqual(syncModule.SyncManager.connectionType, 'websocket');
  });

  it('updates display name while connected', () => {
    syncModule.SyncManager.awareness = new MockAwareness();
    syncModule.SyncManager.displayName = 'Henry';
    syncModule.SyncManager.awareness.setLocalState({ displayName: 'Henry', dataVersion: '5.0' });

    const changed = syncModule.changeDisplayName('Ivy');

    assert.strictEqual(changed, true);
    assert.strictEqual(syncModule.getSyncDisplayName(), 'Ivy');
    assert.strictEqual(globalDoc.getMap('meta').get('syncDisplayName'), 'Ivy');
    assert.strictEqual(syncModule.SyncManager.awareness.getLocalState().displayName, 'Ivy');
  });
});
