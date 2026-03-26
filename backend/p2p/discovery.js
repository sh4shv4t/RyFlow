// mDNS/Bonjour LAN peer discovery — advertise and browse for RyFlow instances
const Bonjour = require('bonjour-service');
const os = require('os');
const registry = require('../db/registry');
const pkg = require('../../package.json');

let bonjourInstance = null;
let browser = null;
let peerList = [];
let serviceName = 'RyFlow-User';
let cleanupInterval = null;
let workspaceCache = new Map();

// Resolves currently hosted workspace summary for mDNS TXT advertisement.
function getActiveWorkspaceSummary() {
  return registry.prepare(
    `SELECT w.id, w.name, w.owner_name
     FROM active_session s
     JOIN workspaces w ON w.id = s.workspace_id
     WHERE s.id = 1`
  ).get();
}

// Fetches peer discover endpoint with 30-second cache.
async function fetchPeerWorkspace(peer) {
  const cacheKey = `${peer.host}:${peer.port}`;
  const now = Date.now();
  const cached = workspaceCache.get(cacheKey);
  if (cached && (now - cached.at) < 30000) return cached.workspace;

  try {
    const response = await fetch(`http://${peer.host}:${peer.port}/api/workspaces/discover`);
    if (!response.ok) {
      workspaceCache.set(cacheKey, { at: now, workspace: null });
      return null;
    }
    const info = await response.json();
    const workspace = {
      id: info.workspace_id,
      name: info.workspace_name,
      owner_name: info.owner_name
    };
    workspaceCache.set(cacheKey, { at: now, workspace });
    return workspace;
  } catch {
    workspaceCache.set(cacheKey, { at: now, workspace: null });
    return null;
  }
}

// Starts mDNS advertising and browsing for peers on the local network
function startDiscovery(username, port = 3001) {
  serviceName = `RyFlow-${os.hostname()}`;
  // Reset stale state whenever discovery restarts.
  peerList = [];
  workspaceCache = new Map();
  
  try {
    bonjourInstance = new Bonjour.Bonjour();

    const activeSession = getActiveWorkspaceSummary();

    // Advertise this instance
    bonjourInstance.publish({
      name: serviceName,
      type: 'http',
      port: port,
      txt: {
        ryflow: 'true',
        version: pkg.version,
        workspace_name: activeSession?.name || 'Unknown',
        workspace_id: activeSession?.id || '',
        owner: activeSession?.owner_name || 'Unknown'
      }
    });

    console.log(`[P2P] Advertising as "${serviceName}" on port ${port}`);

    // Browse for other instances
    browser = bonjourInstance.find({ type: 'http' }, (service) => {
      if (service.txt && (service.txt.app === 'ryflow' || service.txt.ryflow === 'true') && service.name !== serviceName) {
        const peer = {
          name: service.name.replace('RyFlow-', ''),
          host: service.host,
          port: service.port,
          lastSeen: new Date().toISOString()
        };

        // Update or add peer
        const existingIdx = peerList.findIndex(p => p.host === peer.host && p.port === peer.port);
        if (existingIdx >= 0) {
          peerList[existingIdx] = peer;
        } else {
          peerList.push(peer);
          console.log(`[P2P] Discovered peer: ${peer.name} at ${peer.host}:${peer.port}`);
        }
      }
    });

    // Clean up stale peers every 30 seconds
    cleanupInterval = setInterval(() => {
      // Remove peers not seen in the last 30 seconds.
      const cutoff = Date.now() - 30000;
      peerList = peerList.filter(p => new Date(p.lastSeen).getTime() > cutoff);
      const validKeys = new Set(peerList.map((p) => `${p.host}:${p.port}`));
      workspaceCache.forEach((_, key) => {
        if (!validKeys.has(key)) workspaceCache.delete(key);
      });
    }, 30000);

  } catch (err) {
    console.error('[P2P] Discovery error:', err.message);
    console.log('[P2P] LAN discovery disabled — running in standalone mode');
  }
}

// Returns the current list of discovered peers
async function getPeers() {
  const peers = await Promise.all(peerList.map(async (peer) => ({
    ...peer,
    workspace: await fetchPeerWorkspace(peer)
  })));
  return peers;
}

// Stops mDNS advertising and browsing
function stopDiscovery() {
  try {
    // Stop the stale-peer cleaner when discovery is shut down.
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
    if (browser) browser.stop();
    if (bonjourInstance) bonjourInstance.destroy();
    browser = null;
    bonjourInstance = null;
    console.log('[P2P] Discovery stopped');
  } catch (err) {
    console.error('[P2P] Stop error:', err.message);
  }
}

module.exports = { startDiscovery, getPeers, stopDiscovery };
