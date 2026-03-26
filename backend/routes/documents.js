// Document CRUD routes — list, create, read, update documents
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { createNode } = require('../services/graphService');
const { buildEmbedText } = require('../services/embeddingService');
const { enqueueEmbeddingJob } = require('../services/embeddingQueue');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Builds document node metadata for graph context.
function buildDocMetadata(content, lastEditor) {
  const text = String(content || '').replace(/<[^>]+>/g, ' ');
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  return { word_count: wordCount, last_editor: lastEditor || null };
}

function normalizeDateKey(inputDate) {
  const value = String(inputDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
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

function appendTagsToDocuments(db, docs = []) {
  if (!docs.length) return docs;
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const placeholders = docs.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT n.source_id AS document_id, t.id, t.name, t.color
     FROM nodes n
     JOIN node_tags nt ON nt.node_id = n.id
     JOIN tags t ON t.id = nt.tag_id
     WHERE n.type = 'doc' AND n.source_id IN (${placeholders})`
  ).all(...docs.map((d) => d.id));

  rows.forEach((row) => {
    const target = byId.get(row.document_id);
    if (!target) return;
    if (!target.tags) target.tags = [];
    target.tags.push({ id: row.id, name: row.name, color: row.color });
  });

  docs.forEach((doc) => {
    if (!doc.tags) doc.tags = [];
  });
  return docs;
}

function saveVersionSnapshot(db, doc, editorId) {
  const nextVersion = db.prepare(
    'SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM document_versions WHERE document_id = ?'
  ).get(doc.id).next_version;
  db.prepare(
    'INSERT INTO document_versions (id, document_id, title, content, version_number, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(uuidv4(), doc.id, doc.title, doc.content, nextVersion, editorId || null);
}

function updateDocNode(db, documentId, title, content, metadata) {
  const node = db.prepare('SELECT id, metadata FROM nodes WHERE source_id = ? AND type = ?').get(documentId, 'doc');
  if (!node) return null;

  const tags = listNodeTags(db, node.id);
  const mergedMetadata = { ...metadata, tags: tags.map((t) => t.name) };
  db.prepare('UPDATE nodes SET title = ?, content_summary = ?, metadata = ? WHERE id = ?')
    .run(title, (content || '').substring(0, 500), JSON.stringify(mergedMetadata), node.id);

  enqueueEmbeddingJob(node.id, buildEmbedText({
    type: 'doc',
    title,
    content_summary: (content || '').substring(0, 500),
    metadata: mergedMetadata
  }));
  return node.id;
}

// Safely parses stored TipTap JSON payloads.
function parseDocContentJSON(content) {
  if (!content) return null;
  if (typeof content === 'object') return content;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// Walks TipTap JSON tree and collects mention node ids.
function extractMentions(content) {
  const mentions = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'mention' && node.attrs?.id) {
      mentions.push(String(node.attrs.id));
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  }
  if (Array.isArray(content?.content)) content.content.forEach(walk);
  return Array.from(new Set(mentions));
}

// Ensures graph edges exist from current doc node to each mentioned node.
function upsertMentionEdges(db, docNodeId, mentionNodeIds = []) {
  if (!docNodeId || !mentionNodeIds.length) return;

  mentionNodeIds.forEach((mentionedId) => {
    const target = db.prepare('SELECT id FROM nodes WHERE id = ?').get(mentionedId);
    if (!target || target.id === docNodeId) return;

    const existing = db.prepare(
      'SELECT id FROM edges WHERE source_id = ? AND target_id = ?'
    ).get(docNodeId, mentionedId);

    if (!existing) {
      db.prepare(
        `INSERT INTO edges (id, source_id, target_id, relationship_label, weight)
         VALUES (?, ?, ?, 'mentions', 1.0)`
      ).run(crypto.randomUUID(), docNodeId, mentionedId);
    }
  });
}

// GET /api/docs — List all documents in a workspace
router.get('/', (req, res) => {
  try {
    const { workspace_id } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

    const db = getDb();
    const docs = db.prepare(
      'SELECT id, workspace_id, title, content, is_daily_note, daily_note_date, created_by, updated_at, created_at FROM documents WHERE workspace_id = ? ORDER BY updated_at DESC'
    ).all(workspace_id);
    appendTagsToDocuments(db, docs);
    res.json({ documents: docs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/docs/daily — Fetch or auto-create a daily note for a date.
router.get('/daily', async (req, res) => {
  try {
    const { workspace_id, created_by } = req.query;
    const date = normalizeDateKey(req.query.date);
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

    const db = getDb();
    let doc = db.prepare(
      `SELECT * FROM documents
       WHERE workspace_id = ? AND is_daily_note = 1 AND daily_note_date = ?
       LIMIT 1`
    ).get(workspace_id, date);

    if (!doc) {
      const id = uuidv4();
      const title = `Daily Note - ${date}`;
      db.prepare(
        `INSERT INTO documents (id, workspace_id, title, content, is_daily_note, daily_note_date, created_by)
         VALUES (?, ?, ?, ?, 1, ?, ?)`
      ).run(id, workspace_id, title, '', date, created_by || null);

      const metadata = {
        ...buildDocMetadata('', created_by || null),
        is_daily_note: true,
        daily_note_date: date
      };
      await createNode(workspace_id, 'doc', title, '', id, metadata);
      doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    }

    appendTagsToDocuments(db, [doc]);
    return res.json(doc);
  } catch (err) {
    return res.status(500).json({ error: err.message });
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
      'INSERT INTO documents (id, workspace_id, title, content, is_daily_note, daily_note_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, workspace_id, title, content || '', 0, null, created_by || null);

    // Add to knowledge graph
    const metadata = { ...buildDocMetadata(content || '', created_by || null), is_daily_note: false, daily_note_date: null };
    await createNode(workspace_id, 'doc', title, (content || '').substring(0, 500), id, metadata);

    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    appendTagsToDocuments(db, [doc]);
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/docs/:id/versions — List saved versions for a document.
router.get('/:id/versions', (req, res) => {
  try {
    const db = getDb();
    const versions = db.prepare(
      `SELECT id, document_id, title, version_number, created_by, created_at
       FROM document_versions
       WHERE document_id = ?
       ORDER BY version_number DESC`
    ).all(req.params.id);
    return res.json({ versions });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/docs/:id/versions/:versionId — Get a specific version payload.
router.get('/:id/versions/:versionId', (req, res) => {
  try {
    const db = getDb();
    const version = db.prepare(
      'SELECT * FROM document_versions WHERE id = ? AND document_id = ?'
    ).get(req.params.versionId, req.params.id);
    if (!version) return res.status(404).json({ error: 'Version not found' });
    return res.json(version);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/docs/:id/versions/:versionId/restore — Restore an older version.
router.post('/:id/versions/:versionId/restore', (req, res) => {
  try {
    const { last_editor } = req.body || {};
    const db = getDb();
    const existing = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Document not found' });

    const version = db.prepare(
      'SELECT * FROM document_versions WHERE id = ? AND document_id = ?'
    ).get(req.params.versionId, req.params.id);
    if (!version) return res.status(404).json({ error: 'Version not found' });

    saveVersionSnapshot(db, existing, last_editor || null);
    db.prepare(
      'UPDATE documents SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(version.title || existing.title, version.content || '', req.params.id);

    const restored = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    const metadata = {
      ...buildDocMetadata(restored.content || '', last_editor || null),
      is_daily_note: Boolean(restored.is_daily_note),
      daily_note_date: restored.daily_note_date || null
    };
    updateDocNode(db, restored.id, restored.title, restored.content || '', metadata);
    appendTagsToDocuments(db, [restored]);
    return res.json(restored);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/docs/:id — Get a single document by ID
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    appendTagsToDocuments(db, [doc]);
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

    const nextTitle = title || existing.title;
    const nextContent = content !== undefined ? content : existing.content;
    const changed = nextTitle !== existing.title || nextContent !== existing.content;

    if (changed) {
      saveVersionSnapshot(db, existing, last_editor || null);
    }

    db.prepare(
      'UPDATE documents SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(nextTitle, nextContent, req.params.id);

    const metadata = {
      ...buildDocMetadata(nextContent, last_editor || null),
      is_daily_note: Boolean(existing.is_daily_note),
      daily_note_date: existing.daily_note_date || null
    };
    const docNodeId = updateDocNode(db, req.params.id, nextTitle, nextContent, metadata);

    const jsonContent = parseDocContentJSON(nextContent);
    const mentionedIds = extractMentions(jsonContent);
    upsertMentionEdges(db, docNodeId, mentionedIds);

    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id);
    appendTagsToDocuments(db, [doc]);
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
