// Transparently proxies workspace data requests when active session points to remote host.
const registry = require('../db/registry');

// Returns stored join code for a known workspace.
function getStoredJoinCode(workspaceId) {
  const row = registry.prepare('SELECT join_code FROM workspaces WHERE id = ?').get(workspaceId);
  return row?.join_code || '';
}

// Decides whether this route should never be proxied.
function shouldSkipProxy(urlPath) {
  return String(urlPath || '').startsWith('/api/workspaces')
    || String(urlPath || '').startsWith('/api/system/info')
    || String(urlPath || '').startsWith('/api/health')
    || String(urlPath || '').startsWith('/api/peers');
}

// Proxies request to active remote host when remote mode is enabled.
async function remoteProxy(req, res, next) {
  if (shouldSkipProxy(req.originalUrl)) return next();

  const activeSession = registry.prepare('SELECT * FROM active_session WHERE id = 1').get();
  if (!activeSession?.is_remote || !activeSession.remote_host || !activeSession.remote_port) {
    return next();
  }

  try {
    const targetUrl = `http://${activeSession.remote_host}:${activeSession.remote_port}${req.originalUrl}`;
    const headers = { ...req.headers };
    headers['x-join-code'] = headers['x-join-code'] || getStoredJoinCode(activeSession.workspace_id);
    headers.host = activeSession.remote_host;

    const method = String(req.method || 'GET').toUpperCase();
    const proxyResponse = await fetch(targetUrl, {
      method,
      headers,
      body: ['GET', 'HEAD'].includes(method) ? undefined : JSON.stringify(req.body || {})
    });

    const text = await proxyResponse.text();
    const contentType = proxyResponse.headers.get('content-type') || 'application/json';
    res.status(proxyResponse.status);
    res.setHeader('content-type', contentType);
    return res.send(text);
  } catch (err) {
    return res.status(502).json({ error: 'Remote host unreachable', detail: err.message });
  }
}

module.exports = remoteProxy;
