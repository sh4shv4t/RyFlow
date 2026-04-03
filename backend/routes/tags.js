// Workspace tag routes with node-level assignment and filtered graph view.
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { parseMetadata } = require('../services/embeddingService');
const { enqueueEmbeddingJob } = require('../services/embeddingQueue');

const router = express.Router();

function ensureTagTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#64748b',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS node_tags (
      node_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (node_id, tag_id),
      FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_workspace_name ON tags(workspace_id, name);
    CREATE INDEX IF NOT EXISTS idx_node_tags_tag_node ON node_tags(tag_id, node_id);
  `);
}

function normalizeType(type) {
  const value = String(type || '').toLowerCase();
  if (value === 'document' || value === 'docs') return 'doc';
  if (value === 'tasks') return 'task';
  return value;
}

function listNodeTags(db, nodeId) {
  return db.prepare(
    `SELECT t.id, t.name, t.color
     FROM tags t
     JOIN node_tags nt ON nt.tag_id = t.id
     WHERE nt.node_id = ?
     ORDER BY t.name COLLATE NOCASE ASC`
  ).all(nodeId);
}

function syncNodeMetadataTags(db, nodeId) {
  const node = db.prepare('SELECT id, workspace_id, type, title, content_summary, metadata FROM nodes WHERE id = ?').get(nodeId);
  if (!node) return;
  const tags = listNodeTags(db, nodeId);
  const metadata = { ...parseMetadata(node.metadata), tags: tags.map((t) => t.name) };
  db.prepare('UPDATE nodes SET metadata = ? WHERE id = ?').run(JSON.stringify(metadata), nodeId);
  enqueueEmbeddingJob(nodeId, node.workspace_id);
}

// GET /api/tags?workspace_id=... — List workspace tags.
router.get('/', (req, res) => {
  try {
    const workspaceId = req.query.workspace_id;
    if (!workspaceId) return res.status(400).json({ error: 'workspace_id is required' });
    const db = getDb();
    ensureTagTables(db);
    const tags = db.prepare(
      'SELECT id, workspace_id, name, color, created_at FROM tags WHERE workspace_id = ? ORDER BY name COLLATE NOCASE ASC'
    ).all(workspaceId);
    return res.json(tags);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/tags — Create a workspace tag.
router.post('/', (req, res) => {
  try {
    const { workspace_id, name, color } = req.body || {};
    if (!workspace_id || !String(name || '').trim()) {
      return res.status(400).json({ error: 'workspace_id and name are required' });
    }

    const db = getDb();
    ensureTagTables(db);
    const id = uuidv4();
    db.prepare('INSERT INTO tags (id, workspace_id, name, color) VALUES (?, ?, ?, ?)')
      .run(id, workspace_id, String(name).trim(), color || '#64748b');

    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(id);
    return res.status(201).json(tag);
  } catch (err) {
    if (/UNIQUE constraint failed/i.test(String(err.message || ''))) {
      return res.status(409).json({ error: 'Tag already exists in this workspace' });
    }
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/tags/by-source?workspace_id=...&type=...&source_id=... — List tags for one item.
router.get('/by-source', (req, res) => {
  try {
    const workspaceId = req.query.workspace_id;
    const sourceId = req.query.source_id;
    const type = normalizeType(req.query.type);
    if (!workspaceId || !sourceId || !type) {
      return res.status(400).json({ error: 'workspace_id, type, and source_id are required' });
    }

    const db = getDb();
    ensureTagTables(db);
    const node = db.prepare(
      'SELECT id FROM nodes WHERE workspace_id = ? AND type = ? AND source_id = ? LIMIT 1'
    ).get(workspaceId, type, sourceId);

    if (!node) return res.json({ tags: [] });
    return res.json({ tags: listNodeTags(db, node.id) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/tags/assign — Replace tags assigned to one source item.
router.post('/assign', (req, res) => {
  try {
    const { workspace_id, type, source_id, tag_ids } = req.body || {};
    const normalizedType = normalizeType(type);
    if (!workspace_id || !normalizedType || !source_id || !Array.isArray(tag_ids)) {
      return res.status(400).json({ error: 'workspace_id, type, source_id, and tag_ids[] are required' });
    }

    const db = getDb();
    ensureTagTables(db);
    const node = db.prepare(
      'SELECT id FROM nodes WHERE workspace_id = ? AND type = ? AND source_id = ? LIMIT 1'
    ).get(workspace_id, normalizedType, source_id);
    if (!node) return res.status(404).json({ error: 'Node not found for item' });

    const allowedTags = db.prepare(
      `SELECT id FROM tags
       WHERE workspace_id = ? AND id IN (${tag_ids.map(() => '?').join(',') || "''"})`
    ).all(workspace_id, ...tag_ids).map((row) => row.id);

    db.prepare('DELETE FROM node_tags WHERE node_id = ?').run(node.id);
    const insert = db.prepare('INSERT OR IGNORE INTO node_tags (node_id, tag_id) VALUES (?, ?)');
    allowedTags.forEach((tagId) => insert.run(node.id, tagId));

    syncNodeMetadataTags(db, node.id);
    return res.json({ success: true, tags: listNodeTags(db, node.id) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tags/assign/:source_id/:tag_id — Remove one source-tag link.
router.delete('/assign/:source_id/:tag_id', (req, res) => {
  try {
    const db = getDb();
    ensureTagTables(db);
    const { source_id, tag_id } = req.params;

    const node = db.prepare('SELECT id FROM nodes WHERE source_id = ?').get(source_id);
    if (node) {
      db.prepare('DELETE FROM node_tags WHERE node_id = ? AND tag_id = ?').run(node.id, tag_id);
      syncNodeMetadataTags(db, node.id);
    }

    return res.json({ success: true });
  } catch (err) {
    return res.json({ success: false });
  }
});

// GET /api/tags/filter?workspace_id=...&tag_id=...&type=... — Filter nodes by tag.
router.get('/filter', (req, res) => {
  try {
    const workspaceId = req.query.workspace_id;
    const tagId = req.query.tag_id;
    const type = req.query.type ? normalizeType(req.query.type) : null;
    if (!workspaceId || !tagId) {
      return res.status(400).json({ error: 'workspace_id and tag_id are required' });
    }

    const db = getDb();
    ensureTagTables(db);
    const nodes = db.prepare(
      `SELECT n.id, n.type, n.title, n.content_summary, n.source_id, n.created_at
       FROM nodes n
       JOIN node_tags nt ON nt.node_id = n.id
       WHERE n.workspace_id = ? AND nt.tag_id = ?
         AND (? IS NULL OR n.type = ?)
       ORDER BY n.created_at DESC
       LIMIT 300`
    ).all(workspaceId, tagId, type, type);

    return res.json({ items: nodes });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tags/:id — Delete tag and all node mappings.
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    ensureTagTables(db);
    const tag = db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id);
    if (!tag) return res.status(404).json({ error: 'Tag not found' });
    db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
