// Hook for knowledge graph data fetching and state
import { useState, useCallback } from 'react';
import axios from 'axios';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';

export default function useGraph() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isNeighborhoodMode, setIsNeighborhoodMode] = useState(false);
  const [centerNodeId, setCenterNodeId] = useState(null);
  const { workspace, setAiActive } = useStore();

  // Fetches the full knowledge graph for the current workspace
  const fetchGraph = useCallback(async (options = {}) => {
    if (!workspace) return;
    setLoading(true);
    try {
      const loadAll = Boolean(options.all);
      const limit = Number(options.limit || 200);
      // Fetch nodes and edges explicitly to match graph API contract.
      const [nodesRes, edgesRes] = await Promise.all([
        axios.get('/api/graph/nodes', { params: { workspace_id: workspace.id, all: loadAll ? 1 : 0, limit } }),
        axios.get('/api/graph/edges', { params: { workspace_id: workspace.id } })
      ]);
      setNodes(nodesRes.data.nodes || []);
      setEdges(edgesRes.data.edges || []);
      setIsNeighborhoodMode(false);
      setCenterNodeId(null);
    } catch (err) {
      toast.error('Failed to load knowledge graph');
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  const fetchNeighborhood = useCallback(async (nodeId, hops = 2) => {
    if (!workspace || !nodeId) return;
    setLoading(true);
    try {
      const res = await axios.get('/api/graph/neighborhood', {
        params: { workspace_id: workspace.id, node_id: nodeId, hops }
      });
      setNodes(res.data.nodes || []);
      setEdges(res.data.edges || []);
      setIsNeighborhoodMode(true);
      setCenterNodeId(res.data.center || nodeId);
      return res.data;
    } catch (err) {
      toast.error('Failed to load neighborhood graph');
      return null;
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  // Performs semantic search across graph nodes
  const search = useCallback(async (query) => {
    if (!workspace || !query.trim()) return;
    setLoading(true);
    setAiActive(true);
    try {
      const res = await axios.post('/api/graph/search', {
        query,
        workspace_id: workspace.id,
        top_k: 5
      });
      setSearchResults(res.data.results || []);
      return res.data.results;
    } catch (err) {
      toast.error('Semantic search failed. Is Ollama running?');
      return [];
    } finally {
      setLoading(false);
      setAiActive(false);
    }
  }, [workspace, setAiActive]);

  // Adds a new node to the graph
  const addNode = useCallback(async (type, title, contentSummary, sourceId) => {
    if (!workspace) return;
    try {
      const res = await axios.post('/api/graph/nodes', {
        workspace_id: workspace.id,
        type,
        title,
        content_summary: contentSummary,
        source_id: sourceId
      });
      await fetchGraph();
      return res.data;
    } catch (err) {
      toast.error('Failed to add node');
    }
  }, [workspace, fetchGraph]);

  return {
    nodes,
    edges,
    searchResults,
    loading,
    isNeighborhoodMode,
    centerNodeId,
    fetchGraph,
    fetchNeighborhood,
    search,
    addNode
  };
}
