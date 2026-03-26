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
  const configured = process.env.WHISPER_PATH || path.join(__dirname, '..', '..', 'whisper.cpp', process.platform === 'win32' ? 'main.exe' : 'main');
  const fallbackWinPath = process.platform === 'win32' ? `${configured}.exe` : configured;
  const resolvedPath = fs.existsSync(configured) ? configured : (fs.existsSync(fallbackWinPath) ? fallbackWinPath : null);
  res.json({ available: isWhisperAvailable(), path: resolvedPath });
});

// POST /api/voice/transcribe — Transcribe an audio file via Whisper
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Preserve the original extension so whisper receives a real file format.
    const ext = path.extname(req.file.originalname || '') || '.wav';
    const tempPath = `${req.file.path}${ext}`;
    fs.renameSync(req.file.path, tempPath);

    const result = await transcribe(tempPath);

    // Clean up temp file
    try { fs.unlinkSync(tempPath); } catch {}

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
      // Persist transcript metadata while keeping deleted temp file paths out of SQLite.
      db.prepare(
        'INSERT INTO voice_logs (id, workspace_id, transcript, audio_path) VALUES (?, ?, ?, ?)'
      ).run(logId, req.body.workspace_id, result.transcript, null);

      // Add to knowledge graph
      await createNode(req.body.workspace_id, 'voice', 'Voice Note', result.transcript.substring(0, 200), logId);
    }

    res.json({ transcript: result.transcript, fallback: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
