// AMD GPU detection utility — checks system status from backend
import axios from 'axios';

const STATUS_TTL_MS = 60000;
const IS_TEST_ENV = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

let cachedStatus = null;
let cachedAt = 0;
let inFlight = null;

// Fetches AMD GPU and ROCm detection info from the backend
export async function detectAMD(force = false) {
  if (!IS_TEST_ENV && !force && cachedStatus && Date.now() - cachedAt < STATUS_TTL_MS) {
    return cachedStatus;
  }

  if (!IS_TEST_ENV && inFlight) {
    return inFlight;
  }

  try {
    inFlight = axios.get('/api/ai/system-status').then((res) => {
      cachedStatus = res.data;
      cachedAt = Date.now();
      return cachedStatus;
    });
    return await inFlight;
  } catch {
    const fallback = {
      gpuDetected: false,
      gpuName: null,
      rocmAvailable: false,
      modelLoaded: null,
      inferenceMode: 'CPU',
      ollamaRunning: false,
      models: []
    };
    cachedStatus = fallback;
    cachedAt = Date.now();
    return fallback;
  } finally {
    inFlight = null;
  }
}
