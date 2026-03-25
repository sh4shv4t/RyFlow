// Knowledge graph logic — auto-relationship creation using LLM
const { getDb } = require('../db/database');
const { chat } = require('./ollamaService');
const { enqueueEmbeddingJob } = require('./embeddingQueue');
const { v4: uuidv4 } = require('uuid');

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

// Creates a new node in the knowledge graph and generates its embedding
async function createNode(workspaceId, type, title, contentSummary, sourceId = null, metadata = null) {
  const db = getDb();
  const id = uuidv4();
  const metadataText = stringifyMetadata(metadata);

  db.prepare(
    'INSERT INTO nodes (id, workspace_id, type, title, content_summary, metadata, source_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, workspaceId, type, title, contentSummary || '', metadataText, sourceId);

  // Queue embedding generation asynchronously (don't block writes).
  const textForEmbedding = { type, title, content_summary: contentSummary || '', metadata: metadataText };
  enqueueEmbeddingJob(id, textForEmbedding);

  // Auto-create relationships asynchronously
  autoCreateRelationships({ id, type, title, content_summary: contentSummary || '', metadata: metadataText }, workspaceId).catch(err => {
    console.error('[Graph] Auto-relationship creation failed for node', id, err.message);
  });

  return { id, workspaceId, type, title, contentSummary, metadata, sourceId };
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
          'INSERT INTO edges (id, source_id, target_id, relationship_label, weight) VALUES (?, ?, ?, ?, ?)'
        ).run(edgeId, newNode.id, rel.id, rel.relationship_label, 0.8);
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
function addEdge(sourceId, targetId, label, weight = 1.0) {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    'INSERT INTO edges (id, source_id, target_id, relationship_label, weight) VALUES (?, ?, ?, ?, ?)'
  ).run(id, sourceId, targetId, label, weight);
  return { id, sourceId, targetId, label, weight };
}

// Deletes a node and all its connected edges
function deleteNode(nodeId) {
  const db = getDb();
  db.prepare('DELETE FROM edges WHERE source_id = ? OR target_id = ?').run(nodeId, nodeId);
  db.prepare('DELETE FROM nodes WHERE id = ?').run(nodeId);
}

module.exports = { createNode, autoCreateRelationships, getGraph, addEdge, deleteNode };
