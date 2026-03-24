// Canvas routes — save, list, load, and delete visual canvases
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { createNode } = require('../services/graphService');
const { generateAndStoreEmbedding } = require('../services/embeddingService');

// Builds canonical graph summary for a saved canvas.
function buildCanvasSummary(canvas) {
  let elementCount = 0;
  try {
    const parsed = JSON.parse(canvas.elements || '[]');
    elementCount = Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    elementCount = 0;
  }
  const dateText = canvas.updated_at || canvas.created_at || new Date().toISOString();
  return `Visual canvas with ${elementCount} elements. Created: ${new Date(dateText).toISOString()}`;
}

// GET /api/canvas/list?workspace_id={} — list saved canvases for a workspace
router.get('/list', (req, res) => {
  try {
    const { workspace_id } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

    const db = getDb();
    const canvases = db.prepare(
      'SELECT id, workspace_id, title, thumbnail, created_by, updated_at, created_at FROM canvases WHERE workspace_id = ? ORDER BY updated_at DESC'
    ).all(workspace_id);
    res.json({ canvases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/canvas/save — create or update canvas data and sync graph embedding
router.post('/save', async (req, res) => {
  try {
    const { id, workspace_id, title, elements, app_state, thumbnail, created_by } = req.body;
    if (!workspace_id || !title) {
      return res.status(400).json({ error: 'workspace_id and title are required' });
    }

    const db = getDb();
    const canvasId = id || uuidv4();
    const existing = db.prepare('SELECT id FROM canvases WHERE id = ?').get(canvasId);

    if (existing) {
      db.prepare(
        'UPDATE canvases SET title = ?, elements = ?, app_state = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(title, elements || '[]', app_state || '{}', thumbnail || null, canvasId);
    } else {
      db.prepare(
        'INSERT INTO canvases (id, workspace_id, title, elements, app_state, thumbnail, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(canvasId, workspace_id, title, elements || '[]', app_state || '{}', thumbnail || null, created_by || null);
    }

    const saved = db.prepare('SELECT * FROM canvases WHERE id = ?').get(canvasId);
    const summary = buildCanvasSummary(saved);

    const node = db.prepare('SELECT id FROM nodes WHERE source_id = ? AND type = ?').get(canvasId, 'canvas');
    if (node) {
      db.prepare('UPDATE nodes SET title = ?, content_summary = ? WHERE id = ?').run(saved.title, summary, node.id);
      await generateAndStoreEmbedding(node.id, `${saved.title}. ${summary}`);
    } else {
      const createdNode = await createNode(workspace_id, 'canvas', saved.title, summary, canvasId);
      await generateAndStoreEmbedding(createdNode.id, `${saved.title}. ${summary}`);
    }

    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/canvas/:id — fetch a single canvas
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const canvas = db.prepare('SELECT * FROM canvases WHERE id = ?').get(req.params.id);
    if (!canvas) return res.status(404).json({ error: 'Canvas not found' });
    res.json(canvas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/canvas/:id — delete a canvas and linked graph node
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM canvases WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Canvas not found' });

    db.prepare('DELETE FROM canvases WHERE id = ?').run(req.params.id);

    const node = db.prepare('SELECT id FROM nodes WHERE source_id = ? AND type = ?').get(req.params.id, 'canvas');
    if (node) {
      db.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?').run(node.id, node.id);
      db.prepare('DELETE FROM nodes WHERE id = ?').run(node.id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
