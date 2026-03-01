/**
 * Tests for utility helpers
 *  - amdDetect.detectAMD()
 *  - lanDiscovery.startPeerPolling / stopPeerPolling
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── amdDetect ──────────────────────────────────────────────────────────────
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

import axios from 'axios';
import { detectAMD } from '../utils/amdDetect';

describe('detectAMD', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns status object on success', async () => {
    const mockStatus = {
      ollama_running: true,
      amd_gpu: true,
      gpu_name: 'Radeon RX 7900 XTX',
      vram: '24 GB',
      inference_mode: 'GPU',
    };
    axios.get.mockResolvedValueOnce({ data: mockStatus });

    const result = await detectAMD();
    expect(result).toEqual(mockStatus);
    expect(axios.get).toHaveBeenCalledWith('/api/ai/system-status');
  });

  it('returns fallback CPU object when request fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const result = await detectAMD();
    expect(result).toMatchObject({
      gpuDetected: false,
      ollamaRunning: false,
      inferenceMode: 'CPU',
    });
  });

  it('returns whatever data the server sends', async () => {
    const partial = { ollama_running: false };
    axios.get.mockResolvedValueOnce({ data: partial });
    const result = await detectAMD();
    expect(result).toEqual(partial);
  });
});

// ── lanDiscovery ───────────────────────────────────────────────────────────
import { startPeerPolling, stopPeerPolling } from '../utils/lanDiscovery';

describe('lanDiscovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    stopPeerPolling();
  });

  afterEach(() => {
    stopPeerPolling();
    vi.useRealTimers();
  });

  it('calls /api/peers immediately on start', async () => {
    axios.get.mockResolvedValue({ data: { peers: [] } });
    const setCb = vi.fn();

    startPeerPolling(setCb);
    // Flush the microtask queue so the initial async `poll()` resolves
    await vi.advanceTimersByTimeAsync(0);

    expect(axios.get).toHaveBeenCalledWith('/api/peers');
  });

  it('calls onPeersUpdate with the returned peers array', async () => {
    const peers = [{ id: 'p1', name: 'Alice' }];
    axios.get.mockResolvedValue({ data: { peers } });
    const setCb = vi.fn();

    startPeerPolling(setCb);
    await vi.advanceTimersByTimeAsync(0);

    expect(setCb).toHaveBeenCalledWith(peers);
  });

  it('calls onPeersUpdate with empty array when peers key is missing', async () => {
    axios.get.mockResolvedValue({ data: {} });
    const setCb = vi.fn();

    startPeerPolling(setCb);
    await vi.advanceTimersByTimeAsync(0);

    expect(setCb).toHaveBeenCalledWith([]);
  });

  it('stopPeerPolling does not throw when not started', () => {
    expect(() => stopPeerPolling()).not.toThrow();
  });

  it('polls on the configured interval', async () => {
    axios.get.mockResolvedValue({ data: { peers: [] } });
    const setCb = vi.fn();

    startPeerPolling(setCb, 5000);
    await vi.advanceTimersByTimeAsync(15_000);
    stopPeerPolling();

    // initial call + 3 interval ticks = 4 total
    expect(axios.get.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});
