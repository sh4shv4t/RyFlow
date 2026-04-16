// KnowledgeGraph — D3.js force-directed graph visualization with semantic search
// Features: node focus/fade (F1), hover tooltip (F2), semantic zoom (F3),
// local graph view (F4), edge type styling (F5)
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as d3 from 'd3';
import { Search, X, Network } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useGraph from '../../hooks/useGraph';
import useStore from '../../store/useStore';
import { GraphLoadingSkeleton } from '../shared/Skeleton';
import TypeBadge from '../shared/TypeBadge';
import { formatRelativeTime } from '../../utils/time';
import { extractTextPreview, getContentSummary, getItemTitle } from '../../utils/content';

const NODE_COLORS = {
  document: '#E8000D',
  task: '#FF6B00',
  code: '#3B82F6',
  canvas: '#00BCD4',
  ai_chat: '#8B5CF6',
  voice: '#3D9970',
  docs: '#E8000D',
  tasks: '#FF6B00',
  doc: '#E8000D'
};

// Edge type → stroke style map (F5)
const EDGE_STYLES = {
  keyword:  { dasharray: '4,3', width: 1,   opacity: 0.55 },
  semantic: { dasharray: null,  width: 0.8, opacity: 0.6  },
  llm:      { dasharray: '2,2', width: 1,   opacity: 0.4  },
  default:  { dasharray: null,  width: 1,   opacity: 0.6  }
};

function normalizeType(type) {
  if (type === 'docs') return 'document';
  if (type === 'doc') return 'document';
  if (type === 'tasks') return 'task';
  return type || 'document';
}

function getCSSVar(name, fallback) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

// Classifies an edge into one of the four style buckets (F5).
function getEdgeType(edge) {
  if (edge.edge_type && edge.edge_type !== 'default') return edge.edge_type;
  const l = String(edge.relationship_label || '').toLowerCase();
  if (l.startsWith('shares:') || l.startsWith('related:')) return 'keyword';
  if (l) return 'llm';
  return 'default';
}

// BFS N-hop neighbourhood used for local view (F4).
function bfsNeighborhood(nodes, edges, centerId, hops) {
  const adjMap = new Map();
  for (const e of edges) {
    const s = e.source_id || (typeof e.source === 'object' ? e.source.id : e.source);
    const t = e.target_id || (typeof e.target === 'object' ? e.target.id : e.target);
    if (!adjMap.has(s)) adjMap.set(s, []);
    if (!adjMap.has(t)) adjMap.set(t, []);
    adjMap.get(s).push(t);
    adjMap.get(t).push(s);
  }
  const visited = new Set([centerId]);
  let frontier = new Set([centerId]);
  for (let i = 0; i < hops; i++) {
    const next = new Set();
    for (const id of frontier) {
      for (const neighbor of (adjMap.get(id) || [])) {
        if (!visited.has(neighbor)) { visited.add(neighbor); next.add(neighbor); }
      }
    }
    frontier = next;
    if (!frontier.size) break;
  }
  return visited;
}

export default function KnowledgeGraph() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const zoomRef = useRef(null);
  const gRef = useRef(null);
  const draggingRef = useRef(false);
  const labelsRef = useRef(null); // d3 selection of all label <text> elements
  const [dims, setDims] = useState({ w: 900, h: 650 });

  // Search state (existing)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightedIds, setHighlightedIds] = useState(new Set());
  const [showAllNodes, setShowAllNodes] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  // F1 — focus state
  const [focusNodeId, setFocusNodeId] = useState(null);

  // F2 — hover tooltip state
  const [hoverInfo, setHoverInfo] = useState(null); // { node, x, y } | null

  // F3 — zoom scale (for label visibility)
  const [zoomScale, setZoomScale] = useState(1);

  // F4 — local view
  const [localView, setLocalView] = useState(false);
  const [localHops, setLocalHops] = useState(2);

  const { workspace, theme } = useStore();
  const {
    nodes,
    edges,
    loading,
    fetchGraph,
    fetchNeighborhood,
    isNeighborhoodMode,
    centerNodeId,
    search
  } = useGraph();

  // Fetch graph data on mount.
  useEffect(() => {
    fetchGraph({ all: showAllNodes, limit: showAllNodes ? 900 : 160 });
  }, [fetchGraph, showAllNodes]);

  // Tracks graph viewport size so force layout always uses real dimensions.
  useEffect(() => {
    if (!containerRef.current) return;
    const applyDims = (width, height) => {
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    };
    const initialRect = containerRef.current.getBoundingClientRect();
    applyDims(initialRect.width, initialRect.height);
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      applyDims(width, height);
    });
    ro.observe(containerRef.current);
    const fallbackTimer = setTimeout(() => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (rect.width < 10 || rect.height < 10) setDims({ w: 900, h: 650 });
    }, 220);
    return () => { clearTimeout(fallbackTimer); ro.disconnect(); };
  }, []);

  // F3: apply label visibility based on current zoom scale and node degree.
  const applyLabelVisibility = useCallback((k, labelsSel, degreeMap) => {
    if (!labelsSel) return;
    labelsSel
      .transition().duration(150).ease(d3.easeLinear)
      .attr('opacity', (d) => {
        if (k >= 1.0) return 1;
        if (k < 0.6) return 0;
        // Between 0.6 and 1.0: only show labels for nodes with degree ≥ 3.
        const degree = d.degree_centrality != null
          ? d.degree_centrality
          : (degreeMap ? (degreeMap.get(d.id) || 0) : 0);
        return degree >= 3 ? 1 : 0;
      });
  }, []);

  // Main D3 render effect.
  useEffect(() => {
    if (loading) return;
    if (dims.w < 10 || dims.h < 10) return;
    if (!svgRef.current) return;

    try {
      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();
      labelsRef.current = null;

      const W = dims.w;
      const H = dims.h;
      const linkColor = getCSSVar('--border-default', '#475569');
      const accentColor = getCSSVar('--accent', '#E8000D');
      const textSecondary = getCSSVar('--text-secondary', '#94A3B8');
      const textTertiary = getCSSVar('--text-tertiary', '#64748B');
      const borderStrong = getCSSVar('--border-strong', '#64748B');

      svg
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .style('background', 'var(--bg-base)');

      if (!nodes.length) return;

      // F4 — filter to local neighbourhood if active and a focus node is selected.
      let effectiveNodes = nodes;
      let effectiveEdges = edges;
      if (localView && focusNodeId) {
        const ids = bfsNeighborhood(nodes, edges, focusNodeId, localHops);
        effectiveNodes = nodes.filter((n) => ids.has(n.id));
        effectiveEdges = edges.filter((e) => ids.has(e.source_id) && ids.has(e.target_id));
      }

      const graphNodes = effectiveNodes.map((n) => ({ ...n, type: normalizeType(n.type) }));
      const validEdges = effectiveEdges
        .map((e) => ({ ...e, source: e.source_id, target: e.target_id }))
        .filter((e) => graphNodes.some((n) => n.id === e.source) && graphNodes.some((n) => n.id === e.target));

      // Compute fallback degree map from validEdges (used when degree_centrality not in node data).
      const degreeMap = new Map();
      for (const e of validEdges) {
        const s = typeof e.source === 'object' ? e.source.id : e.source;
        const t = typeof e.target === 'object' ? e.target.id : e.target;
        degreeMap.set(s, (degreeMap.get(s) || 0) + 1);
        degreeMap.set(t, (degreeMap.get(t) || 0) + 1);
      }

      // F1 — compute focused neighbour set (used for opacity rules).
      const focusedIds = new Set();
      if (focusNodeId && highlightedIds.size === 0) {
        focusedIds.add(focusNodeId);
        for (const e of validEdges) {
          const s = typeof e.source === 'object' ? e.source.id : e.source;
          const t = typeof e.target === 'object' ? e.target.id : e.target;
          if (s === focusNodeId) focusedIds.add(t);
          if (t === focusNodeId) focusedIds.add(s);
        }
      }

      const spread = Math.min(W, H) * 0.4;
      const positionedNodes = graphNodes.map((n) => ({
        ...n,
        x: n.x != null ? n.x : W / 2 + (Math.random() - 0.5) * spread * 2,
        y: n.y != null ? n.y : H / 2 + (Math.random() - 0.5) * spread * 2
      }));

      const g = svg.append('g');
      gRef.current = g.node();

      // F3 — capture zoom scale and apply label visibility on zoom.
      const zoomBehavior = d3.zoom().scaleExtent([0.2, 6]).on('zoom', (event) => {
        g.attr('transform', event.transform);
        const k = event.transform.k;
        setZoomScale(k);
        if (labelsRef.current) applyLabelVisibility(k, labelsRef.current, degreeMap);
      });
      zoomRef.current = zoomBehavior;
      svg.call(zoomBehavior);

      // F1 — clear focus when clicking empty SVG canvas.
      svg.on('click', (event) => {
        if (event.target === svgRef.current) {
          setFocusNodeId(null);
        }
      });

      const simulation = d3.forceSimulation(positionedNodes)
        .force('link', d3.forceLink(validEdges).id((d) => d.id).distance(110).strength(0.4))
        .force('charge', d3.forceManyBody().strength(-380).distanceMin(30).distanceMax(500))
        .force('center', d3.forceCenter(W / 2, H / 2))
        .force('collide', d3.forceCollide(42).strength(0.85))
        .force('x', d3.forceX(W / 2).strength(0.03))
        .force('y', d3.forceY(H / 2).strength(0.03))
        .alphaDecay(0.02)
        .velocityDecay(0.4);

      simulation.tick(200);

      // F5 — render edges with type-based stroke styles.
      const links = g.append('g').selectAll('line').data(validEdges).enter().append('line')
        .attr('stroke', (d) => {
          if (!selectedNode) return linkColor;
          const s = typeof d.source === 'object' ? d.source.id : d.source;
          const t = typeof d.target === 'object' ? d.target.id : d.target;
          return s === selectedNode.id || t === selectedNode.id ? accentColor : linkColor;
        })
        .attr('stroke-opacity', (d) => {
          const et = getEdgeType(d);
          const base = EDGE_STYLES[et]?.opacity ?? 0.6;
          // F1 — fade edges that don't touch the focused node.
          if (focusedIds.size > 0 && highlightedIds.size === 0) {
            const s = typeof d.source === 'object' ? d.source.id : d.source;
            const t = typeof d.target === 'object' ? d.target.id : d.target;
            if (!focusedIds.has(s) || !focusedIds.has(t)) return 0.15;
          }
          if (!selectedNode) return base;
          const s = typeof d.source === 'object' ? d.source.id : d.source;
          const t = typeof d.target === 'object' ? d.target.id : d.target;
          return s === selectedNode.id || t === selectedNode.id ? 1.0 : base;
        })
        .attr('stroke-width', (d) => {
          const et = getEdgeType(d);
          const base = EDGE_STYLES[et]?.width ?? 1;
          if (!selectedNode) return base;
          const s = typeof d.source === 'object' ? d.source.id : d.source;
          const t = typeof d.target === 'object' ? d.target.id : d.target;
          return s === selectedNode.id || t === selectedNode.id ? base + 0.5 : base;
        })
        .attr('stroke-dasharray', (d) => EDGE_STYLES[getEdgeType(d)]?.dasharray || null);

      const nodeGroups = g.selectAll('.node').data(positionedNodes).enter().append('g')
        .attr('class', 'node')
        .style('cursor', 'pointer')
        .call(
          d3.drag()
            .on('start', (event, d) => {
              draggingRef.current = true;
              if (!event.active) simulation.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
            })
            .on('drag', (event, d) => {
              d.fx = event.x;
              d.fy = event.y;
            })
            .on('end', (event, d) => {
              draggingRef.current = false;
              if (!event.active) simulation.alphaTarget(0);
              d.fx = null;
              d.fy = null;
            })
        );

      nodeGroups.append('circle')
        .attr('r', (d) => (selectedNode?.id === d.id ? 11 : 7))
        .attr('fill', (d) => NODE_COLORS[d.type] || textTertiary)
        .attr('stroke', (d) => {
          const fill = NODE_COLORS[d.type] || textTertiary;
          const darker = d3.color(fill)?.darker(0.8);
          return darker ? darker.formatHex() : borderStrong;
        })
        .attr('stroke-width', 1.5)
        .attr('opacity', (d) => {
          // F1 — search highlight takes precedence over focus.
          if (highlightedIds.size > 0) return highlightedIds.has(d.id) ? 1 : 0.35;
          if (focusedIds.size > 0) return focusedIds.has(d.id) ? 1 : 0.15;
          return 1;
        });

      // F3 — labels rendered with initial opacity from current zoom level.
      const labelsSel = nodeGroups.append('text')
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('font-family', 'Inter, sans-serif')
        .attr('fill', textSecondary)
        .attr('dy', -13)
        .attr('opacity', 1) // will be updated by applyLabelVisibility
        .text((d) => {
          const title = getItemTitle(d);
          const clean = extractTextPreview(title, 22) || 'Untitled';
          return clean.length > 22 ? clean.slice(0, 22) + '…' : clean;
        });

      labelsRef.current = labelsSel;

      // F2 — hover tooltip: mouseenter / mousemove / mouseleave on node groups.
      // Uses the SVG container's bounding rect to convert mouse coords to relative px.
      nodeGroups
        .on('mouseenter', function (event, d) {
          if (draggingRef.current) return;
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect) return;
          const TIP_W = 260, TIP_H = 96;
          const rawX = event.clientX - rect.left + 12;
          const rawY = event.clientY - rect.top + 12;
          const x = Math.min(Math.max(rawX, 8), (rect.width || dims.w) - TIP_W - 8);
          const y = Math.min(Math.max(rawY, 8), (rect.height || dims.h) - TIP_H - 8);
          setHoverInfo({ node: d, x, y });
        })
        .on('mousemove', function (event) {
          if (draggingRef.current) { setHoverInfo(null); return; }
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect) return;
          const TIP_W = 260, TIP_H = 96;
          const rawX = event.clientX - rect.left + 12;
          const rawY = event.clientY - rect.top + 12;
          const x = Math.min(Math.max(rawX, 8), (rect.width || dims.w) - TIP_W - 8);
          const y = Math.min(Math.max(rawY, 8), (rect.height || dims.h) - TIP_H - 8);
          setHoverInfo((prev) => prev ? { ...prev, x, y } : null);
        })
        .on('mouseleave', function () {
          setHoverInfo(null);
        });

      // F1 — click: set focus + selected + fetch neighbourhood (preserving existing side-pane behaviour).
      nodeGroups.on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNode(d);
        setFocusNodeId((prev) => (prev === d.id ? null : d.id));
        fetchNeighborhood(d.id, 2).catch(() => {});
      });

      const updatePositions = () => {
        links
          .attr('x1', (d) => (typeof d.source === 'object' ? d.source.x : 0))
          .attr('y1', (d) => (typeof d.source === 'object' ? d.source.y : 0))
          .attr('x2', (d) => (typeof d.target === 'object' ? d.target.x : 0))
          .attr('y2', (d) => (typeof d.target === 'object' ? d.target.y : 0));
        nodeGroups.attr('transform', (d) => `translate(${d.x}, ${d.y})`);
      };

      updatePositions();
      simulation.on('tick', updatePositions);

      setTimeout(() => {
        if (!svgRef.current || !gRef.current || !zoomRef.current) return;
        const bbox = gRef.current.getBBox();
        if (!bbox.width || !bbox.height) return;
        const svgW = svgRef.current.clientWidth || W;
        const svgH = svgRef.current.clientHeight || H;
        const pad = 64;
        const scale = Math.min(1.5, (svgW - pad * 2) / bbox.width, (svgH - pad * 2) / bbox.height);
        const tx = (svgW - scale * bbox.width) / 2 - scale * bbox.x;
        const ty = (svgH - scale * bbox.height) / 2 - scale * bbox.y;
        d3.select(svgRef.current)
          .transition().duration(500)
          .call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
        // F3 — apply initial label visibility after fit-to-screen.
        if (labelsRef.current) applyLabelVisibility(scale, labelsRef.current, degreeMap);
      }, 0);

      return () => {
        simulation.stop();
        gRef.current = null;
      };
    } catch (err) {
      console.error('[Graph] Render effect failed:', err);
    }
  }, [loading, nodes, edges, selectedNode, highlightedIds, focusNodeId, localView, localHops, fetchNeighborhood, dims.w, dims.h, theme, applyLabelVisibility]);

  // Zooms and pans graph so currently loaded nodes fit into viewport.
  const handleFitToScreen = useCallback(() => {
    if (!svgRef.current || !gRef.current || !zoomRef.current) return;
    const bbox = gRef.current.getBBox();
    if (!bbox.width || !bbox.height) return;
    const svgW = svgRef.current.clientWidth || dims.w;
    const svgH = svgRef.current.clientHeight || dims.h;
    const pad = 64;
    const scale = Math.min(1.5, (svgW - pad * 2) / bbox.width, (svgH - pad * 2) / bbox.height);
    const tx = (svgW - scale * bbox.width) / 2 - scale * bbox.x;
    const ty = (svgH - scale * bbox.height) / 2 - scale * bbox.y;
    d3.select(svgRef.current)
      .transition().duration(500)
      .call(zoomRef.current.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }, [dims.w, dims.h]);

  // Handles semantic search.
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setHighlightedIds(new Set());
      return;
    }
    const results = await search(searchQuery);
    if (results?.length) {
      setHighlightedIds(new Set(results.map((r) => r.id)));
      setSelectedNode(results[0]);
    }
  }, [searchQuery, search]);

  const handleBackfillKeywordEdges = useCallback(async () => {
    if (!workspace?.id || backfilling) return;
    setBackfilling(true);
    try {
      const res = await axios.post('/api/graph/backfill-keyword-edges', { workspace_id: workspace.id });
      await fetchGraph({ all: showAllNodes, limit: 500 });
      toast.success(`Keyword edges added: ${Number(res.data?.created || 0)}`);
    } catch {
      toast.error('Keyword edge backfill failed');
    } finally {
      setBackfilling(false);
    }
  }, [workspace?.id, backfilling, fetchGraph, showAllNodes]);

  // Opens the most relevant workspace screen for a selected graph node.
  const handleOpenNode = useCallback((node) => {
    if (!node) return;
    const type = normalizeType(node.type);
    if (type === 'document') { navigate(node.source_id ? `/editor/${node.source_id}` : '/documents'); return; }
    if (type === 'code') { navigate(node.source_id ? `/code/${node.source_id}` : '/code'); return; }
    if (type === 'canvas') { navigate(node.source_id ? `/canvas/${node.source_id}` : '/canvas'); return; }
    if (type === 'task') { navigate('/tasks'); return; }
    navigate('/documents');
  }, [navigate]);

  const selectedType = normalizeType(selectedNode?.type);

  // Compute right-panel offset for button stack.
  const panelOffset = selectedNode ? '316px' : '16px';

  if (loading) return <GraphLoadingSkeleton />;

  return (
    <div
      ref={containerRef}
      data-testid="knowledge-graph-container"
      style={{
        width: '100%', height: '100%', position: 'relative',
        overflow: 'hidden', minHeight: 0, flex: 1,
        backgroundColor: 'var(--bg-base)'
      }}
    >
      <svg
        ref={svgRef}
        data-testid="knowledge-graph-svg"
        width="100%"
        height="100%"
        style={{ display: 'block', width: '100%', height: '100%' }}
      />

      {/* F2 — Hover tooltip (React-layer so it escapes SVG clipping) */}
      {hoverInfo && (
        <div
          style={{
            position: 'absolute',
            left: hoverInfo.x,
            top: hoverInfo.y,
            width: '260px',
            maxHeight: '96px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: '6px',
            padding: '8px 10px',
            zIndex: 50,
            pointerEvents: 'none',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            overflow: 'hidden'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            <TypeBadge type={normalizeType(hoverInfo.node.type)} />
            <span style={{
              fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1
            }}>
              {String(getItemTitle(hoverInfo.node) || 'Untitled').slice(0, 60)}
            </span>
          </div>
          {getContentSummary(hoverInfo.node, 100) && (
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4', margin: 0 }}>
              {String(getContentSummary(hoverInfo.node, 100) || '').slice(0, 100)}
            </p>
          )}
        </div>
      )}

      {/* Search bar */}
      <div style={{
        position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, width: '400px', backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-default)', borderRadius: '6px',
        display: 'flex', alignItems: 'center', padding: '0 12px', gap: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
      }}>
        <Search size={14} color="var(--text-tertiary)" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search knowledge graph..."
          style={{
            flex: 1, height: '36px', backgroundColor: 'transparent',
            border: 'none', fontSize: '13px', color: 'var(--text-primary)'
          }}
        />
        {searchQuery && (
          <button
            onClick={() => { setSearchQuery(''); setHighlightedIds(new Set()); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
          >
            <X size={12} color="var(--text-tertiary)" />
          </button>
        )}
        <button
          onClick={handleSearch}
          style={{
            height: '28px', borderRadius: '4px', border: '1px solid var(--border-default)',
            backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)',
            fontSize: '11px', padding: '0 8px', cursor: 'pointer'
          }}
        >
          Search
        </button>
      </div>

      {/* Node type legend (bottom-left) */}
      <div style={{
        position: 'absolute', bottom: '16px', left: '16px', zIndex: 10,
        backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '4px', padding: '8px 12px', display: 'flex', gap: '12px', alignItems: 'center'
      }}>
        {Object.entries({ document: '#E8000D', task: '#FF6B00', code: '#3B82F6', ai_chat: '#8B5CF6', voice: '#3D9970' }).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color }} />
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.06em', fontWeight: '500' }}>
              {type.replace('_', ' ')}
            </span>
          </div>
        ))}
      </div>

      {/* F5 — Edge type legend (bottom-left, below node legend) */}
      <div style={{
        position: 'absolute', bottom: '52px', left: '16px', zIndex: 10,
        backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '4px', padding: '6px 12px', display: 'flex', gap: '14px', alignItems: 'center'
      }}>
        {[
          { label: 'keyword', dasharray: '4,3' },
          { label: 'inferred', dasharray: '2,2' },
          { label: 'semantic', dasharray: null }
        ].map(({ label, dasharray }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width="22" height="10" style={{ display: 'block' }}>
              <line
                x1="0" y1="5" x2="22" y2="5"
                stroke="var(--text-tertiary)"
                strokeWidth="1.5"
                strokeDasharray={dasharray || undefined}
              />
            </svg>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.06em', fontWeight: '500' }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Node count */}
      <div style={{
        position: 'absolute', top: '16px', right: panelOffset, zIndex: 10,
        backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '4px', padding: '4px 10px', fontSize: '11px', color: 'var(--text-tertiary)'
      }}>
        {nodes.length} nodes
      </div>

      {/* All / Fast mode toggle */}
      <button
        onClick={() => setShowAllNodes((prev) => !prev)}
        style={{
          position: 'absolute', top: '52px', right: panelOffset, zIndex: 10,
          height: '26px', borderRadius: '4px',
          border: showAllNodes ? '1px solid rgba(232,0,13,0.3)' : '1px solid var(--border-default)',
          backgroundColor: showAllNodes ? 'rgba(232,0,13,0.1)' : 'var(--bg-surface)',
          color: showAllNodes ? 'var(--accent)' : 'var(--text-tertiary)',
          fontSize: '11px', padding: '0 8px', cursor: 'pointer'
        }}
      >
        {showAllNodes ? 'All Nodes' : 'Fast Mode'}
      </button>

      {/* Fit to screen */}
      <button
        onClick={handleFitToScreen}
        style={{
          position: 'absolute', top: '84px', right: panelOffset, zIndex: 10,
          height: '26px', borderRadius: '4px', border: '1px solid var(--border-default)',
          backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)',
          fontSize: '11px', padding: '0 8px', cursor: 'pointer'
        }}
      >
        Fit to Screen
      </button>

      {/* F4 — Local view toggle */}
      <button
        onClick={() => setLocalView((prev) => !prev)}
        style={{
          position: 'absolute', top: '116px', right: panelOffset, zIndex: 10,
          height: '26px', borderRadius: '4px',
          border: localView ? '1px solid rgba(232,0,13,0.3)' : '1px solid var(--border-default)',
          backgroundColor: localView ? 'rgba(232,0,13,0.1)' : 'var(--bg-surface)',
          color: localView ? 'var(--accent)' : 'var(--text-tertiary)',
          fontSize: '11px', padding: '0 8px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '4px'
        }}
      >
        <Network size={11} />
        {localView ? 'Local View' : 'Local View'}
      </button>

      {/* F4 — Hop depth selector (shown when local view active) */}
      {localView && (
        <div style={{
          position: 'absolute', top: '148px', right: panelOffset, zIndex: 10,
          display: 'flex', gap: '2px'
        }}>
          {[1, 2, 3].map((h) => (
            <button
              key={h}
              onClick={() => setLocalHops(h)}
              style={{
                height: '22px', width: '26px', borderRadius: '3px', fontSize: '10px',
                border: localHops === h ? '1px solid rgba(232,0,13,0.5)' : '1px solid var(--border-default)',
                backgroundColor: localHops === h ? 'rgba(232,0,13,0.15)' : 'var(--bg-surface)',
                color: localHops === h ? 'var(--accent)' : 'var(--text-tertiary)',
                cursor: 'pointer'
              }}
            >
              {h}
            </button>
          ))}
        </div>
      )}

      {/* Exit neighbourhood (existing feature) */}
      {isNeighborhoodMode && centerNodeId && (
        <button
          onClick={() => fetchGraph({ all: showAllNodes, limit: 500 })}
          style={{
            position: 'absolute', top: localView ? '180px' : '148px', right: panelOffset, zIndex: 10,
            height: '26px', borderRadius: '4px', border: '1px solid var(--border-default)',
            backgroundColor: 'var(--bg-surface)', color: 'var(--text-secondary)',
            fontSize: '11px', padding: '0 8px', cursor: 'pointer'
          }}
        >
          Exit Neighborhood
        </button>
      )}

      {/* F4 — Empty state prompt when local view is active but no node selected */}
      {localView && !focusNodeId && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: '8px', padding: '16px 24px', zIndex: 15, textAlign: 'center',
          pointerEvents: 'none'
        }}>
          <Network size={20} color="var(--text-tertiary)" style={{ margin: '0 auto 8px' }} />
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
            Click a node to explore its neighbourhood
          </p>
        </div>
      )}

      {/* Right side panel — selected node details */}
      <div style={{
        position: 'absolute', top: 0, right: 0, width: '300px', height: '100%',
        backgroundColor: 'var(--bg-surface)', borderLeft: '1px solid var(--border-default)',
        padding: '20px', overflowY: 'auto', zIndex: 20,
        display: selectedNode ? 'flex' : 'none', flexDirection: 'column', gap: '12px'
      }}>
        <button
          onClick={() => setSelectedNode(null)}
          style={{
            position: 'absolute', top: '16px', right: '16px', width: '26px', height: '26px',
            borderRadius: '4px', border: 'none', backgroundColor: 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <X size={14} color="var(--text-tertiary)" />
        </button>

        <TypeBadge type={selectedType} />

        <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', lineHeight: '1.3', marginTop: '4px' }}>
          {getItemTitle(selectedNode)}
        </h3>

        {getContentSummary(selectedNode, 280) && (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {getContentSummary(selectedNode, 280)}
          </p>
        )}

        {selectedNode?.degree_centrality != null && (
          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
            Connections: {selectedNode.degree_centrality}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
          Created: {formatRelativeTime(selectedNode?.created_at)}
        </div>

        <button
          onClick={() => handleOpenNode(selectedNode)}
          style={{
            marginTop: 'auto', width: '100%', padding: '8px',
            backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
            borderRadius: '6px', fontSize: '13px', color: 'var(--text-primary)',
            cursor: 'pointer', textAlign: 'center'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-overlay)';
            e.currentTarget.style.borderColor = 'var(--border-strong)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
            e.currentTarget.style.borderColor = 'var(--border-default)';
          }}
        >
          Open
        </button>
      </div>
    </div>
  );
}
