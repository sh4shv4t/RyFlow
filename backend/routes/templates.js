// Template routes for document/chat/task/code/canvas starter content.
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

const router = express.Router();

const BUILTIN_TEMPLATES = [
  {
    id: 'builtin-doc-meeting-notes',
    workspace_id: null,
    type: 'document',
    name: 'Meeting Notes',
    content: '# Meeting Notes\n\n## Agenda\n- \n\n## Decisions\n- \n\n## Action Items\n- [ ] '
  },
  {
    id: 'builtin-doc-project-brief',
    workspace_id: null,
    type: 'document',
    name: 'Project Brief',
    content: '# Project Brief\n\n## Goal\n\n## Scope\n\n## Risks\n\n## Next Steps\n'
  },
  {
    id: 'builtin-chat-retro',
    workspace_id: null,
    type: 'chat',
    name: 'Sprint Retro Prompt',
    content: 'Help me run a sprint retrospective. Ask me for wins, blockers, and improvements, then summarize action items.'
  }
];

// GET /api/templates?workspace_id=...&type=...
router.get('/', (req, res) => {
  try {
    const { workspace_id, type } = req.query;
    const db = getDb();

    const rows = workspace_id
      ? db.prepare(
        `SELECT id, workspace_id, type, name, content, created_by, shared, created_at
         FROM templates
         WHERE (workspace_id = ? OR shared = 1)
           AND (? IS NULL OR type = ?)
         ORDER BY created_at DESC`
      ).all(workspace_id, type || null, type || null)
      : db.prepare(
        `SELECT id, workspace_id, type, name, content, created_by, shared, created_at
         FROM templates
         WHERE (? IS NULL OR type = ?)
         ORDER BY created_at DESC`
      ).all(type || null, type || null);

    const builtins = BUILTIN_TEMPLATES.filter((t) => !type || t.type === type);
    return res.json({ templates: [...builtins, ...rows] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/templates
router.post('/', (req, res) => {
  try {
    const { workspace_id, type, name, content, created_by, shared } = req.body;
    if (!type || !name || !content) {
      return res.status(400).json({ error: 'type, name, and content are required' });
    }

    const db = getDb();
    const id = uuidv4();
    db.prepare(
      `INSERT INTO templates (id, workspace_id, type, name, content, created_by, shared)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, workspace_id || null, type, name, content, created_by || null, shared ? 1 : 0);

    const template = db.prepare(
      'SELECT id, workspace_id, type, name, content, created_by, shared, created_at FROM templates WHERE id = ?'
    ).get(id);
    return res.status(201).json(template);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/templates/:id
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM templates WHERE id = ?').run(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
