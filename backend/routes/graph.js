// Knowledge graph routes — nodes, edges, and semantic search
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { createNode, getGraph, addEdge, deleteNode, backfillKeywordEdges } = require('../services/graphService');
const { semanticSearch, parseMetadata } = require('../services/embeddingService');

// GET /api/graph — Get full knowledge graph for a workspace
router.get('/', (req, res) => {
  try {
    const { workspace_id } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });

    const graph = getGraph(workspace_id);
    res.json(graph);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/nodes — Get all nodes for a workspace
router.get('/nodes', (req, res) => {
  try {
    const { workspace_id } = req.query;
    const loadAll = String(req.query.all || '0') === '1';
    const limit = parseInt(req.query.limit) || 200;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });
    const db = getDb();
    const nodes = (loadAll
      ? db.prepare('SELECT id, workspace_id, type, title, content_summary, metadata, source_id, degree_centrality, updated_at, created_at FROM nodes WHERE workspace_id = ? ORDER BY created_at DESC').all(workspace_id)
      : db.prepare('SELECT id, workspace_id, type, title, content_summary, metadata, source_id, degree_centrality, updated_at, created_at FROM nodes WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?').all(workspace_id, limit)
    )
      .map((node) => ({ ...node, metadata: parseMetadata(node.metadata) }));
    res.json({ nodes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/neighborhood — Get local subgraph around a node (default 2 hops).
router.get('/neighborhood', (req, res) => {
  try {
    const { workspace_id, node_id } = req.query;
    const hops = Math.max(1, Math.min(3, Number(req.query.hops || 2)));
    if (!workspace_id || !node_id) {
      return res.status(400).json({ error: 'workspace_id and node_id are required' });
    }

    const db = getDb();
    const allNodes = db.prepare(
      'SELECT id, workspace_id, type, title, content_summary, metadata, source_id, degree_centrality, updated_at, created_at FROM nodes WHERE workspace_id = ?'
    ).all(workspace_id);
    const nodeMap = new Map(allNodes.map((n) => [n.id, { ...n, metadata: parseMetadata(n.metadata) }]));
    if (!nodeMap.has(node_id)) return res.status(404).json({ error: 'Node not found' });

    const allEdges = db.prepare(
      'SELECT e.id, e.source_id, e.target_id, e.relationship_label, e.edge_type, e.weight, e.created_at FROM edges e JOIN nodes s ON s.id = e.source_id JOIN nodes t ON t.id = e.target_id WHERE s.workspace_id = ? AND t.workspace_id = ?'
    ).all(workspace_id, workspace_id);

    const adjacency = new Map();
    allEdges.forEach((edge) => {
      if (!adjacency.has(edge.source_id)) adjacency.set(edge.source_id, new Set());
      if (!adjacency.has(edge.target_id)) adjacency.set(edge.target_id, new Set());
      adjacency.get(edge.source_id).add(edge.target_id);
      adjacency.get(edge.target_id).add(edge.source_id);
    });

    const visited = new Set([node_id]);
    let frontier = new Set([node_id]);
    for (let i = 0; i < hops; i += 1) {
      const nextFrontier = new Set();
      frontier.forEach((id) => {
        const neighbors = adjacency.get(id) || new Set();
        neighbors.forEach((nId) => {
          if (!visited.has(nId)) {
            visited.add(nId);
            nextFrontier.add(nId);
          }
        });
      });
      frontier = nextFrontier;
      if (!frontier.size) break;
    }

    const nodes = Array.from(visited).map((id) => nodeMap.get(id)).filter(Boolean);
    const idSet = new Set(nodes.map((n) => n.id));
    const edges = allEdges.filter((e) => idSet.has(e.source_id) && idSet.has(e.target_id));
    return res.json({ nodes, edges, center: node_id, hops });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/graph/edges — Get all edges for a workspace
router.get('/edges', (req, res) => {
  try {
    const { workspace_id } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id is required' });
    const db = getDb();

    const nodeIds = String(req.query.node_ids || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 1200);

    let edges;
    if (nodeIds.length > 0) {
      const placeholders = nodeIds.map(() => '?').join(',');
      edges = db.prepare(
        `SELECT e.id, e.source_id, e.target_id, e.relationship_label, e.edge_type, e.weight, e.created_at
         FROM edges e
         JOIN nodes s ON e.source_id = s.id
         JOIN nodes t ON e.target_id = t.id
         WHERE s.workspace_id = ?
           AND t.workspace_id = ?
           AND e.source_id IN (${placeholders})
           AND e.target_id IN (${placeholders})`
      ).all(workspace_id, workspace_id, ...nodeIds, ...nodeIds);
    } else {
      edges = db.prepare(
        'SELECT e.id, e.source_id, e.target_id, e.relationship_label, e.edge_type, e.weight, e.created_at FROM edges e JOIN nodes s ON e.source_id = s.id JOIN nodes t ON e.target_id = t.id WHERE s.workspace_id = ? AND t.workspace_id = ?'
      ).all(workspace_id, workspace_id);
    }

    res.json({ edges });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/graph/nodes — Create a new node
router.post('/nodes', async (req, res) => {
  try {
    const { workspace_id, type, title, content_summary, source_id } = req.body;
    if (!workspace_id || !type || !title) {
      return res.status(400).json({ error: 'workspace_id, type, and title are required' });
    }
    const node = await createNode(workspace_id, type, title, content_summary, source_id);
    res.status(201).json(node);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/graph/nodes/:id — Delete a node and its edges
router.delete('/nodes/:id', (req, res) => {
  try {
    deleteNode(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/graph/edges — Create an edge between two nodes
router.post('/edges', (req, res) => {
  try {
    const { source_id, target_id, relationship_label, weight } = req.body;
    if (!source_id || !target_id) {
      return res.status(400).json({ error: 'source_id and target_id are required' });
    }
    const edge = addEdge(source_id, target_id, relationship_label || 'related', weight || 1.0);
    res.status(201).json(edge);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/graph/search — Semantic search across knowledge graph nodes
router.post('/search', async (req, res) => {
  try {
    const { query, workspace_id, top_k } = req.body;
    if (!query || !workspace_id) {
      return res.status(400).json({ error: 'query and workspace_id are required' });
    }
    const results = await semanticSearch(query, workspace_id, top_k || 5);
    res.json({ results: results.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      content_summary: r.content_summary,
      metadata: parseMetadata(r.metadata),
      source_id: r.source_id,
      score: r.score,
      created_at: r.created_at,
      updated_at: r.updated_at
    })) });
  } catch (err) {
    res.status(500).json({ error: 'Semantic search failed. Is Ollama running with nomic-embed-text?', details: err.message });
  }
});

// GET /api/graph/backlinks/:node_id — Returns incoming and outgoing graph links for a node.
router.get('/backlinks/:node_id', (req, res) => {
  try {
    const nodeId = req.params.node_id;
    if (!nodeId) return res.status(400).json({ error: 'node_id is required' });
    const db = getDb();

    const incoming = db.prepare(
      `SELECT e.*, n.id as source_node_id, n.source_id, n.title, n.type, n.content_summary
       FROM edges e
       JOIN nodes n ON e.source_id = n.id
       WHERE e.target_id = ?
       ORDER BY e.created_at DESC`
    ).all(nodeId);

    const outgoing = db.prepare(
      `SELECT e.*, n.id as target_node_id, n.source_id, n.title, n.type, n.content_summary
       FROM edges e
       JOIN nodes n ON e.target_id = n.id
       WHERE e.source_id = ?
       ORDER BY e.created_at DESC`
    ).all(nodeId);

    return res.json({
      incoming,
      outgoing,
      total: Number(incoming.length) + Number(outgoing.length)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/graph/backfill-keyword-edges — Build deterministic keyword edges for existing nodes.
router.post('/backfill-keyword-edges', (req, res) => {
  try {
    const workspaceId = req.body?.workspace_id || req.query?.workspace_id;
    if (!workspaceId) return res.status(400).json({ error: 'workspace_id is required' });
    const result = backfillKeywordEdges(workspaceId);
    return res.json({ success: true, ...result });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
