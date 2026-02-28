// Wrapper for all Ollama LLM API calls (chat, generate, list models)
const fetch = require('node-fetch');

const OLLAMA_BASE = process.env.OLLAMA_URL || 'http://localhost:11434';

// Sends a chat request to Ollama and returns the response (streaming or full)
async function chat(messages, model = 'phi3:mini', stream = false) {
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream })
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}: ${response.statusText}`);
    }

    if (stream) return response.body;

    const data = await response.json();
    return data.message.content;
  } catch (err) {
    console.error('[Ollama] Chat error:', err.message);
    throw err;
  }
}

// Generates an embedding vector for the given text using nomic-embed-text
async function embed(text) {
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'nomic-embed-text', prompt: text })
    });

    if (!response.ok) {
      throw new Error(`Ollama embeddings returned ${response.status}`);
    }

    const data = await response.json();
    return data.embedding;
  } catch (err) {
    console.error('[Ollama] Embedding error:', err.message);
    throw err;
  }
}

// Lists all models currently available in Ollama
async function listModels() {
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!response.ok) throw new Error(`Ollama tags returned ${response.status}`);
    const data = await response.json();
    return data.models || [];
  } catch (err) {
    console.error('[Ollama] List models error:', err.message);
    return [];
  }
}

// Checks if Ollama is running and accessible
async function checkHealth() {
  try {
    const response = await fetch(`${OLLAMA_BASE}/api/tags`, { timeout: 3000 });
    return response.ok;
  } catch {
    return false;
  }
}

module.exports = { chat, embed, listModels, checkHealth, OLLAMA_BASE };
