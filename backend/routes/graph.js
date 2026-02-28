// Knowledge graph routes — nodes, edges, and semantic search
const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { createNode, getGraph, addEdge, deleteNode } = require('../services/graphService');
const { semanticSearch } = require('../services/embeddingService');

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
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: 'Semantic search failed. Is Ollama running with nomic-embed-text?', details: err.message });
  }
});

module.exports = router;
