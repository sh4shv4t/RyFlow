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

// Edge visuals: colour is primary (theme tokens); dash/dot secondary for accessibility (TASK 4).
function edgeBaseVisual(et) {
  switch (et) {
    case 'keyword':
      return { stroke: 'var(--text-tertiary)', dasharray: '4 4', linecap: 'butt', width: 1.1, opacity: 0.5 };
    case 'semantic':
      return { stroke: 'var(--accent)', dasharray: null, linecap: 'round', width: 1.05, opacity: 0.4 };
    case 'llm':
      return { stroke: 'var(--graph-edge-inferred)', dasharray: '2 3', linecap: 'round', width: 1, opacity: 0.45 };
    default:
      return { stroke: 'var(--border-default)', dasharray: null, linecap: 'round', width: 1, opacity: 0.35 };
  }
}

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
  if (edge.edge_type && edge.edge_type !== 'default') {
    if (edge.edge_type === 'embedding') return 'semantic';
    return edge.edge_type;
  }
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

// Neighbours of focusNodeId for F1 (1-hop), using edges with string source/target ids.
function neighbourIdsFromEdges(validEdges, focusNodeId) {
  const ids = new Set([focusNodeId]);
  for (const e of validEdges) {
    const s = typeof e.source === 'object' ? e.source.id : e.source;
    const t = typeof e.target === 'object' ? e.target.id : e.target;
    if (s === focusNodeId) ids.add(t);
    if (t === focusNodeId) ids.add(s);
  }
  return ids;
}

export default function KnowledgeGraph() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const zoomRef = useRef(null);
  const gRef = useRef(null);
  const draggingRef = useRef(false);
  const labelsRef = useRef(null); // d3 selection of all label <text> elements
  const graphLiveRef = useRef({
    links: null,
    circles: null,
    degreeMap: null,
    validEdges: []
  });
  const tooltipRafRef = useRef(null);
  const pendingTooltipRef = useRef(null);
  const hoverNodeIdRef = useRef(null);
  const zoomKRef = useRef(1);
  const applyVisualsRef = useRef(() => {});
  const stateForVisualsRef = useRef({
    selectedNode: null,
    highlightedIds: new Set(),
    focusNodeId: null
  });
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

  // F3: label visibility from zoom scale. During live zoom use instant attrs (no transition) to avoid jank.
  const applyLabelVisibility = useCallback((k, labelsSel, degreeMap, animate) => {
    if (!labelsSel) return;
    const labelOpacity = (d) => {
      if (k >= 1.0) return 1;
      if (k < 0.6) return 0;
      const degree = d.degree_centrality != null
        ? d.degree_centrality
        : (degreeMap ? (degreeMap.get(d.id) || 0) : 0);
      return degree >= 3 ? 1 : 0;
    };
    if (animate) {
      labelsSel.transition().duration(150).ease(d3.easeCubicOut).attr('opacity', labelOpacity);
    } else {
      labelsSel.interrupt().attr('opacity', labelOpacity);
    }
  }, []);

  useEffect(() => {
    stateForVisualsRef.current = { selectedNode, highlightedIds, focusNodeId };
  }, [selectedNode, highlightedIds, focusNodeId]);

  const flushTooltipPosition = useCallback(() => {
    tooltipRafRef.current = null;
    const pending = pendingTooltipRef.current;
    if (!pending) return;
    setHoverInfo((prev) => (prev && prev.node?.id === pending.node?.id
      ? { ...prev, x: pending.x, y: pending.y }
      : prev));
  }, []);

  const scheduleTooltipPosition = useCallback((node, x, y) => {
    pendingTooltipRef.current = { node, x, y };
    if (tooltipRafRef.current == null) {
      tooltipRafRef.current = requestAnimationFrame(flushTooltipPosition);
    }
  }, [flushTooltipPosition]);

  // Main D3 render effect.
  useEffect(() => {
    if (loading) return;
    if (dims.w < 10 || dims.h < 10) return;
    if (!svgRef.current) return;

    try {
      hoverNodeIdRef.current = null;
      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();
      labelsRef.current = null;

      const W = dims.w;
      const H = dims.h;
      const textSecondary = getCSSVar('--text-secondary', '#94A3B8');
      const textTertiary = getCSSVar('--text-tertiary', '#64748B');
      const borderStrong = getCSSVar('--border-strong', '#64748B');

      svg
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .style('background', 'var(--bg-base)');

      if (!nodes.length) {
        graphLiveRef.current = { links: null, circles: null, degreeMap: null, validEdges: [] };
        return;
      }

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

      const spread = Math.min(W, H) * 0.4;
      const positionedNodes = graphNodes.map((n) => ({
        ...n,
        x: n.x != null ? n.x : W / 2 + (Math.random() - 0.5) * spread * 2,
        y: n.y != null ? n.y : H / 2 + (Math.random() - 0.5) * spread * 2
      }));

      const g = svg.append('g');
      gRef.current = g.node();

      // F3 — zoom: do not call React setState here (was causing a full re-render every frame).
      // Label opacity updates are cheap DOM writes only.
      const zoomBehavior = d3.zoom().scaleExtent([0.2, 6]).on('zoom', (event) => {
        g.attr('transform', event.transform);
        const k = event.transform.k;
        zoomKRef.current = k;
        if (labelsRef.current) applyLabelVisibility(k, labelsRef.current, degreeMap, false);
      });
      zoomRef.current = zoomBehavior;
      svg.call(zoomBehavior);

      // F1 — clear focus when clicking empty SVG canvas.
      svg.on('click', (event) => {
        if (event.target === svgRef.current) {
          setFocusNodeId(null);
        }
      });

      const isLarge = graphNodes.length > 300;
      const simulation = d3.forceSimulation(positionedNodes)
        .force('link', d3.forceLink(validEdges).id((d) => d.id).distance(110).strength(0.4).iterations(1))
        .force('charge', d3.forceManyBody().strength(-380).distanceMin(30).distanceMax(800))
        .force('center', d3.forceCenter(W / 2, H / 2))
        .force('collide', d3.forceCollide(42).strength(0.85))
        .force('x', d3.forceX(W / 2).strength(0.03))
        .force('y', d3.forceY(H / 2).strength(0.03))
        .alphaDecay(isLarge ? 0.05 : 0.03)
        .velocityDecay(0.4)
        .alphaMin(0.001);

      // Edges: geometry + theme colours (TASK 4); selection/focus/hover via applyVisualsRef.
      const links = g.append('g').selectAll('line').data(validEdges, (d) => d.id).enter().append('line')
        .attr('stroke', (d) => edgeBaseVisual(getEdgeType(d)).stroke)
        .attr('stroke-opacity', (d) => edgeBaseVisual(getEdgeType(d)).opacity)
        .attr('stroke-width', (d) => edgeBaseVisual(getEdgeType(d)).width)
        .attr('stroke-dasharray', (d) => edgeBaseVisual(getEdgeType(d)).dasharray)
        .attr('stroke-linecap', (d) => edgeBaseVisual(getEdgeType(d)).linecap);

      const nodeGroups = g.selectAll('.node').data(positionedNodes, (d) => d.id).enter().append('g')
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

      const circles = nodeGroups.append('circle')
        .attr('r', 7)
        .attr('fill', (d) => NODE_COLORS[d.type] || textTertiary)
        .attr('stroke', (d) => {
          const fill = NODE_COLORS[d.type] || textTertiary;
          const darker = d3.color(fill)?.darker(0.8);
          return darker ? darker.formatHex() : borderStrong;
        })
        .attr('stroke-width', 1.5)
        .attr('opacity', 1);

      // F3 — labels rendered with initial opacity from current zoom level.
      const labelsSel = nodeGroups.append('text')
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('font-family', 'Inter, sans-serif')
        .attr('fill', textSecondary)
        .attr('dy', -13)
        .attr('pointer-events', 'none')
        .attr('opacity', isLarge ? 0 : 1)
        .text((d) => {
          const title = getItemTitle(d);
          const clean = extractTextPreview(title, 22) || 'Untitled';
          return clean.length > 22 ? clean.slice(0, 22) + '…' : clean;
        });

      labelsRef.current = labelsSel;

      graphLiveRef.current = {
        links,
        circles,
        degreeMap,
        validEdges
      };

      const withTrans = (sel, transition) =>
        (transition ? sel.transition().duration(150).ease(d3.easeCubicOut) : sel);

      applyVisualsRef.current = (opts = {}) => {
        const { transition = false } = opts;
        const { links: linksSel, circles: circlesSel, validEdges: ve } = graphLiveRef.current;
        if (!linksSel || !circlesSel) return;
        const { selectedNode: sel, highlightedIds: hlIds, focusNodeId: focusId } = stateForVisualsRef.current;
        const accentColor = getCSSVar('--accent', '#E8000D');
        const focusedIds = focusId && hlIds.size === 0
          ? neighbourIdsFromEdges(ve, focusId)
          : new Set();
        const hoverId = hoverNodeIdRef.current;

        withTrans(linksSel, transition)
          .attr('stroke', (d) => {
            if (sel) {
              const s = typeof d.source === 'object' ? d.source.id : d.source;
              const t = typeof d.target === 'object' ? d.target.id : d.target;
              if (s === sel.id || t === sel.id) return accentColor;
            }
            return edgeBaseVisual(getEdgeType(d)).stroke;
          })
          .attr('stroke-opacity', (d) => {
            const ev = edgeBaseVisual(getEdgeType(d));
            let op = ev.opacity;
            if (focusedIds.size > 0 && hlIds.size === 0) {
              const s = typeof d.source === 'object' ? d.source.id : d.source;
              const t = typeof d.target === 'object' ? d.target.id : d.target;
              if (!focusedIds.has(s) || !focusedIds.has(t)) return 0.15;
            }
            if (sel) {
              const s = typeof d.source === 'object' ? d.source.id : d.source;
              const t = typeof d.target === 'object' ? d.target.id : d.target;
              if (s === sel.id || t === sel.id) return Math.min(1, op + 0.45);
            }
            return op;
          })
          .attr('stroke-width', (d) => {
            const ev = edgeBaseVisual(getEdgeType(d));
            const base = ev.width;
            if (sel) {
              const s = typeof d.source === 'object' ? d.source.id : d.source;
              const t = typeof d.target === 'object' ? d.target.id : d.target;
              if (s === sel.id || t === sel.id) return base + 0.6;
            }
            return base;
          })
          .attr('stroke-dasharray', (d) => {
            if (sel) {
              const s = typeof d.source === 'object' ? d.source.id : d.source;
              const t = typeof d.target === 'object' ? d.target.id : d.target;
              if (s === sel.id || t === sel.id) return null;
            }
            return edgeBaseVisual(getEdgeType(d)).dasharray;
          })
          .attr('stroke-linecap', (d) => {
            if (sel) {
              const s = typeof d.source === 'object' ? d.source.id : d.source;
              const t = typeof d.target === 'object' ? d.target.id : d.target;
              if (s === sel.id || t === sel.id) return 'round';
            }
            return edgeBaseVisual(getEdgeType(d)).linecap;
          });

        withTrans(circlesSel, transition)
          .attr('r', (d) => (sel?.id === d.id ? 11 : 7))
          .attr('opacity', (d) => {
            if (hlIds.size > 0) return hlIds.has(d.id) ? 1 : 0.35;
            if (hoverId) {
              if (focusedIds.size > 0) {
                if (d.id === hoverId) return 1;
                if (focusedIds.has(d.id)) return 1;
                return 0.15;
              }
              return d.id === hoverId ? 1 : 0.45;
            }
            if (focusedIds.size > 0) return focusedIds.has(d.id) ? 1 : 0.15;
            return 1;
          });
      };

      applyVisualsRef.current({ transition: false });

      // F2 — tooltip: one React state update on enter/leave; position throttled via rAF on move.
      const clampTip = (rawX, rawY, rect) => {
        const TIP_W = 260;
        const TIP_H = 96;
        const rw = rect.width || dims.w;
        const rh = rect.height || dims.h;
        return {
          x: Math.min(Math.max(rawX, 8), rw - TIP_W - 8),
          y: Math.min(Math.max(rawY, 8), rh - TIP_H - 8)
        };
      };

      nodeGroups
        .on('mouseenter', function (event, d) {
          if (draggingRef.current) return;
          hoverNodeIdRef.current = d.id;
          applyVisualsRef.current({ transition: false });
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect) return;
          const rawX = event.clientX - rect.left + 12;
          const rawY = event.clientY - rect.top + 12;
          const { x, y } = clampTip(rawX, rawY, rect);
          pendingTooltipRef.current = null;
          if (tooltipRafRef.current != null) {
            cancelAnimationFrame(tooltipRafRef.current);
            tooltipRafRef.current = null;
          }
          setHoverInfo({ node: d, x, y });
        })
        .on('mousemove', function (event, d) {
          if (draggingRef.current) { setHoverInfo(null); return; }
          const rect = svgRef.current?.getBoundingClientRect();
          if (!rect) return;
          const rawX = event.clientX - rect.left + 12;
          const rawY = event.clientY - rect.top + 12;
          const { x, y } = clampTip(rawX, rawY, rect);
          scheduleTooltipPosition(d, x, y);
        })
        .on('mouseleave', function () {
          pendingTooltipRef.current = null;
          if (tooltipRafRef.current != null) {
            cancelAnimationFrame(tooltipRafRef.current);
            tooltipRafRef.current = null;
          }
          setHoverInfo(null);
          hoverNodeIdRef.current = null;
          applyVisualsRef.current({ transition: true });
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

      let tickCount = 0;
      simulation.on('tick', () => {
        tickCount += 1;
        if (tickCount % 2 !== 0) return;
        updatePositions();
      });
      simulation.on('end', () => {
        if (!isLarge || !labelsRef.current) return;
        const k = zoomKRef.current;
        applyLabelVisibility(k, labelsRef.current, degreeMap, true);
      });
      simulation.tick(80);
      updatePositions();

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
        zoomKRef.current = scale;
        // F3 — smooth label fade only after programmatic fit (not during free pan/zoom).
        if (labelsRef.current && !isLarge) applyLabelVisibility(scale, labelsRef.current, degreeMap, true);
      }, 0);

      return () => {
        simulation.stop();
        gRef.current = null;
        graphLiveRef.current = { links: null, circles: null, degreeMap: null, validEdges: [] };
        if (tooltipRafRef.current != null) {
          cancelAnimationFrame(tooltipRafRef.current);
          tooltipRafRef.current = null;
        }
      };
    } catch (err) {
      console.error('[Graph] Render effect failed:', err);
    }
  }, [loading, nodes, edges, localView, localHops, fetchNeighborhood, dims.w, dims.h, theme, applyLabelVisibility, scheduleTooltipPosition]);

  // Selection / search / focus — update attributes only (no SVG teardown).
  useEffect(() => {
    applyVisualsRef.current({ transition: true });
  }, [selectedNode, highlightedIds, focusNodeId, nodes, edges]);

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

      {/* Edge legend: colour-primary, pattern secondary (TASK 4) */}
      <div style={{
        position: 'absolute', bottom: '52px', left: '16px', zIndex: 10,
        backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)',
        borderRadius: '4px', padding: '6px 12px', display: 'flex', gap: '14px', alignItems: 'center'
      }}>
        {[
          { label: 'keyword', stroke: 'var(--text-tertiary)', dasharray: '4 4', linecap: 'butt' },
          { label: 'semantic', stroke: 'var(--accent)', dasharray: undefined, linecap: 'round' },
          { label: 'inferred', stroke: 'var(--graph-edge-inferred)', dasharray: '2 3', linecap: 'round' }
        ].map(({ label, stroke, dasharray, linecap }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <svg width="28" height="10" style={{ display: 'block' }}>
              <line
                x1="0" y1="5" x2="28" y2="5"
                stroke={stroke}
                strokeWidth="2"
                strokeLinecap={linecap}
                strokeDasharray={dasharray}
                opacity={label === 'semantic' ? 0.85 : 1}
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
