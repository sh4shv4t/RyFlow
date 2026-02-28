// Express server entry — mounts all routes, Socket.io signaling, and peer discovery
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { Server } = require('socket.io');
const { initDatabase, closeDatabase } = require('./db/database');
const { startDiscovery, getPeers, stopDiscovery } = require('./p2p/discovery');

const app = express();
const server = http.createServer(app);

// Socket.io for WebRTC signaling and presence
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Initialize database
initDatabase();

// Mount API routes
app.use('/api/ai', require('./routes/ai'));
app.use('/api/docs', require('./routes/documents'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/graph', require('./routes/graph'));
app.use('/api/voice', require('./routes/voice'));
app.use('/api/workspace', require('./routes/workspace'));

// GET /api/peers — Return discovered LAN peers
app.get('/api/peers', (req, res) => {
  res.json({ peers: getPeers() });
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
    connectedUsers.set(socket.id, { workspaceId, userName, userId, avatarColor });

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
server.listen(PORT, () => {
  console.log(`\n⚡ RyFlow Backend running on http://localhost:${PORT}`);
  console.log(`📡 Socket.io signaling active`);

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
  closeDatabase();
  server.close();
  process.exit(0);
});

module.exports = { app, server, io };
