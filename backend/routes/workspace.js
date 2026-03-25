// Workspace management routes — CRUD + user registration + activity + sustainability
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { chat } = require('../services/ollamaService');
const { v4: uuidv4 } = require('uuid');

// Parses JSON metadata safely for aggregate statistics.
function parseMetadata(metadata) {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

// Builds full workspace statistics payload across feature areas.
function buildWorkspaceStats(db, workspaceId) {
  const docRows = db.prepare("SELECT metadata, created_at FROM nodes WHERE workspace_id = ? AND type = 'doc'").all(workspaceId);
  const totalWords = docRows.reduce((sum, row) => sum + Number(parseMetadata(row.metadata).word_count || 0), 0);
  const lastDocCreated = db.prepare('SELECT created_at FROM documents WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1').get(workspaceId)?.created_at || null;

  const taskCount = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE workspace_id = ?').get(workspaceId).count;
  const taskDone = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE workspace_id = ? AND status = 'done'").get(workspaceId).count;
  const taskInProgress = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE workspace_id = ? AND status IN ('in_progress', 'in-progress')").get(workspaceId).count;
  const taskTodo = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE workspace_id = ? AND status = 'todo'").get(workspaceId).count;
  const today = new Date().toISOString().slice(0, 10);
  const taskOverdue = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE workspace_id = ? AND due_date IS NOT NULL AND due_date < ? AND status != 'done'")
    .get(workspaceId, today).count;

  const codeRows = db.prepare("SELECT metadata FROM nodes WHERE workspace_id = ? AND type = 'code'").all(workspaceId);
  const languages = Array.from(new Set(codeRows.map((row) => parseMetadata(row.metadata).language).filter(Boolean)));
  const totalLines = codeRows.reduce((sum, row) => sum + Number(parseMetadata(row.metadata).line_count || 0), 0);

  const canvasRows = db.prepare("SELECT metadata FROM nodes WHERE workspace_id = ? AND type = 'canvas'").all(workspaceId);
  const totalElements = canvasRows.reduce((sum, row) => sum + Number(parseMetadata(row.metadata).element_count || 0), 0);

  const aiChatCount = db.prepare('SELECT COUNT(*) as count FROM ai_chats WHERE workspace_id = ?').get(workspaceId).count;
  const totalMessages = db.prepare('SELECT COALESCE(SUM(message_count), 0) as total FROM ai_chats WHERE workspace_id = ?').get(workspaceId).total;
  const ragUsedCount = db.prepare('SELECT COUNT(*) as count FROM ai_chats WHERE workspace_id = ? AND rag_used = 1').get(workspaceId).count;
  const modelsUsed = db.prepare('SELECT DISTINCT model FROM ai_chats WHERE workspace_id = ? AND model IS NOT NULL').all(workspaceId).map((r) => r.model);

  const totalNodes = db.prepare('SELECT COUNT(*) as count FROM nodes WHERE workspace_id = ?').get(workspaceId).count;
  const totalEdges = db.prepare(
    'SELECT COUNT(*) as count FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE workspace_id = ?) AND target_id IN (SELECT id FROM nodes WHERE workspace_id = ?)'
  ).get(workspaceId, workspaceId).count;
  const nodeTypesRows = db.prepare('SELECT type, COUNT(*) as count FROM nodes WHERE workspace_id = ? GROUP BY type').all(workspaceId);
  const nodeTypes = nodeTypesRows.reduce((acc, row) => {
    acc[row.type] = row.count;
    return acc;
  }, {});

  const voiceCount = db.prepare('SELECT COUNT(*) as count FROM voice_logs WHERE workspace_id = ?').get(workspaceId).count;

  return {
    documents: {
      count: docRows.length,
      total_words: totalWords,
      last_created: lastDocCreated
    },
    tasks: {
      count: taskCount,
      completed: taskDone,
      in_progress: taskInProgress,
      todo: taskTodo,
      overdue: taskOverdue
    },
    code_files: {
      count: codeRows.length,
      languages,
      total_lines: totalLines
    },
    canvases: {
      count: canvasRows.length,
      total_elements: totalElements
    },
    ai_chats: {
      count: aiChatCount,
      total_messages: Number(totalMessages || 0),
      rag_used_count: ragUsedCount,
      models_used: modelsUsed
    },
    knowledge_graph: {
      total_nodes: totalNodes,
      total_edges: totalEdges,
      node_types: nodeTypes
    },
    voice_logs: {
      count: voiceCount
    }
  };
}

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
router.get('/:id', (req, res, next) => {
  try {
    if (req.params.id === 'stats' || req.params.id === 'activity') {
      return next();
    }
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

// GET /api/workspace/stats?workspace_id={} — Get comprehensive workspace statistics
router.get('/stats', (req, res) => {
  try {
    const { workspace_id } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });
    const db = getDb();
    return res.json(buildWorkspaceStats(db, workspace_id));
  } catch (err) {
    return res.status(500).json({ error: err.message });
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

// GET /api/workspace/activity?workspace_id={} — Get unified recent activity across all features
router.get('/activity', (req, res) => {
  try {
    const { workspace_id } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });
    const db = getDb();

    const activity = db.prepare(`
      SELECT type, id, title, updated_at FROM (
        SELECT 'document' as type, id, title, updated_at FROM documents WHERE workspace_id = ?
        UNION ALL
        SELECT 'task' as type, id, title, updated_at FROM tasks WHERE workspace_id = ?
        UNION ALL
        SELECT 'code' as type, id, title, updated_at FROM code_files WHERE workspace_id = ?
        UNION ALL
        SELECT 'canvas' as type, id, title, updated_at FROM canvases WHERE workspace_id = ?
        UNION ALL
        SELECT 'ai_chat' as type, id, title, updated_at FROM ai_chats WHERE workspace_id = ?
        UNION ALL
        SELECT 'voice' as type, id, 'Voice Note' as title, created_at as updated_at FROM voice_logs WHERE workspace_id = ?
      ) ORDER BY updated_at DESC LIMIT 20
    `).all(workspace_id, workspace_id, workspace_id, workspace_id, workspace_id, workspace_id);

    return res.json({ activity });
  } catch (err) {
    return res.status(500).json({ error: err.message });
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
      ai_tip = await chat(
        [{ role: 'user', content: `Give a one-sentence energy saving tip for a college student who used their laptop for ${hours_used} hours today. Be practical and brief.` }],
        'phi3:mini',
        false
      );
      db.prepare('UPDATE sustainability_logs SET ai_tip = ? WHERE id = ?').run(ai_tip, id);
    } catch (aiErr) {
      // Keep logging resilient even when AI services are unavailable.
      console.warn('[Workspace] Sustainability AI tip unavailable:', aiErr.message);
    }

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
