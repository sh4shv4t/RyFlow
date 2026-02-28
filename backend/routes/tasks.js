// Task management routes — CRUD + natural language task creation
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { chat } = require('../services/ollamaService');
const { createNode } = require('../services/graphService');
const { v4: uuidv4 } = require('uuid');

// GET /api/tasks — List tasks for a workspace, optionally filtered by status
router.get('/', (req, res) => {
  try {
    const { workspace_id, status } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

    const db = getDb();
    let query = 'SELECT * FROM tasks WHERE workspace_id = ?';
    const params = [workspace_id];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC';

    const tasks = db.prepare(query).all(...params);
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks — Create a new task manually
router.post('/', async (req, res) => {
  try {
    const { workspace_id, title, description, assignee, status, priority, due_date } = req.body;
    if (!workspace_id || !title) {
      return res.status(400).json({ error: 'workspace_id and title are required' });
    }

    const db = getDb();
    const id = uuidv4();
    db.prepare(
      'INSERT INTO tasks (id, workspace_id, title, description, assignee, status, priority, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, workspace_id, title, description || '', assignee || '', status || 'todo', priority || 'medium', due_date || null);

    // Add to knowledge graph
    await createNode(workspace_id, 'task', title, description || '', id);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tasks/:id — Update a task's fields
router.patch('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const { title, description, assignee, status, priority, due_date } = req.body;
    db.prepare(
      'UPDATE tasks SET title = ?, description = ?, assignee = ?, status = ?, priority = ?, due_date = ? WHERE id = ?'
    ).run(
      title || existing.title,
      description !== undefined ? description : existing.description,
      assignee !== undefined ? assignee : existing.assignee,
      status || existing.status,
      priority || existing.priority,
      due_date !== undefined ? due_date : existing.due_date,
      req.params.id
    );

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/tasks/:id — Delete a task
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);

    // Clean up graph node
    const node = db.prepare('SELECT id FROM nodes WHERE source_id = ? AND type = ?').get(req.params.id, 'task');
    if (node) {
      db.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?').run(node.id, node.id);
      db.prepare('DELETE FROM nodes WHERE id = ?').run(node.id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/tasks/nl-create — Create tasks from natural language using LLM
router.post('/nl-create', async (req, res) => {
  try {
    const { text, workspace_id } = req.body;
    if (!text || !workspace_id) {
      return res.status(400).json({ error: 'text and workspace_id are required' });
    }

    const prompt = `Parse this into tasks. Return ONLY valid JSON array with no markdown formatting: [{title, description, assignee, due_date, priority}]. Priority must be "low", "medium", or "high". If no due date, use null. If no assignee, use empty string. Input: "${text}"`;

    const response = await chat(
      [{ role: 'user', content: prompt }],
      'phi3:mini',
      false
    );

    // Extract JSON from response
    const jsonMatch = response.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      return res.status(422).json({ error: 'Could not parse AI response into tasks', raw: response });
    }

    const parsedTasks = JSON.parse(jsonMatch[0]);
    const db = getDb();
    const createdTasks = [];

    for (const t of parsedTasks) {
      const id = uuidv4();
      db.prepare(
        'INSERT INTO tasks (id, workspace_id, title, description, assignee, status, priority, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, workspace_id, t.title || 'Untitled Task', t.description || '', t.assignee || '', 'todo', t.priority || 'medium', t.due_date || null);

      // Add to knowledge graph
      await createNode(workspace_id, 'task', t.title, t.description || '', id);

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      createdTasks.push(task);
    }

    res.status(201).json({ tasks: createdTasks, parsed: parsedTasks.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to parse tasks. Is Ollama running?', details: err.message });
  }
});

module.exports = router;
