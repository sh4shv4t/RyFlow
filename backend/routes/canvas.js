const express = require('express');
const { v4: uuidv4 } = require('uuid');
const LZString = require('lz-string');
const { getDb, getActiveWorkspaceId } = require('../db/database');
const { enqueueEmbeddingJob } = require('../services/embeddingQueue');

const router = express.Router();

function safeJsonString(value, fallbackJSON) {
  if (typeof value === 'string') {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return fallbackJSON;
    }
  }

  try {
    return JSON.stringify(value);
  } catch {
    return fallbackJSON;
  }
}

function compressText(raw) {
  return LZString.compressToUTF16(String(raw || ''));
}

function decodeCanvasJSON(raw, fallback) {
  const str = String(raw || '');

  const parseJson = (value) => {
    if (!value || typeof value !== 'string') return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const tryDecode = (decoder) => {
    try {
      const parsed = parseJson(decoder(str));
      return parsed;
    } catch {
      return null;
    }
  };

  const utf16Decoded = tryDecode((v) => LZString.decompressFromUTF16(v));
  if (utf16Decoded !== null) return utf16Decoded;

  const base64Decoded = tryDecode((v) => LZString.decompressFromBase64(v));
  if (base64Decoded !== null) return base64Decoded;

  const encodedUriDecoded = tryDecode((v) => LZString.decompressFromEncodedURIComponent(v));
  if (encodedUriDecoded !== null) return encodedUriDecoded;

  const legacyDecoded = tryDecode((v) => LZString.decompress(v));
  if (legacyDecoded !== null) return legacyDecoded;

  const rawJson = parseJson(str);
  if (rawJson !== null) return rawJson;

  try {
    return JSON.parse(fallback);
  } catch {
    return fallback;
  }
}

function resolveWorkspaceId(db, requestedWorkspaceId) {
  const requested = String(requestedWorkspaceId || '').trim();
  if (requested) {
    const foundRequested = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(requested);
    if (foundRequested?.id) return foundRequested.id;
  }

  const activeId = getActiveWorkspaceId();
  if (activeId) {
    const foundActive = db.prepare('SELECT id FROM workspaces WHERE id = ?').get(activeId);
    if (foundActive?.id) return foundActive.id;
  }

  const fallback = db.prepare(
    `SELECT id FROM workspaces
     ORDER BY last_accessed DESC, created_at DESC
     LIMIT 1`
  ).get();
  return fallback?.id || null;
}

// GET /api/canvas/list?workspace_id={} — plain canvas list.
router.get('/list', (req, res) => {
  try {
    const { workspace_id } = req.query;
    if (!workspace_id) {
      return res.status(400).json({ error: 'workspace_id is required' });
    }

    const db = getDb();
    const resolvedWorkspaceId = resolveWorkspaceId(db, workspace_id);
    if (!resolvedWorkspaceId) {
      return res.status(400).json({ error: 'No workspace available' });
    }
    const canvases = db.prepare(
      `SELECT id, title, updated_at, created_at
       FROM canvases
       WHERE workspace_id = ?
       ORDER BY updated_at DESC`
    ).all(resolvedWorkspaceId);

    return res.json(canvases);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/canvas/:id — full canvas with decompressed payload.
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const canvas = db.prepare(
      'SELECT * FROM canvases WHERE id = ?'
    ).get(req.params.id);

    console.log('[Canvas GET]',
      'id:', req.params.id,
      'found:', !!canvas,
      'elements in DB:',
      canvas?.elements ? canvas.elements.length : 0
    );

    if (!canvas) {
      return res.status(404).json({ error: 'Canvas not found' });
    }

    const decodedElements = decodeCanvasJSON(canvas.elements, '[]');
    const decodedAppState = decodeCanvasJSON(canvas.app_state, '{}');

    console.log('[Canvas GET decompressed]',
      'elements count:',
      Array.isArray(decodedElements) ? decodedElements.length : 'ERROR',
      'appState keys:',
      Object.keys(decodedAppState || {}).length
    );

    return res.json({
      ...canvas,
      elements: Array.isArray(decodedElements) ? decodedElements : [],
      app_state: (decodedAppState && typeof decodedAppState === 'object') ? decodedAppState : {},
      appState: (decodedAppState && typeof decodedAppState === 'object') ? decodedAppState : {}
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/canvas/save — upsert compressed canvas.
router.post('/save', (req, res) => {
  console.log('[Canvas backend save]',
    'id:', req.body.id,
    'elements type:', typeof req.body.elements,
    'elements length:',
    typeof req.body.elements === 'string'
      ? req.body.elements.length : 'not string',
    'elements preview:',
    typeof req.body.elements === 'string'
      ? req.body.elements.substring(0, 80) : req.body.elements
  );

  try {
    const {
      id,
      workspace_id,
      title,
      elements,
      app_state,
      appState,
      created_by
    } = req.body || {};

    if (!workspace_id || !title) {
      return res.status(400).json({ error: 'workspace_id and title are required' });
    }

    const db = getDb();
    const resolvedWorkspaceId = resolveWorkspaceId(db, workspace_id);
    if (!resolvedWorkspaceId) {
      return res.status(400).json({ error: 'No workspace available' });
    }
    const canvasId = id || uuidv4();
    const elementsText = safeJsonString(elements ?? [], '[]');
    const appStateText = safeJsonString(app_state ?? appState ?? {}, '{}');

    db.prepare(
      `INSERT OR REPLACE INTO canvases
       (id, workspace_id, title, elements, app_state, created_by, updated_at, created_at)
       VALUES (
         ?,
         COALESCE((SELECT workspace_id FROM canvases WHERE id = ?), ?),
         ?,
         ?,
         ?,
         COALESCE((SELECT created_by FROM canvases WHERE id = ?), ?),
         CURRENT_TIMESTAMP,
         COALESCE((SELECT created_at FROM canvases WHERE id = ?), CURRENT_TIMESTAMP)
       )`
    ).run(
      canvasId,
      canvasId,
      resolvedWorkspaceId,
      title,
      compressText(elementsText),
      compressText(appStateText),
      canvasId,
      created_by || null,
      canvasId
    );

    const savedRow = db.prepare(
      'SELECT id, title, LENGTH(elements) as elem_len FROM canvases WHERE id = ?'
    ).get(canvasId);

    console.log('[Canvas saved to DB]',
      'id:', savedRow?.id,
      'elements bytes in DB:', savedRow?.elem_len
    );

    const saved = db.prepare(
      'SELECT id, title, updated_at FROM canvases WHERE id = ?'
    ).get(canvasId);

    const summary = `Canvas: ${title}`;
    const node = db.prepare('SELECT id FROM nodes WHERE source_id = ? AND type = ?').get(canvasId, 'canvas');
    if (node) {
      db.prepare('UPDATE nodes SET title = ?, content_summary = ? WHERE id = ?').run(title, summary, node.id);
      enqueueEmbeddingJob(node.id, resolvedWorkspaceId);
    } else {
      const nodeId = uuidv4();
      db.prepare(
        `INSERT INTO nodes (id, workspace_id, type, title, content_summary, source_id)
         VALUES (?, ?, 'canvas', ?, ?, ?)`
      ).run(nodeId, resolvedWorkspaceId, title, summary, canvasId);
      enqueueEmbeddingJob(nodeId, resolvedWorkspaceId);
    }

    return res.json(saved || { id: canvasId, title, updated_at: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/canvas/:id — delete canvas and linked node by source_id.
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const existing = db.prepare('SELECT id FROM canvases WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Canvas not found' });
    }

    db.prepare('DELETE FROM canvases WHERE id = ?').run(id);
    db.prepare('DELETE FROM nodes WHERE source_id = ?').run(id);

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
