// Document CRUD routes — list, create, read, update documents
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { createNode } = require('../services/graphService');
const { generateAndStoreEmbedding, buildEmbedText } = require('../services/embeddingService');
const { v4: uuidv4 } = require('uuid');

// Builds document node metadata for graph context.
function buildDocMetadata(content, lastEditor) {
  const text = String(content || '').replace(/<[^>]+>/g, ' ');
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { word_count: wordCount, last_editor: lastEditor || null };
}

// GET /api/docs — List all documents in a workspace
router.get('/', (req, res) => {
  try {
    const { workspace_id } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

    const db = getDb();
    const docs = db.prepare(
      'SELECT id, workspace_id, title, created_by, updated_at, created_at FROM documents WHERE workspace_id = ? ORDER BY updated_at DESC'
    ).all(workspace_id);
    res.json({ documents: docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/docs — Create a new document
router.post('/', async (req, res) => {
  try {
    const { workspace_id, title, content, created_by } = req.body;
    if (!workspace_id || !title) {
      return res.status(400).json({ error: 'workspace_id and title are required' });
    }

    const db = getDb();
    const id = uuidv4();
    db.prepare(
      'INSERT INTO documents (id, workspace_id, title, content, created_by) VALUES (?, ?, ?, ?, ?)'
    ).run(id, workspace_id, title, content || '', created_by || null);

    // Add to knowledge graph
    const metadata = buildDocMetadata(content || '', created_by || null);
    await createNode(workspace_id, 'doc', title, (content || '').substring(0, 500), id, metadata);

    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/docs/:id — Get a single document by ID
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/docs/:id — Update a document's content and/or title
router.put('/:id', async (req, res) => {
  try {
    const { title, content, last_editor } = req.body;
    const db = getDb();

    const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Document not found' });

    db.prepare(
      'UPDATE documents SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(title || existing.title, content !== undefined ? content : existing.content, req.params.id);

    // Update knowledge graph node
    const node = db.prepare('SELECT id FROM nodes WHERE source_id = ? AND type = ?').get(req.params.id, 'doc');
    if (node) {
      const nextTitle = title || existing.title;
      const nextContent = content !== undefined ? content : existing.content;
      const metadata = buildDocMetadata(nextContent, last_editor || null);
      db.prepare('UPDATE nodes SET title = ?, content_summary = ? WHERE id = ?')
        .run(nextTitle, (nextContent || '').substring(0, 500), node.id);
      db.prepare('UPDATE nodes SET metadata = ? WHERE id = ?').run(JSON.stringify(metadata), node.id);
      // Refresh semantic embedding whenever document content changes.
      await generateAndStoreEmbedding(node.id, buildEmbedText({
        type: 'doc',
        title: nextTitle,
        content_summary: (nextContent || '').substring(0, 500),
        metadata
      }));
    }

    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/docs/:id — Delete a document
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Document not found' });

    db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);

    // Clean up graph node
    const node = db.prepare('SELECT id FROM nodes WHERE source_id = ? AND type = ?').get(req.params.id, 'doc');
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
