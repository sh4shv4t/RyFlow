// mDNS/Bonjour LAN peer discovery — advertise and browse for RyFlow instances
const Bonjour = require('bonjour-service');

let bonjourInstance = null;
let browser = null;
let peerList = [];
let serviceName = 'RyFlow-User';

// Starts mDNS advertising and browsing for peers on the local network
function startDiscovery(username, port = 3001) {
  serviceName = `RyFlow-${username || 'User'}`;
  
  try {
    bonjourInstance = new Bonjour.Bonjour();

    // Advertise this instance
    bonjourInstance.publish({
      name: serviceName,
      type: 'http',
      port: port,
      txt: { app: 'ryflow', version: '1.0.0' }
    });

    console.log(`[P2P] Advertising as "${serviceName}" on port ${port}`);

    // Browse for other instances
    browser = bonjourInstance.find({ type: 'http' }, (service) => {
      if (service.txt && service.txt.app === 'ryflow' && service.name !== serviceName) {
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
    setInterval(() => {
      const cutoff = Date.now() - 60000; // 60 seconds
      peerList = peerList.filter(p => new Date(p.lastSeen).getTime() > cutoff);
    }, 30000);

  } catch (err) {
    console.error('[P2P] Discovery error:', err.message);
    console.log('[P2P] LAN discovery disabled — running in standalone mode');
  }
}

// Returns the current list of discovered peers
function getPeers() {
  return peerList;
}

// Stops mDNS advertising and browsing
function stopDiscovery() {
  try {
    if (browser) browser.stop();
    if (bonjourInstance) bonjourInstance.destroy();
    console.log('[P2P] Discovery stopped');
  } catch (err) {
    console.error('[P2P] Stop error:', err.message);
  }
}

module.exports = { startDiscovery, getPeers, stopDiscovery };
