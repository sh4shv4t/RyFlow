// KnowledgeGraph — D3.js force-directed graph visualization with semantic search
// Features: click focus/fade (1-hop), semantic zoom, local graph view, solid colour edges by type
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as d3 from 'd3';
import { Search, X, Network } from 'lucide-react';
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

// Edge stroke colours (must not clash with node fills in NODE_COLORS).
const EDGE_STROKE = {
  keyword: '#8B8FA8',
  semantic: '#5B8CCC',
  llm: '#9B72CF',
  default: '#6B7280'
};

const EDGE_OPACITY_UNFOCUSED = 0.35;
const EDGE_OPACITY_HIGHLIGHT = 0.9;
const EDGE_OPACITY_DIM = 0.04;
const EDGE_WIDTH_BASE = 1.2;
const EDGE_WIDTH_HIGHLIGHT = 2;

function edgeColourForType(et) {
  return EDGE_STROKE[et] || EDGE_STROKE.default;
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

/** Fit zoom from node positions (avoids full-size hit rect inflating getBBox). */
function computeNodeExtentFitTransform(svgElement, nodes, options = {}) {
  const padding = options.padding ?? 80;
  const maxScale = options.maxScale ?? 1.2;
  const nodeRadius = options.nodeRadius ?? 24;
  const rect = svgElement.getBoundingClientRect();
  const svgW = rect.width;
  const svgH = rect.height;
  if (!nodes?.length || svgW < 8 || svgH < 8) return null;
  const xs = [];
  const ys = [];
  for (const d of nodes) {
    if (Number.isFinite(d.x) && Number.isFinite(d.y)) {
      xs.push(d.x);
      ys.push(d.y);
    }
  }
  if (!xs.length) return null;
  const xMin = Math.min(...xs) - nodeRadius;
  const xMax = Math.max(...xs) + nodeRadius;
  const yMin = Math.min(...ys) - nodeRadius;
  const yMax = Math.max(...ys) + nodeRadius;
  const graphWidth = Math.max(1, xMax - xMin);
  const graphHeight = Math.max(1, yMax - yMin);
  const scaleX = (svgW - padding * 2) / graphWidth;
  const scaleY = (svgH - padding * 2) / graphHeight;
  const scale = Math.min(scaleX, scaleY, maxScale);
  const tx = (svgW - scale * graphWidth) / 2 - scale * xMin;
  const ty = (svgH - scale * graphHeight) / 2 - scale * yMin;
  return d3.zoomIdentity.translate(tx, ty).scale(scale);
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
    validEdges: [],
    nodePositions: null
  });
  const zoomKRef = useRef(1);
  const applyVisualsRef = useRef(() => {});
  const stateForVisualsRef = useRef({
    highlightedIds: new Set(),
    focusNodeId: null
  });
  const [dims, setDims] = useState({ w: 900, h: 650 });

  // Search state (existing)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightedIds, setHighlightedIds] = useState(new Set());
  const [showAllNodes, setShowAllNodes] = useState(false);

  const [focusNodeId, setFocusNodeId] = useState(null);

  // F4 — local view
  const [localView, setLocalView] = useState(false);
  const [localHops, setLocalHops] = useState(2);

  const { theme } = useStore();
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

  const semanticEdgeCount = useMemo(
    () => edges.filter((e) => e.edge_type === 'semantic' || e.edge_type === 'embedding').length,
    [edges]
  );

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
    stateForVisualsRef.current = { highlightedIds, focusNodeId };
  }, [highlightedIds, focusNodeId]);

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
      const textSecondary = getCSSVar('--text-secondary', '#94A3B8');
      const textTertiary = getCSSVar('--text-tertiary', '#64748B');
      const borderStrong = getCSSVar('--border-strong', '#64748B');

      svg
        .attr('width', '100%')
        .attr('height', '100%')
        .attr('viewBox', `0 0 ${W} ${H}`)
        .style('background', 'var(--bg-base)');

      const defs = svg.append('defs');
      const pattern = defs
        .append('pattern')
        .attr('id', 'ryflow-dot-grid')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', 24)
        .attr('height', 24)
        .attr('patternUnits', 'userSpaceOnUse');
      pattern
        .append('circle')
        .attr('cx', 0.8)
        .attr('cy', 0.8)
        .attr('r', 0.8)
        .attr('fill', 'var(--border-default)')
        .attr('fill-opacity', theme === 'light' ? 0.08 : 0.12);

      svg
        .append('rect')
        .attr('width', W)
        .attr('height', H)
        .attr('fill', 'url(#ryflow-dot-grid)')
        .attr('pointer-events', 'none');

      if (!nodes.length) {
        graphLiveRef.current = { links: null, circles: null, degreeMap: null, validEdges: [], nodePositions: null };
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

      const applyGraphZoomFit = (withTransition) => {
        const svgEl = svgRef.current;
        const zb = zoomRef.current;
        const pos = graphLiveRef.current.nodePositions;
        if (!svgEl || !zb || !pos?.length) return;
        const t = computeNodeExtentFitTransform(svgEl, pos, { padding: 80, maxScale: 1.2, nodeRadius: 24 });
        if (!t) return;
        const sel = d3.select(svgEl);
        if (withTransition) {
          sel.transition().duration(500).call(zb.transform, t);
        } else {
          sel.call(zb.transform, t);
        }
        zoomKRef.current = t.k;
      };

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

      g.append('rect')
        .attr('width', W)
        .attr('height', H)
        .attr('fill', 'transparent')
        .attr('pointer-events', 'all')
        .style('cursor', 'grab')
        .lower()
        .on('click', () => setFocusNodeId(null));

      // Edges: solid strokes; focus/highlight via applyVisualsRef.
      const links = g.append('g').selectAll('line').data(validEdges, (d) => d.id).enter().append('line')
        .attr('stroke', (d) => edgeColourForType(getEdgeType(d)))
        .attr('stroke-opacity', EDGE_OPACITY_UNFOCUSED)
        .attr('stroke-width', EDGE_WIDTH_BASE)
        .attr('stroke-linecap', 'round');

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

      // F3 — labels: each wrapped in a <g> so rect + text share one opacity attr.
      // The <rect> gives a solid background box; width is estimated from char count.
      const labelGroups = nodeGroups.append('g')
        .attr('class', 'label-g')
        .attr('pointer-events', 'none')
        .attr('opacity', isLarge ? 0 : 1);

      labelGroups.append('rect')
        .attr('rx', 3)
        .attr('ry', 3)
        .attr('fill', 'var(--bg-surface)')
        .attr('fill-opacity', 0.88)
        .attr('stroke', 'var(--border-default)')
        .attr('stroke-width', 0.5)
        .attr('y', -22)
        .attr('height', 15)
        .attr('x', (d) => {
          const raw = extractTextPreview(getItemTitle(d), 22) || 'Untitled';
          const lbl = raw.length > 22 ? raw.slice(0, 22) + '…' : raw;
          return -(lbl.length * 3.2 + 6);
        })
        .attr('width', (d) => {
          const raw = extractTextPreview(getItemTitle(d), 22) || 'Untitled';
          const lbl = raw.length > 22 ? raw.slice(0, 22) + '…' : raw;
          return lbl.length * 6.4 + 12;
        });

      labelGroups.append('text')
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('font-family', 'Inter, sans-serif')
        .attr('fill', textSecondary)
        .attr('dy', -11)
        .text((d) => {
          const title = getItemTitle(d);
          const clean = extractTextPreview(title, 22) || 'Untitled';
          return clean.length > 22 ? clean.slice(0, 22) + '…' : clean;
        });

      labelsRef.current = labelGroups;

      graphLiveRef.current = {
        links,
        circles,
        degreeMap,
        validEdges,
        nodePositions: positionedNodes
      };

      const withTrans = (sel, transition) =>
        (transition ? sel.transition().duration(150).ease(d3.easeCubicOut) : sel);

      applyVisualsRef.current = (opts = {}) => {
        const { transition = false } = opts;
        const { links: linksSel, circles: circlesSel, validEdges: ve } = graphLiveRef.current;
        if (!linksSel || !circlesSel) return;
        const { highlightedIds: hlIds, focusNodeId: focusId } = stateForVisualsRef.current;
        const hasFocus = focusId != null;
        const neighborSet = hasFocus ? neighbourIdsFromEdges(ve, focusId) : null;

        withTrans(linksSel, transition)
          .attr('stroke', (d) => edgeColourForType(getEdgeType(d)))
          .attr('stroke-opacity', (d) => {
            const s = typeof d.source === 'object' ? d.source.id : d.source;
            const t = typeof d.target === 'object' ? d.target.id : d.target;
            if (hasFocus) {
              if (s === focusId || t === focusId) return EDGE_OPACITY_HIGHLIGHT;
              return EDGE_OPACITY_DIM;
            }
            return EDGE_OPACITY_UNFOCUSED;
          })
          .attr('stroke-width', (d) => {
            const s = typeof d.source === 'object' ? d.source.id : d.source;
            const t = typeof d.target === 'object' ? d.target.id : d.target;
            if (hasFocus && (s === focusId || t === focusId)) return EDGE_WIDTH_HIGHLIGHT;
            return EDGE_WIDTH_BASE;
          })
          .attr('stroke-linecap', 'round');

        withTrans(circlesSel, transition)
          .attr('r', 7)
          .attr('opacity', (d) => {
            if (hasFocus) return neighborSet.has(d.id) ? 1 : 0.08;
            if (hlIds.size > 0) return hlIds.has(d.id) ? 1 : 0.35;
            return 1;
          });
      };

      applyVisualsRef.current({ transition: false });

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

      // For large graphs throttle more aggressively (every 3rd tick) to halve DOM mutations.
      const tickStep = isLarge ? 3 : 2;
      let tickCount = 0;
      simulation.on('tick', () => {
        tickCount += 1;
        if (tickCount % tickStep !== 0) return;
        updatePositions();
      });
      simulation.stop();
      const maxTicks = isLarge ? 520 : 620;
      let tickI = 0;
      while (simulation.alpha() > simulation.alphaMin() && tickI < maxTicks) {
        simulation.tick();
        tickI += 1;
        if (tickI % tickStep === 0) updatePositions();
      }
      updatePositions();
      requestAnimationFrame(() => {
        applyGraphZoomFit(true);
        if (labelsRef.current) {
          applyLabelVisibility(zoomKRef.current, labelsRef.current, degreeMap, !isLarge);
        }
      });

      return () => {
        simulation.stop();
        gRef.current = null;
        graphLiveRef.current = { links: null, circles: null, degreeMap: null, validEdges: [], nodePositions: null };
      };
    } catch (err) {
      console.error('[Graph] Render effect failed:', err);
    }
  }, [loading, nodes, edges, localView, localHops, fetchNeighborhood, dims.w, dims.h, theme, applyLabelVisibility]);

  // Search / focus — update attributes only (no SVG teardown).
  useEffect(() => {
    applyVisualsRef.current({ transition: true });
  }, [highlightedIds, focusNodeId]);

  // Zooms and pans graph so currently loaded nodes fit into viewport.
  const handleFitToScreen = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    const pos = graphLiveRef.current.nodePositions;
    if (!pos?.length) return;
    const t = computeNodeExtentFitTransform(svgRef.current, pos, { padding: 80, maxScale: 1.2, nodeRadius: 24 });
    if (!t) return;
    d3.select(svgRef.current).transition().duration(500).call(zoomRef.current.transform, t);
    zoomKRef.current = t.k;
  }, []);

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

      {/* Edge + node legends (bottom-left, below right-side controls) */}
      <div style={{
        position: 'absolute', bottom: '16px', left: '16px', zIndex: 10,
        display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: 'min(420px, calc(100vw - 340px))'
      }}>
        <div style={{
          backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: '4px', padding: '6px 12px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center'
        }}>
          {[
            { label: 'Keyword match', stroke: EDGE_STROKE.keyword },
            { label: 'Semantic similarity', stroke: EDGE_STROKE.semantic },
            { label: 'AI inferred', stroke: EDGE_STROKE.llm },
            { label: 'Linked', stroke: EDGE_STROKE.default }
          ].map(({ label, stroke }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <svg width="22" height="8" style={{ display: 'block', flexShrink: 0 }}>
                <line x1="0" y1="4" x2="22" y2="4" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', letterSpacing: '0.04em', fontWeight: '500' }}>
                {label}
              </span>
            </div>
          ))}
        </div>
        <div style={{
          backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)',
          borderRadius: '4px', padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center'
        }}>
          {Object.entries({ document: '#E8000D', task: '#FF6B00', code: '#3B82F6', canvas: '#00BCD4', ai_chat: '#8B5CF6', voice: '#3D9970' }).map(([type, color]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color }} />
              <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.06em', fontWeight: '500' }}>
                {type.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {nodes.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            right: panelOffset,
            zIndex: 10,
            fontSize: '11px',
            color: 'var(--text-tertiary)',
            pointerEvents: 'none',
            lineHeight: 1.35,
            textAlign: 'right',
            maxWidth: '240px'
          }}
        >
          {nodes.length} nodes · {edges.length} edges ({semanticEdgeCount} semantic)
        </div>
      )}

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
