// AI routes — LLM chat, embeddings, image generation, system status
const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const crypto = require('crypto');
const ollamaService = require('../services/ollamaService');
const { getImageUrl, generateImage, createVariations } = require('../services/imageService');
const { semanticSearch } = require('../services/embeddingService');
const { buildEmbedText } = require('../services/embeddingService');
const { getDb } = require('../db/database');
const { createNode } = require('../services/graphService');
const { enqueueEmbeddingJob } = require('../services/embeddingQueue');

// Builds optional RAG-augmented message list and metadata for AI responses.
async function buildRagMessages(messages, workspaceId) {
  const safeMessages = Array.isArray(messages) ? [...messages] : [];
  if (!workspaceId || !safeMessages.length) {
    return { finalMessages: safeMessages, ragUsed: false, citations: [] };
  }

  const lastUser = [...safeMessages].reverse().find((m) => m.role === 'user' && m.content);
  if (!lastUser) {
    return { finalMessages: safeMessages, ragUsed: false, citations: [] };
  }

  const matches = await semanticSearch(lastUser.content, workspaceId, 5);
  const strongMatches = matches.filter((m) => Number(m.score || 0) > 0.3);
  if (!strongMatches.length) {
    return { finalMessages: safeMessages, ragUsed: false, citations: [] };
  }

  const ragContext = strongMatches
    .map((r) => `[${String(r.type || '').toUpperCase()}] ${r.title}: ${r.content_summary || ''}`)
    .join('\n\n');

  const ragSystemPrompt = `You are RyFlow's AI assistant. You have access to this user's workspace knowledge. Use the following context from their workspace to give a more accurate and relevant answer. If the context is not relevant to the question, ignore it and answer normally.\n\nWORKSPACE CONTEXT:\n${ragContext}\n\nAnswer the user's question using this context where relevant.`;

  return {
    finalMessages: [{ role: 'system', content: ragSystemPrompt }, ...safeMessages],
    ragUsed: true,
    citations: strongMatches.map((m) => ({
      id: m.id,
      source_id: m.source_id,
      type: m.type,
      title: m.title,
      score: Number(m.score || 0)
    }))
  };
}

// Normalizes a data URL/base64 payload into raw base64 bytes for Ollama image input.
function normalizeBase64Image(input) {
  const raw = String(input || '');
  if (!raw) return '';
  const commaIndex = raw.indexOf(',');
  return commaIndex > -1 ? raw.slice(commaIndex + 1) : raw;
}

// Extracts pure JSON from model output that may include markdown fences.
function cleanJsonBlock(text) {
  return String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

// GET /api/ai/system-status — Returns GPU, ROCm, and model info
router.get('/system-status', async (req, res) => {
  try {
    // Detect AMD ROCm GPU
    let gpuDetected = false;
    let gpuName = null;
    let rocmAvailable = false;
    let inferenceMode = 'CPU';

    try {
      const result = execSync('rocm-smi --showproductname', { timeout: 3000 }).toString();
      const gpuLine = result.split('\n').find(l => l.includes('Card') || l.includes('GPU'));
      gpuDetected = true;
      gpuName = gpuLine ? gpuLine.trim() : 'AMD GPU';
      rocmAvailable = true;
      inferenceMode = 'AMD ROCm';
    } catch {
      // ROCm not available, check for any GPU info
      try {
        const wmicResult = execSync('wmic path win32_videocontroller get name', { timeout: 3000 }).toString();
        const lines = wmicResult.split('\n').filter(l => l.trim() && !l.includes('Name'));
        if (lines.length > 0) {
          gpuName = lines[0].trim();
          gpuDetected = true;
          if (gpuName.toLowerCase().includes('amd') || gpuName.toLowerCase().includes('radeon')) {
            inferenceMode = 'AMD GPU (ROCm not detected)';
          }
        }
      } catch {
        // No GPU detection possible
      }
    }

    // Check Ollama status
    const ollamaRunning = await ollamaService.checkHealth();
    let modelLoaded = null;
    if (ollamaRunning) {
      const models = await ollamaService.listModels();
      modelLoaded = models.length > 0 ? models[0].name : null;
    }

    res.json({
      gpuDetected,
      gpuName,
      rocmAvailable,
      modelLoaded,
      inferenceMode,
      ollamaRunning,
      models: ollamaRunning ? await ollamaService.listModels() : []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/chat — Non-streaming chat with Ollama
router.post('/chat', async (req, res) => {
  try {
    const { messages, model, workspace_id } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    const { finalMessages, ragUsed, citations } = await buildRagMessages(messages, workspace_id);
    const response = await ollamaService.chat(finalMessages, model || 'phi3:mini', false);
    res.json({ content: response, ragUsed, citations });
  } catch (err) {
    res.status(500).json({ error: 'AI service unavailable. Is Ollama running?', details: err.message });
  }
});

// POST /api/ai/ocr-fallback — Vision OCR fallback for hard-to-read images
router.post('/ocr-fallback', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64 || !mimeType) {
      return res.status(400).json({ error: 'imageBase64 and mimeType are required' });
    }

    const models = await ollamaService.listModels();
    const hasLlava = models.some((m) => String(m.name || '').toLowerCase().includes('llava'));
    if (!hasLlava) {
      return res.status(422).json({ error: 'Vision model not available', fallback: true });
    }

    const cleanImage = normalizeBase64Image(imageBase64);
    const response = await ollamaService.chat([
      {
        role: 'user',
        content: 'Extract all text from this image exactly as it appears.',
        images: [cleanImage]
      }
    ], 'llava', false);

    return res.json({ text: String(response || '').trim(), model: 'llava' });
  } catch (err) {
    return res.status(500).json({ error: 'OCR fallback failed', details: err.message });
  }
});

// POST /api/ai/chat/stream — SSE streaming chat with Ollama
router.post('/chat/stream', async (req, res) => {
  try {
    const { messages, model, workspace_id } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const { finalMessages, ragUsed, citations } = await buildRagMessages(messages, workspace_id);
    const stream = await ollamaService.chat(finalMessages, model || 'phi3:mini', true);

    // Send a metadata event first so frontend can show RAG usage indicator.
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ ragUsed, citations })}\n\n`);
    }

    let buffer = '';
    stream.on('data', (chunk) => {
      // Stop streaming work if the client is already gone.
      if (res.writableEnded) return;
      buffer += chunk.toString();
      // Ollama streams newline-delimited JSON
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line in buffer
      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            const text = parsed.message?.content || '';
            if (text && !res.writableEnded) {
              res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
            if (parsed.done && !res.writableEnded) {
              res.write('data: [DONE]\n\n');
            }
          } catch {
            // skip unparseable chunks
          }
        }
      }
    });

    stream.on('end', () => {
      // Process remaining buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer);
          const text = parsed.message?.content || '';
          if (text && !res.writableEnded) res.write(`data: ${JSON.stringify({ text })}\n\n`);
        } catch {}
      }
      if (!res.writableEnded) {
        res.write('data: [DONE]\n\n');
        res.end();
      }
    });

    stream.on('error', (err) => {
      console.error('[AI Stream] Error:', err.message);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      }
    });

    req.on('close', () => {
      stream.destroy && stream.destroy();
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI service unavailable. Is Ollama running?', details: err.message });
    }
  }
});

// POST /api/ai/study-guide — Generates summary, key terms, and quiz for selected docs.
router.post('/study-guide', async (req, res) => {
  try {
    const { doc_ids, workspace_id } = req.body || {};
    if (!Array.isArray(doc_ids) || doc_ids.length === 0 || !workspace_id) {
      return res.status(400).json({ error: 'doc_ids and workspace_id are required' });
    }

    const db = getDb();
    const docs = doc_ids.map((id) => db.prepare(
      'SELECT id, title, content FROM documents WHERE id = ? AND workspace_id = ?'
    ).get(id, workspace_id)).filter(Boolean);

    if (!docs.length) {
      return res.status(404).json({ error: 'No matching documents found' });
    }

    const combinedContent = docs.map((d) => `Document: ${d.title}\n${d.content || ''}`).join('\n\n---\n\n');
    const prompt = `Generate a study guide for the following content.\nReturn ONLY valid JSON with this exact structure:\n{\n  "summary": "A 3-4 sentence overview of all content",\n  "key_terms": [\n    { "term": string, "definition": string }\n  ],\n  "key_points": [string, string, string],\n  "quiz": [\n    {\n      "question": string,\n      "options": [string, string, string, string],\n      "correct": number,\n      "explanation": string\n    }\n  ]\n}\nGenerate 8-10 key terms, 5 key points, 5 quiz questions.\nContent: ${combinedContent}`;

    const raw = await ollamaService.chat([{ role: 'user', content: prompt }], 'phi3:mini', false);
    let parsed;
    try {
      parsed = JSON.parse(cleanJsonBlock(raw));
    } catch {
      return res.status(500).json({ error: 'Failed to parse study guide JSON' });
    }

    const safeGuide = {
      summary: String(parsed?.summary || '').trim(),
      key_terms: Array.isArray(parsed?.key_terms) ? parsed.key_terms : [],
      key_points: Array.isArray(parsed?.key_points) ? parsed.key_points : [],
      quiz: Array.isArray(parsed?.quiz) ? parsed.quiz : []
    };

    const title = `Study Guide — ${docs.map((d) => d.title).slice(0, 3).join(', ')}`;
    const chatId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO ai_chats (id, workspace_id, title, messages, model, message_count, rag_used)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      chatId,
      workspace_id,
      title,
      JSON.stringify([
        { role: 'user', content: `Study guide generated for ${docs.length} documents.` },
        { role: 'assistant', content: safeGuide.summary }
      ]),
      'phi3:mini',
      2,
      0
    );

    const summary = String(safeGuide.summary || '').slice(0, 500);
    const createdNode = await createNode(workspace_id, 'ai_chat', title, summary, chatId, {
      model: 'phi3:mini',
      message_count: 2,
      rag_used: 0
    });
    enqueueEmbeddingJob(createdNode.id, buildEmbedText({
      type: 'ai_chat',
      title,
      content_summary: summary,
      metadata: { model: 'phi3:mini', message_count: 2, rag_used: 0 }
    }));

    return res.json(safeGuide);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/embed — Generate an embedding using nomic-embed-text
router.post('/embed', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'text is required' });
    }
    // Return a normalized numeric vector for downstream cosine similarity.
    const embedding = await ollamaService.embed(text);
    res.json({ embedding });
  } catch (err) {
    res.status(500).json({ error: 'Embedding service unavailable. Is Ollama running?', details: err.message });
  }
});

// GET /api/ai/models — List available Ollama models
router.get('/models', async (req, res) => {
  try {
    const models = await ollamaService.listModels();
    res.json({ models });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/image — Generate image via Pollinations.ai
router.get('/image', async (req, res) => {
  try {
    const { prompt, width, height } = req.query;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    // Proxy the image bytes so frontend can consume a blob offline-first style.
    const result = await generateImage(prompt, parseInt(width) || 1024, parseInt(height) || 768);
    res.set('Content-Type', result.contentType);
    res.send(result.buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/image/url — Return direct Pollinations URL for optional client-side linking
router.get('/image/url', async (req, res) => {
  try {
    const { prompt, width, height } = req.query;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    res.json({ url: getImageUrl(prompt, parseInt(width) || 1024, parseInt(height) || 768) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/image/generate — Proxy image generation
router.post('/image/generate', async (req, res) => {
  try {
    const { prompt, width, height } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const result = await generateImage(prompt, width || 1024, height || 768);
    res.set('Content-Type', result.contentType);
    res.send(result.buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/image/variations — Generate 4 variations of a prompt
router.post('/image/variations', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const variations = createVariations(prompt);
    const urls = variations.map(v => getImageUrl(v));
    res.json({ urls, prompts: variations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
