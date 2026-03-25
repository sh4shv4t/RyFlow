// Code file routes — save, list, load, and delete code editor files
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { createNode } = require('../services/graphService');
const { generateAndStoreEmbedding, buildEmbedText } = require('../services/embeddingService');

// Builds code metadata for graph node storage.
function buildCodeMetadata(file) {
  return {
    language: file.language || 'javascript',
    line_count: String(file.content || '').split(/\r?\n/).length
  };
}

// GET /api/code/list?workspace_id={} — list saved code files for a workspace
router.get('/list', (req, res) => {
  try {
    const { workspace_id } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

    const db = getDb();
    const files = db.prepare(
      'SELECT id, workspace_id, title, language, created_by, updated_at, created_at FROM code_files WHERE workspace_id = ? ORDER BY updated_at DESC'
    ).all(workspace_id);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/code/save — create or update a code file and sync graph embedding
router.post('/save', async (req, res) => {
  try {
    const { id, workspace_id, title, content, language, created_by } = req.body;
    if (!workspace_id || !title) {
      return res.status(400).json({ error: 'workspace_id and title are required' });
    }

    const db = getDb();
    const fileId = id || uuidv4();
    const existing = db.prepare('SELECT id FROM code_files WHERE id = ?').get(fileId);

    if (existing) {
      db.prepare(
        'UPDATE code_files SET title = ?, content = ?, language = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(title, content || '', language || 'javascript', fileId);
    } else {
      db.prepare(
        'INSERT INTO code_files (id, workspace_id, title, content, language, created_by) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(fileId, workspace_id, title, content || '', language || 'javascript', created_by || null);
    }

    const saved = db.prepare('SELECT * FROM code_files WHERE id = ?').get(fileId);

    const summary = (saved.content || '').slice(0, 300);
    const metadata = buildCodeMetadata(saved);
    const node = db.prepare('SELECT id FROM nodes WHERE source_id = ? AND type = ?').get(fileId, 'code');
    if (node) {
      db.prepare('UPDATE nodes SET title = ?, content_summary = ?, metadata = ? WHERE id = ?')
        .run(`${saved.title} (${saved.language})`, summary, JSON.stringify(metadata), node.id);
      await generateAndStoreEmbedding(node.id, buildEmbedText({ type: 'code', title: `${saved.title} (${saved.language})`, content_summary: summary, metadata }));
    } else {
      const createdNode = await createNode(workspace_id, 'code', `${saved.title} (${saved.language})`, summary, fileId, metadata);
      await generateAndStoreEmbedding(createdNode.id, buildEmbedText({ type: 'code', title: `${saved.title} (${saved.language})`, content_summary: summary, metadata }));
    }

    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/code/:id — fetch a single code file
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const file = db.prepare('SELECT * FROM code_files WHERE id = ?').get(req.params.id);
    if (!file) return res.status(404).json({ error: 'Code file not found' });
    res.json(file);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/code/:id — delete a code file and linked graph node
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM code_files WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Code file not found' });

    db.prepare('DELETE FROM code_files WHERE id = ?').run(req.params.id);

    const node = db.prepare('SELECT id FROM nodes WHERE source_id = ? AND type = ?').get(req.params.id, 'code');
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
