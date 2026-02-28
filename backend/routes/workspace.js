// Workspace management routes — CRUD + user registration + activity + sustainability
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

// POST /api/workspace — Create a new workspace
router.post('/', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const db = getDb();
    const id = uuidv4();
    db.prepare('INSERT INTO workspaces (id, name) VALUES (?, ?)').run(id, name);
    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    res.status(201).json(workspace);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace — List all workspaces
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const workspaces = db.prepare('SELECT * FROM workspaces ORDER BY created_at DESC').all();
    res.json({ workspaces });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/:id — Get workspace details
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const workspace = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(req.params.id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    res.json(workspace);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workspace/user — Register a user in a workspace
router.post('/user', (req, res) => {
  try {
    const { name, workspace_id, avatar_color, language } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const db = getDb();
    const id = uuidv4();
    db.prepare(
      'INSERT INTO users (id, name, workspace_id, avatar_color, language) VALUES (?, ?, ?, ?, ?)'
    ).run(id, name, workspace_id || null, avatar_color || '#E8000D', language || 'en');

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/:id/stats — Get workspace statistics for dashboard
router.get('/:id/stats', (req, res) => {
  try {
    const db = getDb();
    const wid = req.params.id;

    const docCount = db.prepare('SELECT COUNT(*) as count FROM documents WHERE workspace_id = ?').get(wid).count;
    const taskCount = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE workspace_id = ?').get(wid).count;
    const nodeCount = db.prepare('SELECT COUNT(*) as count FROM nodes WHERE workspace_id = ?').get(wid).count;
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE workspace_id = ?').get(wid).count;

    res.json({ documents: docCount, tasks: taskCount, nodes: nodeCount, users: userCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/:id/activity — Get recent activity feed
router.get('/:id/activity', (req, res) => {
  try {
    const db = getDb();
    const wid = req.params.id;

    // Combine recent docs, tasks, and voice logs
    const docs = db.prepare(
      "SELECT id, title, 'document' as type, created_at FROM documents WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 5"
    ).all(wid);

    const tasks = db.prepare(
      "SELECT id, title, 'task' as type, created_at FROM tasks WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 5"
    ).all(wid);

    const voices = db.prepare(
      "SELECT id, transcript as title, 'voice' as type, created_at FROM voice_logs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 3"
    ).all(wid);

    const combined = [...docs, ...tasks, ...voices]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10);

    res.json({ activity: combined });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/workspace/sustainability — Log sustainability data
router.post('/sustainability', async (req, res) => {
  try {
    const { user_id, hours_used, date } = req.body;
    const db = getDb();
    const id = uuidv4();

    db.prepare(
      'INSERT INTO sustainability_logs (id, user_id, hours_used, date) VALUES (?, ?, ?, ?)'
    ).run(id, user_id, hours_used || 0, date || new Date().toISOString().split('T')[0]);

    // Try to generate AI tip
    let ai_tip = null;
    try {
      const { chat } = require('../services/ollamaService');
      ai_tip = await chat(
        [{ role: 'user', content: `Give a one-sentence energy saving tip for a college student who used their laptop for ${hours_used} hours today. Be practical and brief.` }],
        'phi3:mini',
        false
      );
      db.prepare('UPDATE sustainability_logs SET ai_tip = ? WHERE id = ?').run(ai_tip, id);
    } catch {}

    const log = db.prepare('SELECT * FROM sustainability_logs WHERE id = ?').get(id);
    res.status(201).json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/workspace/sustainability/:userId — Get sustainability stats
router.get('/sustainability/:userId', (req, res) => {
  try {
    const db = getDb();
    const logs = db.prepare(
      'SELECT * FROM sustainability_logs WHERE user_id = ? ORDER BY date DESC LIMIT 7'
    ).all(req.params.userId);

    const avgHours = logs.length > 0
      ? logs.reduce((sum, l) => sum + (l.hours_used || 0), 0) / logs.length
      : 0;

    res.json({ logs, weeklyAverage: Math.round(avgHours * 10) / 10 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
