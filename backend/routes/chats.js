// Persistent AI chat session routes with graph synchronization.
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { createNode, extractLastUserMessage } = require('../services/graphService');
const { enqueueEmbeddingJob } = require('../services/embeddingQueue');

// Parses serialized messages defensively.
function parseMessages(messagesText) {
  try {
    const parsed = JSON.parse(messagesText || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function formatSessionTitleFromUserContent(content) {
  const base = String(content || '').trim();
  if (!base) return '';
  return base.length > 60 ? `${base.slice(0, 60)}...` : base;
}

function isTitlePlaceholder(title) {
  const t = title == null ? '' : String(title);
  return !t.trim() || t === 'New Chat';
}

// Title shown on the knowledge-graph node (session list title comes from DB `title`).
function resolveChatTitleForNode(chat) {
  const messages = parseMessages(chat.messages);
  if (!isTitlePlaceholder(chat.title)) return String(chat.title).trim();
  const firstUser = messages.find((m) => m.role === 'user' && String(m.content || '').trim());
  if (firstUser) return formatSessionTitleFromUserContent(firstUser.content);
  return 'Untitled chat';
}

// Creates AI chat node metadata for graph search and detail views.
function buildChatMetadata(chat) {
  return {
    model: chat.model || 'phi3:mini',
    message_count: Number(chat.message_count || 0),
    rag_used: Number(chat.rag_used || 0)
  };
}

// Upserts a graph node for a saved chat session.
async function upsertChatNode(chat) {
  const db = getDb();
  const messages = parseMessages(chat.messages);
  const title = resolveChatTitleForNode(chat);
  const summary = extractLastUserMessage(messages);
  const metadata = buildChatMetadata(chat);
  const existing = db.prepare("SELECT id FROM nodes WHERE source_id = ? AND type = 'ai_chat'").get(chat.id);

  if (existing) {
    db.prepare('UPDATE nodes SET title = ?, content_summary = ?, metadata = ? WHERE id = ?')
      .run(title, summary, JSON.stringify(metadata), existing.id);
    enqueueEmbeddingJob(existing.id, chat.workspace_id);
    return existing.id;
  }

  const created = await createNode(chat.workspace_id, 'ai_chat', title, summary, chat.id, metadata);
  enqueueEmbeddingJob(created.id, chat.workspace_id);
  return created.id;
}

// GET /api/chats?workspace_id=... — list chat sessions for a workspace
router.get('/', (req, res) => {
  try {
    const { workspace_id } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

    const db = getDb();
    const chats = db.prepare(
      'SELECT id, title, message_count, model, rag_used, updated_at FROM ai_chats WHERE workspace_id = ? ORDER BY updated_at DESC'
    ).all(workspace_id);
    return res.json({ chats });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/chats — create a new persistent chat session
router.post('/', async (req, res) => {
  try {
    const { workspace_id, messages, model, rag_used } = req.body;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

    const id = uuidv4();
    const safeMessages = Array.isArray(messages) ? messages : [];
    const firstUser = safeMessages.find((m) => m.role === 'user' && String(m.content || '').trim());
    const resolvedTitle = firstUser ? formatSessionTitleFromUserContent(firstUser.content) : '';
    const payload = {
      id,
      workspace_id,
      title: resolvedTitle,
      messages: JSON.stringify(safeMessages),
      model: model || 'phi3:mini',
      message_count: safeMessages.length,
      rag_used: rag_used ? 1 : 0
    };

    const db = getDb();
    db.prepare(
      'INSERT INTO ai_chats (id, workspace_id, title, messages, model, message_count, rag_used) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(payload.id, payload.workspace_id, payload.title, payload.messages, payload.model, payload.message_count, payload.rag_used);

    const saved = db.prepare('SELECT * FROM ai_chats WHERE id = ?').get(id);
    await upsertChatNode(saved);
    return res.status(201).json({ ...saved, messages: parseMessages(saved.messages) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/chats/:id — load full chat session with message history
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const chat = db.prepare('SELECT * FROM ai_chats WHERE id = ?').get(req.params.id);
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    return res.json({ ...chat, messages: parseMessages(chat.messages) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/chats/:id — update chat session messages/title/model metadata
router.put('/:id', async (req, res) => {
  try {
    const { title, messages, model, rag_used } = req.body;
    const db = getDb();
    const existing = db.prepare('SELECT * FROM ai_chats WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Chat not found' });

    const nextMessages = Array.isArray(messages) ? messages : parseMessages(existing.messages);
    const firstUser = nextMessages.find((m) => m.role === 'user' && String(m.content || '').trim());

    let nextTitle = existing.title;
    if (isTitlePlaceholder(existing.title) && firstUser) {
      nextTitle = formatSessionTitleFromUserContent(firstUser.content);
    }
    if (title !== undefined && title !== null) {
      const t = String(title).trim();
      if (t && !isTitlePlaceholder(t)) nextTitle = t;
    }
    const nextModel = model || existing.model || 'phi3:mini';
    const nextRag = rag_used === undefined ? Number(existing.rag_used || 0) : (rag_used ? 1 : 0);

    db.prepare(
      'UPDATE ai_chats SET title = ?, messages = ?, model = ?, message_count = ?, rag_used = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(nextTitle, JSON.stringify(nextMessages), nextModel, nextMessages.length, nextRag, req.params.id);

    const updated = db.prepare('SELECT * FROM ai_chats WHERE id = ?').get(req.params.id);
    await upsertChatNode(updated);
    return res.json({ ...updated, messages: parseMessages(updated.messages) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/chats/:id — delete chat session and linked graph node
router.delete('/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM ai_chats WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Chat not found' });

    db.prepare('DELETE FROM ai_chats WHERE id = ?').run(req.params.id);

    const node = db.prepare("SELECT id FROM nodes WHERE source_id = ? AND type = 'ai_chat'").get(req.params.id);
    if (node) {
      db.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?').run(node.id, node.id);
      db.prepare('DELETE FROM nodes WHERE id = ?').run(node.id);
    }

    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
