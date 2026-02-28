// Voice routes — Whisper.cpp transcription endpoint
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/database');
const { transcribe, isWhisperAvailable } = require('../services/whisperService');
const { createNode } = require('../services/graphService');
const { v4: uuidv4 } = require('uuid');

// Configure multer for audio file uploads
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/wav', 'audio/wave', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4'];
    cb(null, allowed.includes(file.mimetype) || file.originalname.endsWith('.wav'));
  }
});

// GET /api/voice/status — Check if Whisper is available
router.get('/status', (req, res) => {
  res.json({ available: isWhisperAvailable() });
});

// POST /api/voice/transcribe — Transcribe an audio file via Whisper
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Rename to .wav if needed for whisper.cpp
    const wavPath = req.file.path + '.wav';
    fs.renameSync(req.file.path, wavPath);

    const result = await transcribe(wavPath);

    // Clean up temp file
    try { fs.unlinkSync(wavPath); } catch {}

    if (result.fallback) {
      return res.json({
        transcript: null,
        fallback: true,
        error: result.error || 'Whisper not available'
      });
    }

    // Save voice log if workspace_id provided
    if (req.body.workspace_id && result.transcript) {
      const db = getDb();
      const logId = uuidv4();
      db.prepare(
        'INSERT INTO voice_logs (id, workspace_id, transcript) VALUES (?, ?, ?)'
      ).run(logId, req.body.workspace_id, result.transcript);

      // Add to knowledge graph
      await createNode(req.body.workspace_id, 'voice', 'Voice Note', result.transcript.substring(0, 200), logId);
    }

    res.json({ transcript: result.transcript, fallback: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
