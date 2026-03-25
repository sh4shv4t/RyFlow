// Tag routes for workspace-level tags and source-node assignments.
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { buildEmbedText } = require('../services/embeddingService');
const { enqueueEmbeddingJob } = require('../services/embeddingQueue');

const router = express.Router();

function resolveNodeId(db, workspaceId, type, sourceId) {
  if (!workspaceId || !type || !sourceId) return null;
  const row = db.prepare(
    'SELECT id FROM nodes WHERE workspace_id = ? AND type = ? AND source_id = ? LIMIT 1'
  ).get(workspaceId, type, sourceId);
  return row?.id || null;
}

function listNodeTags(db, nodeId) {
  if (!nodeId) return [];
  return db.prepare(
    `SELECT t.id, t.name, t.color
     FROM tags t
     JOIN node_tags nt ON nt.tag_id = t.id
     WHERE nt.node_id = ?
     ORDER BY t.name COLLATE NOCASE ASC`
  ).all(nodeId);
}

// GET /api/tags?workspace_id=... — list tags for workspace.
router.get('/', (req, res) => {
  try {
    const { workspace_id } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });
    const db = getDb();
    const tags = db.prepare(
      'SELECT id, workspace_id, name, color, created_at FROM tags WHERE workspace_id = ? ORDER BY name COLLATE NOCASE ASC'
    ).all(workspace_id);
    return res.json({ tags });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/tags — create a workspace tag.
router.post('/', (req, res) => {
  try {
    const { workspace_id, name, color } = req.body;
    const cleanName = String(name || '').trim();
    if (!workspace_id || !cleanName) {
      return res.status(400).json({ error: 'workspace_id and name are required' });
    }

    const db = getDb();
    const existing = db.prepare(
      'SELECT id, workspace_id, name, color, created_at FROM tags WHERE workspace_id = ? AND lower(name) = lower(?)'
    ).get(workspace_id, cleanName);
    if (existing) return res.json(existing);

    const id = uuidv4();
    db.prepare(
      'INSERT INTO tags (id, workspace_id, name, color) VALUES (?, ?, ?, ?)'
    ).run(id, workspace_id, cleanName, color || '#64748b');

    const tag = db.prepare('SELECT id, workspace_id, name, color, created_at FROM tags WHERE id = ?').get(id);
    return res.status(201).json(tag);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tags/:id — delete a tag.
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/tags/by-source?workspace_id=...&type=...&source_id=...
router.get('/by-source', (req, res) => {
  try {
    const { workspace_id, type, source_id } = req.query;
    if (!workspace_id || !type || !source_id) {
      return res.status(400).json({ error: 'workspace_id, type, and source_id are required' });
    }
    const db = getDb();
    const nodeId = resolveNodeId(db, workspace_id, type, source_id);
    if (!nodeId) return res.json({ tags: [] });
    return res.json({ tags: listNodeTags(db, nodeId) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/tags/by-source — replace tag assignments for source node.
router.post('/by-source', (req, res) => {
  try {
    const { workspace_id, type, source_id, tag_ids } = req.body;
    if (!workspace_id || !type || !source_id || !Array.isArray(tag_ids)) {
      return res.status(400).json({ error: 'workspace_id, type, source_id, and tag_ids[] are required' });
    }

    const db = getDb();
    const nodeId = resolveNodeId(db, workspace_id, type, source_id);
    if (!nodeId) return res.status(404).json({ error: 'Node not found for source' });

    const tx = db.transaction((ids) => {
      db.prepare('DELETE FROM node_tags WHERE node_id = ?').run(nodeId);
      const insert = db.prepare('INSERT OR IGNORE INTO node_tags (node_id, tag_id) VALUES (?, ?)');
      ids.forEach((tagId) => {
        const exists = db.prepare('SELECT id FROM tags WHERE id = ? AND workspace_id = ?').get(tagId, workspace_id);
        if (exists) insert.run(nodeId, tagId);
      });
    });
    tx(tag_ids);

    const tags = listNodeTags(db, nodeId);
    const metadataRow = db.prepare('SELECT metadata FROM nodes WHERE id = ?').get(nodeId);
    let metadata = {};
    try {
      metadata = metadataRow?.metadata ? JSON.parse(metadataRow.metadata) : {};
    } catch {
      metadata = {};
    }
    metadata.tags = tags.map((t) => t.name);
    db.prepare('UPDATE nodes SET metadata = ? WHERE id = ?').run(JSON.stringify(metadata), nodeId);
    const node = db.prepare('SELECT type, title, content_summary FROM nodes WHERE id = ?').get(nodeId);
    if (node) {
      enqueueEmbeddingJob(nodeId, buildEmbedText({
        type: node.type,
        title: node.title,
        content_summary: node.content_summary,
        metadata
      }));
    }

    return res.json({ tags });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
