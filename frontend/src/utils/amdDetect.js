// AMD GPU detection utility — checks system status from backend
import axios from 'axios';

// Fetches AMD GPU and ROCm detection info from the backend
export async function detectAMD() {
  try {
    const res = await axios.get('/api/ai/system-status');
    return res.data;
  } catch {
    return {
      gpuDetected: false,
      gpuName: null,
      rocmAvailable: false,
      modelLoaded: null,
      inferenceMode: 'CPU',
      ollamaRunning: false,
      models: []
    };
  }
}
