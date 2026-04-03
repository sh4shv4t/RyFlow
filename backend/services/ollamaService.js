// Wrapper for all Ollama LLM API calls (chat, generate, list models)
const fetch = require('node-fetch');

const OLLAMA_BASE =
  process.env.OLLAMA_HOST ||
  'http://localhost:11434';

let _available = null;
let _lastPing = 0;
const PING_TTL = 15000; // 15 seconds

async function isAvailable() {
  const now = Date.now();
  // Use cached result within TTL
  if (_available !== null && now - _lastPing < PING_TTL) {
    return _available;
  }
  _lastPing = now;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    _available = res.ok;
  } catch {
    _available = false;
  }
  return _available;
}

// Wraps fetch with an AbortController timeout for predictable response latency.
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new Error(`Ollama request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Sends a chat request to Ollama and returns the response (streaming or full)
async function chat(messages, model = 'phi3:mini', stream = false, timeoutMs = 30000) {
  if (!(await isAvailable())) {
    throw new Error('Ollama is not running. Start with: ollama serve');
  }

  const response = await fetchWithTimeout(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream })
  }, timeoutMs);

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}: ${response.statusText}`);
  }

  if (stream) {
    return response.body;
  }

  const data = await response.json();
  return data?.message?.content || '';
}

// Generates an embedding vector for the given text using nomic-embed-text
async function embed(text) {
  if (!(await isAvailable())) {
    throw new Error('Ollama is not running. Start with: ollama serve');
  }

  const response = await fetchWithTimeout(`${OLLAMA_BASE}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
  }, 30000);

  if (!response.ok) {
    throw new Error(`Ollama embeddings returned ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data.embedding) ? data.embedding.map((v) => Number(v)) : [];
}

// Lists all models currently available in Ollama
async function listModels() {
  try {
    if (!(await isAvailable())) {
      return [];
    }

    const response = await fetchWithTimeout(`${OLLAMA_BASE}/api/tags`, {}, 5000);
    if (!response.ok) throw new Error(`Ollama tags returned ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.models) ? data.models : [];
  } catch (err) {
    return [];
  }
}

// Checks if Ollama is running and accessible
async function checkHealth(force = false) {
  try {
    if (force) {
      _available = null;
      _lastPing = 0;
    }
    return await isAvailable();
  } catch {
    return false;
  }
}

module.exports = { chat, embed, listModels, checkHealth, OLLAMA_BASE };
