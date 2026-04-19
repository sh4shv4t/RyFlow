// Knowledge graph logic — auto-relationship creation using LLM
const { getDb } = require('../db/database');
const { chat } = require('./ollamaService');
const { enqueueEmbeddingJob } = require('./embeddingQueue');
const { v4: uuidv4 } = require('uuid');

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'all',
  'can', 'had', 'was', 'one', 'get', 'has', 'how',
  'its', 'may', 'new', 'now', 'see', 'who', 'did',
  'with', 'have', 'this', 'that', 'from', 'they',
  'been', 'more', 'when', 'will', 'your', 'each',
  'into', 'most', 'some', 'than', 'then', 'them',
  'what', 'which', 'also', 'both', 'does', 'down',
  'file', 'note', 'notes', 'daily', 'document',
  'task', 'code', 'canvas', 'chat', 'page', 'text',
  'data', 'list', 'item', 'using', 'used', 'just',
  'like', 'about'
]);

// Serializes node metadata safely for database storage.
function stringifyMetadata(metadata) {
  if (!metadata) return null;
  try {
    return JSON.stringify(metadata);
  } catch {
    return null;
  }
}

// Parses JSON metadata safely for prompt construction.
function safeParseMetadata(metadataText) {
  if (!metadataText) return {};
  if (typeof metadataText === 'object') return metadataText;
  try {
    return JSON.parse(metadataText);
  } catch {
    return {};
  }
}

function extractKeywords(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
}

function extractPlainText(content, maxLen = 200) {
  if (!content) return '';
  let value = content;

  if (typeof value !== 'string') {
    try {
      value = JSON.stringify(value);
    } catch {
      return '';
    }
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed?.type === 'doc') {
      const texts = [];
      function walk(node) {
        if (!node) return;
        if (node.type === 'text' && node.text) {
          texts.push(node.text);
        }
        if (Array.isArray(node.content)) {
          node.content.forEach(walk);
        }
      }
      walk(parsed);
      const result = texts.join(' ').replace(/\s+/g, ' ').trim();
      return result.slice(0, maxLen);
    }
  } catch {}

  const stripped = String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.slice(0, maxLen);
}

function extractLastUserMessage(messages) {
  if (!messages) return '';
  let parsed = messages;

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return '';
    }
  }

  if (!Array.isArray(parsed)) return '';
  const lastUser = [...parsed]
    .reverse()
    .find((m) => m?.role === 'user');
  if (!lastUser) return '';
  return extractPlainText(String(lastUser.content || ''), 200);
}

function getCanvasElementCount(contentSummary, metadata) {
  if (Number.isFinite(Number(metadata?.element_count))) {
    return Number(metadata.element_count);
  }

  if (!contentSummary) return 0;
  try {
    const parsed = typeof contentSummary === 'string'
      ? JSON.parse(contentSummary)
      : contentSummary;
    if (Array.isArray(parsed)) return parsed.length;
    if (Array.isArray(parsed?.elements)) return parsed.elements.length;
  } catch {}

  return 0;
}

function normalizeNodeSummary(type, contentSummary, metadata) {
  if (type === 'task') {
    return extractPlainText(contentSummary, 200);
  }

  if (type === 'code') {
    return String(contentSummary || '').slice(0, 200);
  }

  if (type === 'canvas') {
    const count = getCanvasElementCount(contentSummary, metadata);
    return `Canvas with ${count} elements`;
  }

  if (type === 'ai_chat') {
    return extractLastUserMessage(contentSummary);
  }

  return extractPlainText(contentSummary, 200);
}

function edgeExists(db, sourceId, targetId) {
  return db.prepare(
    `SELECT id FROM edges WHERE
      (source_id = ? AND target_id = ?) OR
      (source_id = ? AND target_id = ?)
     LIMIT 1`
  ).get(sourceId, targetId, targetId, sourceId);
}

// Recomputes degree_centrality for the given node IDs after any edge change.
function recomputeDegreeFor(db, nodeIds) {
  if (!nodeIds || nodeIds.length === 0) return;
  try {
    const update = db.prepare(
      `UPDATE nodes SET degree_centrality =
         (SELECT COUNT(*) FROM edges WHERE source_id = nodes.id OR target_id = nodes.id)
       WHERE id = ?`
    );
    const runAll = db.transaction((ids) => {
      for (const id of ids) {
        if (id) update.run(id);
      }
    });
    runAll(nodeIds);
  } catch (err) {
    console.error('[Graph] recomputeDegreeFor failed:', err.message);
  }
}

function createKeywordEdges(newNode, workspaceId) {
  let db;
  try {
    db = getDb();
  } catch {
    return 0;
  }

  const newKw = new Set([
    ...extractKeywords(newNode.title),
    ...extractKeywords(newNode.content_summary)
  ]);
  const titleKwNew = extractKeywords(newNode.title);
  if (newKw.size === 0) return 0;

  const others = db.prepare(
    `SELECT id, title, content_summary
     FROM nodes
     WHERE workspace_id = ? AND id != ?
     LIMIT 150`
  ).all(workspaceId, newNode.id);

  let created = 0;
  for (const other of others) {
    const otherKw = new Set([
      ...extractKeywords(other.title),
      ...extractKeywords(other.content_summary)
    ]);

    const shared = [...newKw].filter((k) => otherKw.has(k));
    const titleKwOther = extractKeywords(other.title);
    const sharedTitle = titleKwNew.filter((k) => titleKwOther.includes(k));

    if (shared.length < 2 && sharedTitle.length < 1) continue;
    if (edgeExists(db, newNode.id, other.id)) continue;

    const label = sharedTitle.length > 0
      ? `shares: ${sharedTitle.slice(0, 2).join(', ')}`
      : `related: ${shared.slice(0, 2).join(', ')}`;

    const affectedId = other.id;
    db.prepare(
      'INSERT INTO edges (id, source_id, target_id, relationship_label, edge_type, weight, edge_weight) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), newNode.id, affectedId, label, 'keyword', 0.6, 1.0);
    recomputeDegreeFor(db, [newNode.id, affectedId]);
    created += 1;
  }

  return created;
}

// Creates a new node in the knowledge graph and generates its embedding
async function createNode(workspaceId, type, title, contentSummary, sourceId = null, metadata = null) {
  const db = getDb();
  const id = uuidv4();
  const metadataText = stringifyMetadata(metadata);
  const normalizedSummary = normalizeNodeSummary(type, contentSummary, metadata);

  db.prepare(
    'INSERT INTO nodes (id, workspace_id, type, title, content_summary, metadata, source_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
  ).run(id, workspaceId, type, title, normalizedSummary || '', metadataText, sourceId);

  // Queue embedding generation asynchronously (don't block writes).
  enqueueEmbeddingJob(id, workspaceId);

  const newNode = { id, type, title, content_summary: normalizedSummary || '', metadata: metadataText };
  await Promise.allSettled([
    autoCreateRelationships(newNode, workspaceId).catch(() => {}),
    Promise.resolve().then(() => createKeywordEdges(newNode, workspaceId)).catch(() => {})
  ]);

  return { id, workspaceId, type, title, contentSummary: normalizedSummary, metadata, sourceId };
}

// Uses LLM to find relationships between a new node and existing nodes
async function autoCreateRelationships(newNode, workspaceId) {
  const db = getDb();
  const recentNodes = db.prepare(
    'SELECT id, type, title, content_summary, metadata FROM nodes WHERE workspace_id = ? AND id != ? ORDER BY created_at DESC LIMIT 20'
  ).all(workspaceId, newNode.id);

  if (recentNodes.length === 0) return;

  const existing = recentNodes.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    content_summary: n.content_summary || '',
    metadata: safeParseMetadata(n.metadata)
  }));
  const newNodeMetadata = safeParseMetadata(newNode.metadata);
  const prompt = `Given this new item:\n${JSON.stringify({ type: newNode.type, title: newNode.title, content_summary: newNode.content_summary || '', metadata: newNodeMetadata })}\n\nAnd these existing workspace items:\n${JSON.stringify(existing)}\n\nWhich items are most semantically related? Return ONLY valid JSON array: [{id, relationship_label}] for the top 3 related items.`;

  try {
    const response = await chat(
      [{ role: 'user', content: prompt }],
      'phi3:mini',
      false
    );

    // Parse the JSON response from LLM
    // Remove markdown fences so malformed model wrappers do not break parsing.
    const clean = String(response || '').replace(/```json|```/gi, '').trim();
    const jsonMatch = clean.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const relations = JSON.parse(jsonMatch[0]);
    for (const rel of relations.slice(0, 3)) {
      const targetExists = db.prepare('SELECT id FROM nodes WHERE id = ? AND workspace_id = ?').get(rel.id, workspaceId);
      if (rel.id && rel.relationship_label && targetExists) {
        const edgeId = uuidv4();
        db.prepare(
          'INSERT INTO edges (id, source_id, target_id, relationship_label, edge_type, weight, edge_weight) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(edgeId, newNode.id, rel.id, rel.relationship_label, 'llm', 0.8, 1.0);
        recomputeDegreeFor(db, [newNode.id, rel.id]);
      }
    }
  } catch (err) {
    console.error('[Graph] LLM relationship parse error:', err.message);
  }
}

// Gets all nodes and edges for a workspace
function getGraph(workspaceId) {
  const db = getDb();
  const nodes = db.prepare(
    'SELECT id, workspace_id, type, title, content_summary, metadata, source_id, created_at FROM nodes WHERE workspace_id = ?'
  ).all(workspaceId);
  
  const nodeIds = new Set(nodes.map(n => n.id));
  const edges = db.prepare(
    'SELECT * FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE workspace_id = ?) OR target_id IN (SELECT id FROM nodes WHERE workspace_id = ?)'
  ).all(workspaceId, workspaceId);

  return { nodes, edges: edges.filter(e => nodeIds.has(e.source_id) && nodeIds.has(e.target_id)) };
}

// Adds a manual edge between two nodes
function addEdge(sourceId, targetId, label, weight = 1.0, edgeType = 'default', edgeWeight = 1.0) {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    'INSERT INTO edges (id, source_id, target_id, relationship_label, edge_type, weight, edge_weight) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, sourceId, targetId, label, edgeType, weight, edgeWeight);
  recomputeDegreeFor(db, [sourceId, targetId]);
  return { id, sourceId, targetId, label, weight };
}

// Deletes a node and all its connected edges
function deleteNode(nodeId) {
  const db = getDb();
  // Collect neighbors before deleting so we can recompute their degree afterward.
  const neighborRows = db.prepare(
    'SELECT source_id, target_id FROM edges WHERE source_id = ? OR target_id = ?'
  ).all(nodeId, nodeId);
  const neighborIds = new Set();
  for (const r of neighborRows) {
    if (r.source_id !== nodeId) neighborIds.add(r.source_id);
    if (r.target_id !== nodeId) neighborIds.add(r.target_id);
  }
  db.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?').run(nodeId, nodeId);
  db.prepare('DELETE FROM nodes WHERE id = ?').run(nodeId);
  recomputeDegreeFor(db, Array.from(neighborIds));
}

function backfillKeywordEdges(workspaceId) {
  const db = getDb();
  const nodes = db.prepare(
    'SELECT id, title, content_summary FROM nodes WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 200'
  ).all(workspaceId);

  let created = 0;
  nodes.forEach((node) => {
    const added = createKeywordEdges(node, workspaceId);
    if (typeof added === 'number') {
      created += added;
    }
  });

  return { processed: nodes.length, created };
}

module.exports = {
  createNode,
  autoCreateRelationships,
  getGraph,
  addEdge,
  deleteNode,
  backfillKeywordEdges,
  createKeywordEdges,
  extractKeywords,
  extractPlainText,
  extractLastUserMessage,
  normalizeNodeSummary
};
