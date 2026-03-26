// Document comment routes with threaded replies and resolve state.
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

const router = express.Router();

// Builds nested threaded comments from flat comment rows.
function buildThread(rows = []) {
  const byId = new Map();
  rows.forEach((row) => byId.set(row.id, { ...row, replies: [] }));
  const topLevel = [];

  rows.forEach((row) => {
    const current = byId.get(row.id);
    if (row.parent_id && byId.has(row.parent_id)) {
      byId.get(row.parent_id).replies.push(current);
    } else {
      topLevel.push(current);
    }
  });

  return topLevel;
}

// GET /api/comments/:document_id — Lists comments in threaded shape.
router.get('/:document_id', (req, res) => {
  try {
    const includeResolved = String(req.query.include_resolved || 'false') === 'true';
    const db = getDb();
    const where = includeResolved ? '' : 'AND resolved = 0';
    const rows = db.prepare(
      `SELECT * FROM doc_comments
       WHERE document_id = ? ${where}
       ORDER BY datetime(created_at) ASC`
    ).all(req.params.document_id);

    return res.json({ comments: buildThread(rows) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/comments — Creates a new top-level comment or reply.
router.post('/', (req, res) => {
  try {
    const {
      document_id,
      workspace_id,
      author_name,
      content,
      selected_text,
      position_from,
      position_to,
      parent_id
    } = req.body || {};

    if (!document_id || !workspace_id || !author_name || !String(content || '').trim()) {
      return res.status(400).json({ error: 'document_id, workspace_id, author_name, and content are required' });
    }

    const db = getDb();
    const id = uuidv4();
    db.prepare(
      `INSERT INTO doc_comments
       (id, document_id, workspace_id, author_name, content, selected_text, position_from, position_to, parent_id, resolved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(
      id,
      document_id,
      workspace_id,
      String(author_name).trim(),
      String(content).trim(),
      selected_text || null,
      Number.isFinite(Number(position_from)) ? Number(position_from) : null,
      Number.isFinite(Number(position_to)) ? Number(position_to) : null,
      parent_id || null
    );

    const created = db.prepare('SELECT * FROM doc_comments WHERE id = ?').get(id);
    return res.status(201).json(created);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/comments/:id/resolve — Toggles resolved status.
router.patch('/:id/resolve', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM doc_comments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Comment not found' });

    const nextResolved = existing.resolved ? 0 : 1;
    db.prepare('UPDATE doc_comments SET resolved = ? WHERE id = ?').run(nextResolved, req.params.id);
    const updated = db.prepare('SELECT * FROM doc_comments WHERE id = ?').get(req.params.id);
    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/comments/:id — Deletes a comment and child replies.
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM doc_comments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Comment not found' });

    db.prepare('DELETE FROM doc_comments WHERE id = ? OR parent_id = ?').run(req.params.id, req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
