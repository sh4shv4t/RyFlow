// Frontend peer list poller — polls /api/peers for LAN discovery
import axios from 'axios';

let pollInterval = null;

// Starts polling for LAN peers every 5 seconds
export function startPeerPolling(onPeersUpdate, intervalMs = 5000) {
  if (pollInterval) clearInterval(pollInterval);

  const poll = async () => {
    try {
      const res = await axios.get('/api/peers');
      onPeersUpdate(res.data.peers || []);
    } catch {
      // Silent fail — peers unavailable
    }
  };

  poll(); // immediate first call
  pollInterval = setInterval(poll, intervalMs);
}

// Stops peer polling
export function stopPeerPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}
