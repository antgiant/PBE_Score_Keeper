/**
 * Combined WebRTC Signaling + WebSocket Sync Server for PBE Score Keeper
 * 
 * Routes:
 * - /ws/* : y-websocket sync endpoints for large events
 * - Everything else (root, /*, etc.): WebRTC signaling for P2P sync
 * 
 * This allows backwards compatibility with the existing y-webrtc signaling
 * while adding y-websocket support for large events.
 */

const http = require('http');
const WebSocket = require('ws');

// y-websocket utilities
const Y = require('yjs');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');

const PORT = process.env.PORT || 4444;
const HOST = '0.0.0.0';

// ============================================================
// WebRTC Signaling Server (for P2P sync - backwards compatible)
// ============================================================

const signalingClients = new Map(); // roomName -> Set of WebSocket connections
const signalingStats = {
  rooms: 0,
  connections: 0
};

function handleSignalingConnection(ws, req) {
  console.log('[Signaling] New connection');
  signalingStats.connections++;
  
  let subscribedRooms = new Set();
  let closed = false;
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'subscribe':
          handleSubscribe(ws, message.topics || [], subscribedRooms);
          break;
        case 'unsubscribe':
          handleUnsubscribe(ws, message.topics || [], subscribedRooms);
          break;
        case 'publish':
          handlePublish(ws, message.topic, message);
          break;
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        default:
          console.log('[Signaling] Unknown message type:', message.type);
      }
    } catch (err) {
      console.error('[Signaling] Error parsing message:', err);
    }
  });
  
  ws.on('close', () => {
    if (closed) return;
    closed = true;
    signalingStats.connections--;
    
    // Remove from all subscribed rooms
    for (const room of subscribedRooms) {
      const clients = signalingClients.get(room);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) {
          signalingClients.delete(room);
          signalingStats.rooms--;
        }
      }
    }
    console.log('[Signaling] Connection closed. Active rooms:', signalingStats.rooms);
  });
  
  ws.on('error', (err) => {
    console.error('[Signaling] WebSocket error:', err);
  });
}

function handleSubscribe(ws, topics, subscribedRooms) {
  for (const topic of topics) {
    if (!subscribedRooms.has(topic)) {
      subscribedRooms.add(topic);
      
      if (!signalingClients.has(topic)) {
        signalingClients.set(topic, new Set());
        signalingStats.rooms++;
      }
      signalingClients.get(topic).add(ws);
      console.log(`[Signaling] Subscribed to: ${topic}`);
    }
  }
}

function handleUnsubscribe(ws, topics, subscribedRooms) {
  for (const topic of topics) {
    subscribedRooms.delete(topic);
    
    const clients = signalingClients.get(topic);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        signalingClients.delete(topic);
        signalingStats.rooms--;
      }
    }
  }
}

function handlePublish(senderWs, topic, message) {
  const clients = signalingClients.get(topic);
  if (!clients) return;
  
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client !== senderWs && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// ============================================================
// y-websocket Server (for large event sync)
// ============================================================

const wsRooms = new Map(); // roomName -> { doc: Y.Doc, awareness: awarenessProtocol.Awareness, conns: Map }
const wsStats = {
  rooms: 0,
  connections: 0
};

// Registry room - special room that persists and tracks all active sync rooms
const REGISTRY_ROOM = 'pbe-registry';

// Message types
const messageSync = 0;
const messageAwareness = 1;

function getOrCreateWSRoom(roomName) {
  if (!wsRooms.has(roomName)) {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    
    wsRooms.set(roomName, {
      doc,
      awareness,
      conns: new Map() // conn -> Set of client IDs
    });
    wsStats.rooms++;
    
    console.log(`[WebSocket] Created room: ${roomName}`);
  }
  return wsRooms.get(roomName);
}

function handleWebsocketSyncConnection(ws, req) {
  // Extract room name from URL path (e.g., /ws/pbe-ws-ABC123)
  const pathname = req.url;
  const roomMatch = pathname.match(/^\/ws\/(.+)$/);
  
  if (!roomMatch) {
    console.error('[WebSocket] Invalid room path:', pathname);
    ws.close(1008, 'Invalid room path');
    return;
  }
  
  const roomName = roomMatch[1];
  console.log(`[WebSocket] New connection to room: ${roomName}`);
  wsStats.connections++;
  
  const room = getOrCreateWSRoom(roomName);
  const { doc, awareness, conns } = room;
  
  // Track this connection
  const clientIds = new Set();
  conns.set(ws, clientIds);
  
  let closed = false;
  
  // Send initial sync step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  ws.send(encoding.toUint8Array(encoder));
  
  // Send initial awareness state
  const awarenessEncoder = encoding.createEncoder();
  encoding.writeVarUint(awarenessEncoder, messageAwareness);
  encoding.writeVarUint8Array(awarenessEncoder, awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awareness.getStates().keys())));
  ws.send(encoding.toUint8Array(awarenessEncoder));
  
  // Handle incoming messages
  ws.on('message', (data) => {
    if (closed) return;
    
    try {
      const message = new Uint8Array(data);
      const decoder = decoding.createDecoder(message);
      const messageType = decoding.readVarUint(decoder);
      
      switch (messageType) {
        case messageSync:
          handleSyncMessage(decoder, doc, ws, conns);
          break;
        case messageAwareness:
          handleAwarenessMessage(decoder, awareness, ws, conns, clientIds);
          break;
        default:
          console.log('[WebSocket] Unknown message type:', messageType);
      }
    } catch (err) {
      console.error('[WebSocket] Error processing message:', err);
    }
  });
  
  ws.on('close', () => {
    if (closed) return;
    closed = true;
    wsStats.connections--;
    
    // Remove awareness states for this connection
    if (clientIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(awareness, Array.from(clientIds), null);
    }
    
    conns.delete(ws);
    
    // Clean up empty rooms (except registry room which persists)
    if (conns.size === 0 && roomName !== REGISTRY_ROOM) {
      wsRooms.delete(roomName);
      wsStats.rooms--;
      console.log(`[WebSocket] Room deleted: ${roomName}`);
    } else if (conns.size === 0 && roomName === REGISTRY_ROOM) {
      console.log(`[WebSocket] Registry room empty but persisted`);
    }
    
    console.log(`[WebSocket] Connection closed. Active rooms: ${wsStats.rooms}`);
  });
  
  ws.on('error', (err) => {
    console.error('[WebSocket] Error:', err);
  });
}

function handleSyncMessage(decoder, doc, senderWs, conns) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  
  const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, doc, senderWs);
  
  if (encoding.length(encoder) > 1) {
    senderWs.send(encoding.toUint8Array(encoder));
  }
  
  // If we received an update (syncMessageType === 2), broadcast to other clients
  if (syncMessageType === 2) {
    const updateEncoder = encoding.createEncoder();
    encoding.writeVarUint(updateEncoder, messageSync);
    syncProtocol.writeSyncStep2(updateEncoder, doc);
    const update = encoding.toUint8Array(updateEncoder);
    
    for (const [conn] of conns) {
      if (conn !== senderWs && conn.readyState === WebSocket.OPEN) {
        conn.send(update);
      }
    }
  }
}

function handleAwarenessMessage(decoder, awareness, senderWs, conns, clientIds) {
  const update = decoding.readVarUint8Array(decoder);
  awarenessProtocol.applyAwarenessUpdate(awareness, update, senderWs);
  
  // Track client IDs from this connection
  const changedClients = awarenessProtocol.decodeAwarenessUpdate(update);
  for (const clientId of changedClients) {
    clientIds.add(clientId);
  }
  
  // Broadcast to other clients
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(encoder, update);
  const encoded = encoding.toUint8Array(encoder);
  
  for (const [conn] of conns) {
    if (conn !== senderWs && conn.readyState === WebSocket.OPEN) {
      conn.send(encoded);
    }
  }
}

// ============================================================
// HTTP Server & WebSocket Routing
// ============================================================

const server = http.createServer((req, res) => {
  // Health check endpoint
  if (req.url === '/health' || req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      signaling: {
        rooms: signalingStats.rooms,
        connections: signalingStats.connections
      },
      websocket: {
        rooms: wsStats.rooms,
        connections: wsStats.connections
      }
    }));
    return;
  }
  
  res.writeHead(404);
  res.end('Not found');
});

// Create WebSocket servers
const signalingWss = new WebSocket.Server({ noServer: true });
const syncWss = new WebSocket.Server({ noServer: true });

// Handle upgrade requests
server.on('upgrade', (req, socket, head) => {
  const pathname = req.url;
  
  if (pathname.startsWith('/ws/')) {
    // Route to y-websocket server
    syncWss.handleUpgrade(req, socket, head, (ws) => {
      handleWebsocketSyncConnection(ws, req);
    });
  } else {
    // Route to signaling server (root path, any other path)
    signalingWss.handleUpgrade(req, socket, head, (ws) => {
      handleSignalingConnection(ws, req);
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Combined signaling + websocket server running on ${HOST}:${PORT}`);
  console.log('  Signaling: ws://...:' + PORT + '/ (and any path except /ws/*)');
  console.log('  WebSocket: ws://...:' + PORT + '/ws/{roomName}');
});
