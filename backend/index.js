// Express server entry — mounts all routes, Socket.io signaling, and peer discovery
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const os = require('os');
const { Server } = require('socket.io');
const { WebSocketServer } = require('ws');
const registry = require('./db/registry');
const { switchWorkspace, clearActiveWorkspace } = require('./db/database');
const { startDiscovery, getPeers, stopDiscovery } = require('./p2p/discovery');
const joinCodeAuth = require('./middleware/joinCodeAuth');
const remoteProxy = require('./middleware/remoteProxy');

const app = express();
const server = http.createServer(app);

// Socket.io for WebRTC signaling and presence
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// y-webrtc signaling endpoint (topics + pub/sub) mounted at /yjs.
const yjsWss = new WebSocketServer({ noServer: true });
const yjsTopics = new Map();
const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;
const yjsPingTimeout = 30000;

function setIfMissing(map, key, createValue) {
  if (!map.has(key)) map.set(key, createValue());
  return map.get(key);
}

function yjsSend(conn, message) {
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
    conn.close();
    return;
  }

  try {
    conn.send(JSON.stringify(message));
  } catch {
    conn.close();
  }
}

function handleYjsConnection(conn) {
  const subscribedTopics = new Set();
  let closed = false;
  let pongReceived = true;

  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      clearInterval(pingInterval);
      conn.close();
      return;
    }

    pongReceived = false;
    try {
      conn.ping();
    } catch {
      conn.close();
    }
  }, yjsPingTimeout);

  conn.on('pong', () => {
    pongReceived = true;
  });

  conn.on('close', () => {
    subscribedTopics.forEach((topicName) => {
      const subscribers = yjsTopics.get(topicName) || new Set();
      subscribers.delete(conn);
      if (subscribers.size === 0) yjsTopics.delete(topicName);
    });
    subscribedTopics.clear();
    closed = true;
    clearInterval(pingInterval);
  });

  conn.on('message', (raw) => {
    if (closed) return;

    let message = raw;
    if (typeof raw === 'string' || raw instanceof Buffer) {
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
    }

    if (!message || !message.type) return;

    switch (message.type) {
      case 'subscribe': {
        (message.topics || []).forEach((topicName) => {
          if (typeof topicName !== 'string') return;
          const topic = setIfMissing(yjsTopics, topicName, () => new Set());
          topic.add(conn);
          subscribedTopics.add(topicName);
        });
        break;
      }
      case 'unsubscribe': {
        (message.topics || []).forEach((topicName) => {
          const subscribers = yjsTopics.get(topicName);
          if (subscribers) subscribers.delete(conn);
          subscribedTopics.delete(topicName);
        });
        break;
      }
      case 'publish': {
        if (!message.topic) return;
        const receivers = yjsTopics.get(message.topic);
        if (!receivers) return;
        const payload = { ...message, clients: receivers.size };
        receivers.forEach((receiver) => yjsSend(receiver, payload));
        break;
      }
      case 'ping':
        yjsSend(conn, { type: 'pong' });
        break;
      default:
        break;
    }
  });
}

yjsWss.on('connection', handleYjsConnection);

server.on('upgrade', (request, socket, head) => {
  let pathname = '';
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    pathname = url.pathname;
  } catch {
    socket.destroy();
    return;
  }

  if (pathname !== '/yjs') {
    return;
  }

  yjsWss.handleUpgrade(request, socket, head, (ws) => {
    yjsWss.emit('connection', ws, request);
  });
});

const PORT = process.env.PORT || 3001;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
process.env.OLLAMA_HOST = OLLAMA_HOST;

// Detects primary LAN IPv4 address for discoverability endpoints.
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

const LOCAL_IP = getLocalIP();

// Middleware
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Restores the last active local workspace on startup if available.
try {
  const active = registry.prepare('SELECT * FROM active_session WHERE id = 1').get();
  if (active?.workspace_id && !active?.is_remote) {
    switchWorkspace(active.workspace_id);
  }
} catch (err) {
  console.warn('[Workspace] No local workspace restored on startup:', err.message);
}

// Proxy remote workspace traffic before route handlers.
app.use(remoteProxy);

// Protect workspace data routes for non-local clients.
app.use('/api/docs', joinCodeAuth);
app.use('/api/tasks', joinCodeAuth);
app.use('/api/graph', joinCodeAuth);
app.use('/api/chats', joinCodeAuth);
app.use('/api/code', joinCodeAuth);
app.use('/api/canvas', joinCodeAuth);
app.use('/api/voice', joinCodeAuth);
app.use('/api/workspace', joinCodeAuth);
app.use('/api/comments', joinCodeAuth);
app.use('/api/tags', joinCodeAuth);

// Mount API routes
app.use('/api/ai', require('./routes/ai'));
app.use('/api/docs', require('./routes/documents'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/graph', require('./routes/graph'));
app.use('/api/voice', require('./routes/voice'));
app.use('/api/workspace', require('./routes/workspace'));
app.use('/api/code', require('./routes/code'));
app.use('/api/canvas', require('./routes/canvas'));
app.use('/api/chats', require('./routes/chats'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/workspaces', require('./routes/workspaces'));
app.use('/api/import', require('./routes/folderImport'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/tags', require('./routes/tags'));

// GET /api/system/info — Exposes host network info for LAN joins.
app.get('/api/system/info', (req, res) => {
  res.json({
    localIP: LOCAL_IP,
    port: Number(PORT),
    version: require('../package.json').version
  });
});

// GET /api/peers — Return discovered LAN peers
app.get('/api/peers', async (req, res) => {
  const peers = await getPeers();
  res.json({ peers });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Socket.io signaling for WebRTC collaboration
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log(`[Socket] User connected: ${socket.id}`);

  // User joins a workspace room
  socket.on('join-workspace', ({ workspaceId, userName, userId, avatarColor }) => {
    socket.join(workspaceId);
    // Include socketId so peers can perform direct signaling.
    connectedUsers.set(socket.id, { socketId: socket.id, workspaceId, userName, userId, avatarColor });

    // Broadcast presence to room
    const roomUsers = Array.from(connectedUsers.values())
      .filter(u => u.workspaceId === workspaceId);
    io.to(workspaceId).emit('presence-update', roomUsers);

    console.log(`[Socket] ${userName} joined workspace ${workspaceId}`);
  });

  // WebRTC signaling: forward offer to specific peer
  socket.on('signal-offer', ({ targetId, offer, from }) => {
    io.to(targetId).emit('signal-offer', { offer, from: socket.id, fromName: from });
  });

  // WebRTC signaling: forward answer to specific peer
  socket.on('signal-answer', ({ targetId, answer }) => {
    io.to(targetId).emit('signal-answer', { answer, from: socket.id });
  });

  // WebRTC signaling: forward ICE candidate
  socket.on('signal-ice', ({ targetId, candidate }) => {
    io.to(targetId).emit('signal-ice', { candidate, from: socket.id });
  });

  // Document cursor position broadcast
  socket.on('cursor-update', ({ workspaceId, position, userName, avatarColor }) => {
    socket.to(workspaceId).emit('cursor-update', {
      userId: socket.id,
      position,
      userName,
      avatarColor
    });
  });

  // Document content sync
  socket.on('doc-update', ({ workspaceId, docId, update }) => {
    socket.to(workspaceId).emit('doc-update', { docId, update, from: socket.id });
  });

  socket.on('disconnect', () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      connectedUsers.delete(socket.id);
      const roomUsers = Array.from(connectedUsers.values())
        .filter(u => u.workspaceId === user.workspaceId);
      io.to(user.workspaceId).emit('presence-update', roomUsers);
      console.log(`[Socket] ${user.userName} disconnected`);
    }
  });
});

// Start the server
server.listen(PORT, '0.0.0.0', () => {
  console.log('RyFlow backend listening on port 3001');
  console.log(`Ollama host: ${OLLAMA_HOST}`);
  console.log('LAN access enabled');
  console.log(`📡 Socket.io signaling active at ${LOCAL_IP}:${PORT}`);
  console.log(`🔗 Yjs signaling active at ws://${LOCAL_IP}:${PORT}/yjs`);

  // Start LAN peer discovery
  try {
    startDiscovery('Host', PORT);
  } catch (err) {
    console.log('[P2P] LAN discovery unavailable:', err.message);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down RyFlow...');
  stopDiscovery();
  clearActiveWorkspace();
  server.close();
  process.exit(0);
});

module.exports = { app, server, io };
