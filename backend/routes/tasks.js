// Task management routes — CRUD + natural language task creation
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { chat } = require('../services/ollamaService');
const { createNode, extractPlainText } = require('../services/graphService');
const { enqueueEmbeddingJob } = require('../services/embeddingQueue');
const { v4: uuidv4 } = require('uuid');

// Builds task metadata for graph node storage.
function buildTaskMetadata(task) {
  return {
    priority: task.priority || 'medium',
    assignee: task.assignee || null,
    due_date: task.due_date || null,
    status: task.status || 'todo'
  };
}

function resolveValidAssignee(db, assigneeId, workspaceId) {
  const candidate = String(assigneeId || '').trim();
  if (!candidate) return null;
  const exists = db.prepare('SELECT id FROM users WHERE id = ? AND workspace_id = ? LIMIT 1').get(candidate, workspaceId);
  return exists?.id || null;
}

// Removes markdown code fences around model outputs.
function stripCodeFences(text) {
  return String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

function inferPriority(text) {
  const value = String(text || '').toLowerCase();
  if (/\b(high|urgent|asap|critical|immediately)\b/.test(value)) return 'high';
  if (/\b(low|whenever|someday|later)\b/.test(value)) return 'low';
  return 'medium';
}

function normalizeTask(rawTask) {
  const title = String(rawTask?.title || '').trim();
  if (!title) return null;
  const due = String(rawTask?.due_date || '').trim();
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : null;
  const priority = ['low', 'medium', 'high'].includes(String(rawTask?.priority || '').toLowerCase())
    ? String(rawTask.priority).toLowerCase()
    : inferPriority(`${title} ${rawTask?.description || ''}`);
  return {
    title,
    description: String(rawTask?.description || '').trim(),
    assignee: String(rawTask?.assignee || '').trim() || null,
    due_date: dueDate,
    priority
  };
}

function extractTasksJSON(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let s = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  try {
    const p = JSON.parse(s);
    if (Array.isArray(p)) return p;
    if (p && typeof p === 'object') return [p];
  } catch {}

  const arrMatch = s.match(/\[[\s\S]*?\]/);
  if (arrMatch) {
    try {
      const p = JSON.parse(arrMatch[0]);
      if (Array.isArray(p)) return p;
    } catch {}
  }

  const objMatch = s.match(/\{[\s\S]*?\}/);
  if (objMatch) {
    try {
      const p = JSON.parse(objMatch[0]);
      if (p && typeof p === 'object') return [p];
    } catch {}
  }

  return null;
}

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
    const safeAssignee = resolveValidAssignee(db, assignee, workspace_id);
    const id = uuidv4();
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO tasks (id, workspace_id, title, description, assignee, status, priority, due_date, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, workspace_id, title, description || '', safeAssignee, status || 'todo', priority || 'medium', due_date || null, now, now);

    // Add to knowledge graph
    const summary = extractPlainText(description || title, 200);
    const metadata = buildTaskMetadata({ priority, assignee, due_date, status: status || 'todo' });
    const node = await createNode(workspace_id, 'task', title, summary, id, metadata);
    enqueueEmbeddingJob(node.id, workspace_id);

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    res.status(201).json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/tasks/:id — Update a task's fields
router.patch('/:id', async (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const { title, description, assignee, status, priority, due_date } = req.body;
    const safeAssignee = assignee !== undefined
      ? resolveValidAssignee(db, assignee, existing.workspace_id)
      : existing.assignee;
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE tasks SET title = ?, description = ?, assignee = ?, status = ?, priority = ?, due_date = ?, updated_at = ? WHERE id = ?'
    ).run(
      title || existing.title,
      description !== undefined ? description : existing.description,
      safeAssignee,
      status || existing.status,
      priority || existing.priority,
      due_date !== undefined ? due_date : existing.due_date,
      now,
      req.params.id
    );

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);

    // Keep task node summary and embedding in sync after updates.
    const node = db.prepare('SELECT id FROM nodes WHERE source_id = ? AND type = ?').get(req.params.id, 'task');
    if (node) {
      const summary = extractPlainText(task.description || task.title, 200);
      const metadata = buildTaskMetadata(task);
      db.prepare('UPDATE nodes SET title = ?, content_summary = ?, metadata = ? WHERE id = ?')
        .run(task.title, summary, JSON.stringify(metadata), node.id);
      enqueueEmbeddingJob(node.id, task.workspace_id);
    }

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
    const workspace_id = req.body?.workspace_id;
    const userText = String(req.body?.userText || req.body?.text || '').trim();

    console.log('[Tasks NL] userText:', userText);
    console.log('[Tasks NL] workspace_id:', workspace_id);

    if (!userText || !workspace_id) {
      return res.status(400).json({ error: 'text and workspace_id are required' });
    }

    const prompt =
      'Extract tasks from the text below.\n' +
      'Return ONLY a JSON array, nothing else.\n' +
      'No markdown. No explanation. No extra text.\n' +
      'Each task: {"title":"string","priority":"medium"}\n' +
      'Priority must be: high, medium, or low\n' +
      'If no tasks found: []\n\n' +
      'Text: ' + userText;

    const rawResponse = await chat(
      [{ role: 'user', content: prompt }],
      'phi3:mini',
      false,
      30000
    );

    console.log('[Tasks NL] raw response:', rawResponse);

    const parsed = extractTasksJSON(rawResponse);
    if (!parsed) {
      return res.status(422).json({
        error: 'Could not reliably parse tasks. Try 1-3 clear task sentences.',
        raw: stripCodeFences(rawResponse).slice(0, 1200)
      });
    }

    const parsedTasks = parsed.map(normalizeTask).filter(Boolean);
    if (!parsedTasks.length) {
      return res.status(422).json({
        error: 'Could not reliably parse tasks. Try 1-3 clear task sentences.',
        raw: stripCodeFences(rawResponse).slice(0, 1200)
      });
    }

    const db = getDb();
    const createdTasks = [];

    for (const t of parsedTasks) {
      const id = uuidv4();
      const safeAssignee = resolveValidAssignee(db, t.assignee, workspace_id);
      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO tasks (id, workspace_id, title, description, assignee, status, priority, due_date, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, workspace_id, t.title || 'Untitled Task', t.description || '', safeAssignee, 'todo', t.priority || 'medium', t.due_date || null, now, now);

      // Add to knowledge graph
      const summary = extractPlainText(t.description || t.title || 'Untitled Task', 200);
      const metadata = buildTaskMetadata({
        priority: t.priority || 'medium',
        assignee: safeAssignee,
        due_date: t.due_date || null,
        status: 'todo'
      });
      const node = await createNode(workspace_id, 'task', t.title || 'Untitled Task', summary, id, metadata);
      enqueueEmbeddingJob(node.id, workspace_id);

      const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      createdTasks.push(task);
    }

    res.status(201).json({ tasks: createdTasks, parsed: parsedTasks.length });
  } catch (err) {
    if (/timed out/i.test(String(err.message || ''))) {
      return res.status(504).json({ error: 'Task parsing timed out. Try a shorter request or lighter model.' });
    }
    res.status(500).json({ error: 'Failed to parse tasks. Is Ollama running?', details: err.message });
  }
});

module.exports = router;
