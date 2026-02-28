// AI routes — LLM chat, embeddings, image generation, system status
const express = require('express');
const router = express.Router();
const { execSync } = require('child_process');
const ollamaService = require('../services/ollamaService');
const { getImageUrl, generateImage, createVariations } = require('../services/imageService');

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
    const { messages, model } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }
    const response = await ollamaService.chat(messages, model || 'phi3:mini', false);
    res.json({ content: response });
  } catch (err) {
    res.status(500).json({ error: 'AI service unavailable. Is Ollama running?', details: err.message });
  }
});

// POST /api/ai/chat/stream — SSE streaming chat with Ollama
router.post('/chat/stream', async (req, res) => {
  try {
    const { messages, model } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const stream = await ollamaService.chat(messages, model || 'phi3:mini', true);

    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      // Ollama streams newline-delimited JSON
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line in buffer
      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            const text = parsed.message?.content || '';
            if (text) {
              res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
            if (parsed.done) {
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
          if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
        } catch {}
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });

    stream.on('error', (err) => {
      console.error('[AI Stream] Error:', err.message);
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
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

    const url = getImageUrl(prompt, parseInt(width) || 1024, parseInt(height) || 768);
    res.json({ url });
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
