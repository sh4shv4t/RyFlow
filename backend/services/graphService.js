// Knowledge graph logic — auto-relationship creation using LLM
const { getDb } = require('../db/database');
const { chat } = require('./ollamaService');
const { generateAndStoreEmbedding } = require('./embeddingService');
const { v4: uuidv4 } = require('uuid');

// Creates a new node in the knowledge graph and generates its embedding
async function createNode(workspaceId, type, title, contentSummary, sourceId = null) {
  const db = getDb();
  const id = uuidv4();

  db.prepare(
    'INSERT INTO nodes (id, workspace_id, type, title, content_summary, source_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, workspaceId, type, title, contentSummary || '', sourceId);

  // Generate embedding asynchronously (don't block)
  const textForEmbedding = `${title}. ${contentSummary || ''}`;
  generateAndStoreEmbedding(id, textForEmbedding).catch(err => {
    console.error('[Graph] Embedding generation failed for node', id, err.message);
  });

  // Auto-create relationships asynchronously
  autoCreateRelationships(id, workspaceId, title).catch(err => {
    console.error('[Graph] Auto-relationship creation failed for node', id, err.message);
  });

  return { id, workspaceId, type, title, contentSummary, sourceId };
}

// Uses LLM to find relationships between a new node and existing nodes
async function autoCreateRelationships(newNodeId, workspaceId, newTitle) {
  const db = getDb();
  const recentNodes = db.prepare(
    'SELECT id, title FROM nodes WHERE workspace_id = ? AND id != ? ORDER BY created_at DESC LIMIT 20'
  ).all(workspaceId, newNodeId);

  if (recentNodes.length === 0) return;

  const nodeList = recentNodes.map(n => `{id: "${n.id}", title: "${n.title}"}`).join(', ');
  const prompt = `Given this new item: "${newTitle}". And these existing items: [${nodeList}]. Which existing items is this most related to? Return ONLY valid JSON array: [{id, relationship_label}] for top 3 most related. No explanation.`;

  try {
    const response = await chat(
      [{ role: 'user', content: prompt }],
      'phi3:mini',
      false
    );

    // Parse the JSON response from LLM
    const jsonMatch = response.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return;

    const relations = JSON.parse(jsonMatch[0]);
    for (const rel of relations.slice(0, 3)) {
      if (rel.id && rel.relationship_label) {
        const edgeId = uuidv4();
        db.prepare(
          'INSERT INTO edges (id, source_id, target_id, relationship_label, weight) VALUES (?, ?, ?, ?, ?)'
        ).run(edgeId, newNodeId, rel.id, rel.relationship_label, 0.8);
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
    'SELECT id, workspace_id, type, title, content_summary, source_id, created_at FROM nodes WHERE workspace_id = ?'
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
