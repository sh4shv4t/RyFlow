// Validates join code for remote clients accessing protected workspace data routes.
const registry = require('../db/registry');

// Returns true when client address is local loopback.
function isLocalAddress(ip) {
  const value = String(ip || '');
  return value === '127.0.0.1' || value === '::1' || value.includes('127.0.0.1') || value.includes('::ffff:127.0.0.1');
}

// Enforces join-code access for non-local requests.
function joinCodeAuth(req, res, next) {
  const clientIP = req.ip || req.connection?.remoteAddress;
  if (isLocalAddress(clientIP)) return next();

  const joinCode = String(req.headers['x-join-code'] || req.query.join_code || '').trim().toUpperCase();
  if (!joinCode) {
    return res.status(401).json({ error: 'Join code required for remote access' });
  }

  const activeSession = registry.prepare('SELECT * FROM active_session WHERE id = 1').get();
  if (!activeSession?.workspace_id) {
    return res.status(503).json({ error: 'No active workspace on host' });
  }

  const workspace = registry.prepare('SELECT * FROM workspaces WHERE id = ?').get(activeSession.workspace_id);
  if (!workspace || String(workspace.join_code || '').toUpperCase() !== joinCode) {
    return res.status(403).json({ error: 'Invalid join code' });
  }

  req.remoteWorkspaceId = workspace.id;
  return next();
}

module.exports = joinCodeAuth;
