// Hook for knowledge graph data fetching and state
import { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';
import { waitForMinimumLoading } from '../utils/loadingDelay';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function useGraph() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isNeighborhoodMode, setIsNeighborhoodMode] = useState(false);
  const [centerNodeId, setCenterNodeId] = useState(null);
  const { workspace, setAiActive } = useStore();
  const GRAPH_MIN_LOADING_MS = 0;
  const GRAPH_SEARCH_MIN_LOADING_MS = 40;
  const lastFetchOptionsRef = useRef({ all: false, limit: 500 });
  /** One POST /backfill-semantic-edges per workspace session (not every fetchGraph). */
  const semanticBackfillOnceRef = useRef(false);
  /** One silent embedding backfill poll per workspace session (not every fetchGraph). */
  const embeddingBackfillOnceRef = useRef(false);
  useEffect(() => {
    semanticBackfillOnceRef.current = false;
    embeddingBackfillOnceRef.current = false;
  }, [workspace?.id]);

  const runSilentEmbeddingBackfill = useCallback(async (workspaceId, refreshGraph) => {
    try {
      const missingRes = await axios.get('/api/graph/nodes-without-embeddings', {
        params: { workspace_id: workspaceId }
      });
      const initialIds = missingRes.data?.node_ids || [];
      if (!initialIds.length) return;

      await axios.post('/api/graph/enqueue-missing-embeddings', {
        workspace_id: workspaceId,
        node_ids: initialIds
      });

      const initialSet = new Set(initialIds);
      for (let i = 0; i < 45; i += 1) {
        await sleep(2000);
        const check = await axios.get('/api/graph/nodes-without-embeddings', {
          params: { workspace_id: workspaceId }
        });
        const stillMissing = new Set(check.data?.node_ids || []);
        const anyStill = [...initialSet].some((id) => stillMissing.has(id));
        if (!anyStill) {
          await refreshGraph();
          toast('Graph updated', { duration: 2200 });
          return;
        }
      }
    } catch {
      /* silent */
    }
  }, []);

  // Fetches the full knowledge graph for the current workspace
  const fetchGraph = useCallback(async (options = {}) => {
    if (!workspace) return;
    const startedAt = Date.now();
    const skipEmbeddingBackcheck = options.skipEmbeddingBackcheck === true;
    const loadAll = Boolean(options.all);
    const limit = Number(options.limit || 500);
    lastFetchOptionsRef.current = { all: loadAll, limit };
    setLoading(true);
    let fetchSucceeded = false;
    try {
      const nodesRes = await axios.get('/api/graph/nodes', {
        params: { workspace_id: workspace.id, all: loadAll ? 1 : 0, limit }
      });
      console.log('[Graph] Nodes received:', nodesRes.data);
      const loadedNodes = nodesRes.data.nodes || [];
      const nodeIds = new Set(loadedNodes.map((n) => n.id));

      let filteredEdges = [];
      if (loadedNodes.length > 0) {
        const nodeIdsParam = loadedNodes.map((n) => n.id).join(',');
        const edgesRes = await axios.get('/api/graph/edges', {
          params: { workspace_id: workspace.id, node_ids: nodeIdsParam }
        });
        filteredEdges = (edgesRes.data.edges || []).filter((e) => nodeIds.has(e.source_id) && nodeIds.has(e.target_id));
      }

      setNodes(loadedNodes);
      setEdges(filteredEdges);
      setIsNeighborhoodMode(false);
      setCenterNodeId(null);
      fetchSucceeded = true;
    } catch (err) {
      toast.error('Failed to load knowledge graph');
    } finally {
      await waitForMinimumLoading(startedAt, GRAPH_MIN_LOADING_MS);
      setLoading(false);
    }

    if (fetchSucceeded && !skipEmbeddingBackcheck && workspace) {
      const wsId = workspace.id;
      const opts = { ...lastFetchOptionsRef.current };
      if (!semanticBackfillOnceRef.current) {
        semanticBackfillOnceRef.current = true;
        queueMicrotask(() => {
          void (async () => {
            try {
              const res = await axios.post('/api/graph/backfill-semantic-edges', {
                workspace_id: wsId
              });
              const created = Number(res.data?.created ?? 0);
              if (created > 0) {
                await fetchGraph({ ...opts, skipEmbeddingBackcheck: true });
                toast('Graph updated', { duration: 2200 });
              }
            } catch {
              /* silent */
            }
          })();
        });
      }
      if (!embeddingBackfillOnceRef.current) {
        embeddingBackfillOnceRef.current = true;
        queueMicrotask(() => {
          void runSilentEmbeddingBackfill(wsId, async () => {
            await fetchGraph({ ...opts, skipEmbeddingBackcheck: true });
          });
        });
      }
    }
  }, [workspace, runSilentEmbeddingBackfill]);

  const fetchNeighborhood = useCallback(async (nodeId, hops = 2) => {
    if (!workspace || !nodeId) return;
    const startedAt = Date.now();
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
      await waitForMinimumLoading(startedAt, GRAPH_MIN_LOADING_MS);
      setLoading(false);
    }
  }, [workspace]);

  // Performs semantic search across graph nodes
  const search = useCallback(async (query) => {
    if (!workspace || !query.trim()) return;
    const startedAt = Date.now();
    setLoading(true);
    setAiActive(true);
    try {
      const res = await axios.post('/api/graph/search', {
        query,
        workspace_id: workspace.id,
        top_k: 12
      });
      setSearchResults(res.data.results || []);
      return res.data.results;
    } catch (err) {
      toast.error('Semantic search failed. Is Ollama running?');
      return [];
    } finally {
      await waitForMinimumLoading(startedAt, GRAPH_SEARCH_MIN_LOADING_MS);
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
