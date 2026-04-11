// KnowledgeGraph — D3.js force-directed graph visualization with semantic search
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as d3 from 'd3';
import { Search, X } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useGraph from '../../hooks/useGraph';
import useStore from '../../store/useStore';
import { GraphLoadingSkeleton } from '../shared/Skeleton';
import TypeBadge from '../shared/TypeBadge';
import { formatRelativeTime } from '../../utils/time';
import { formatPreviewText } from '../../utils/content';

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

// Formats snake_case metadata keys into readable labels.
function formatMetadataKey(key) {
  return String(key || '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

export default function KnowledgeGraph() {
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const zoomRef = useRef(null);
  const gRef = useRef(null);
  const [dims, setDims] = useState({ w: 900, h: 650 });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightedIds, setHighlightedIds] = useState(new Set());
  const [showAllNodes, setShowAllNodes] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
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
      console.log('[Graph] Container dims:', width, height);
      if (width > 0 && height > 0) {
        setDims({ w: width, h: height });
      }
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
      if (rect.width < 10 || rect.height < 10) {
        setDims({ w: 900, h: 650 });
      }
    }, 220);

    return () => {
      clearTimeout(fallbackTimer);
      ro.disconnect();
    };
  }, []);

  // Renders the D3 force-directed graph.
  useEffect(() => {
    if (loading) return;
    if (dims.w < 10 || dims.h < 10) return;
    console.log('[Graph] Render effect start:', {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      dims
    });
    if (!svgRef.current) return;
    try {
      const svg = d3.select(svgRef.current);
      svg.selectAll('*').remove();

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

      console.log('[Graph] SVG initialized:', { W, H, nodeCount: nodes.length, edgeCount: edges.length });

      if (!nodes.length) return;

      const graphNodes = nodes.map((n) => ({ ...n, type: normalizeType(n.type) }));
      const validEdges = edges
        .map((e) => ({ ...e, source: e.source_id, target: e.target_id }))
        .filter((e) => graphNodes.some((n) => n.id === e.source) && graphNodes.some((n) => n.id === e.target));

      const spread = Math.min(W, H) * 0.4;
      const positionedNodes = graphNodes.map((n) => ({
        ...n,
        x: n.x != null ? n.x : W / 2 + (Math.random() - 0.5) * spread * 2,
        y: n.y != null ? n.y : H / 2 + (Math.random() - 0.5) * spread * 2
      }));

      const g = svg.append('g');
      gRef.current = g.node();

      const zoomBehavior = d3.zoom().scaleExtent([0.2, 6]).on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
      zoomRef.current = zoomBehavior;
      svg.call(zoomBehavior);

      const simulation = d3.forceSimulation(positionedNodes)
        .force('link', d3.forceLink(validEdges)
          .id((d) => d.id)
          .distance(110)
          .strength(0.4))
        .force('charge', d3.forceManyBody()
          .strength(-380)
          .distanceMin(30)
          .distanceMax(500))
        .force('center', d3.forceCenter(W / 2, H / 2))
        .force('collide', d3.forceCollide(42).strength(0.85))
        .force('x', d3.forceX(W / 2).strength(0.03))
        .force('y', d3.forceY(H / 2).strength(0.03))
        .alphaDecay(0.02)
        .velocityDecay(0.4);

      simulation.tick(200);
      console.log('[Graph] Nodes after tick:', positionedNodes.map((n) => ({ id: n.id, x: n.x, y: n.y })));

      const links = g.append('g').selectAll('line').data(validEdges).enter().append('line')
        .attr('stroke', (d) => {
          if (!selectedNode) return linkColor;
          const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
          const targetId = typeof d.target === 'object' ? d.target.id : d.target;
          return sourceId === selectedNode.id || targetId === selectedNode.id ? accentColor : linkColor;
        })
        .attr('stroke-opacity', (d) => {
          if (!selectedNode) return 0.6;
          const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
          const targetId = typeof d.target === 'object' ? d.target.id : d.target;
          return sourceId === selectedNode.id || targetId === selectedNode.id ? 1.0 : 0.6;
        })
        .attr('stroke-width', (d) => {
          if (!selectedNode) return 1;
          const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
          const targetId = typeof d.target === 'object' ? d.target.id : d.target;
          return sourceId === selectedNode.id || targetId === selectedNode.id ? 1.5 : 1;
        });

      const nodeGroups = g.selectAll('.node').data(positionedNodes).enter().append('g')
        .attr('class', 'node')
        .style('cursor', 'pointer')
        .call(
          d3.drag()
            .on('start', (event, d) => {
              if (!event.active) simulation.alphaTarget(0.3).restart();
              d.fx = d.x;
              d.fy = d.y;
            })
            .on('drag', (event, d) => {
              d.fx = event.x;
              d.fy = event.y;
            })
            .on('end', (event, d) => {
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
        .attr('opacity', (d) => (highlightedIds.size === 0 || highlightedIds.has(d.id) ? 1 : 0.35));

      nodeGroups.append('text')
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px')
        .attr('font-family', 'Inter, sans-serif')
        .attr('fill', textSecondary)
        .attr('dy', -13)
        .text((d) => {
          const raw = d.title || 'Untitled';
          const label = raw.substring(0, 20);
          return label + (raw.length > 20 ? '…' : '');
      });

      nodeGroups.on('click', (event, d) => {
        setSelectedNode(d);
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
        const scale = Math.min(
          1.5,
          (svgW - pad * 2) / bbox.width,
          (svgH - pad * 2) / bbox.height
        );
        const tx = (svgW - scale * bbox.width) / 2 - scale * bbox.x;
        const ty = (svgH - scale * bbox.height) / 2 - scale * bbox.y;

        d3.select(svgRef.current)
          .transition().duration(500)
          .call(
            zoomRef.current.transform,
            d3.zoomIdentity.translate(tx, ty).scale(scale)
          );
      }, 0);

      return () => {
        simulation.stop();
        gRef.current = null;
      };
    } catch (err) {
      console.error('[Graph] Render effect failed:', err);
    }
  }, [loading, nodes, edges, selectedNode, highlightedIds, fetchNeighborhood, dims.w, dims.h, theme]);

  // Zooms and pans graph so currently loaded nodes fit into viewport.
  const handleFitToScreen = useCallback(() => {
    if (!svgRef.current || !gRef.current || !zoomRef.current) return;
    const bbox = gRef.current.getBBox();
    if (!bbox.width || !bbox.height) return;
    const svgW = svgRef.current.clientWidth || dims.w;
    const svgH = svgRef.current.clientHeight || dims.h;
    const pad = 64;
    const scale = Math.min(
      1.5,
      (svgW - pad * 2) / bbox.width,
      (svgH - pad * 2) / bbox.height
    );
    const tx = (svgW - scale * bbox.width) / 2 - scale * bbox.x;
    const ty = (svgH - scale * bbox.height) / 2 - scale * bbox.y;

    d3.select(svgRef.current)
      .transition().duration(500)
      .call(
        zoomRef.current.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale)
      );
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
    if (type === 'document') {
      navigate(node.source_id ? `/editor/${node.source_id}` : '/documents');
      return;
    }
    if (type === 'code') {
      navigate(node.source_id ? `/code/${node.source_id}` : '/code');
      return;
    }
    if (type === 'canvas') {
      navigate(node.source_id ? `/canvas/${node.source_id}` : '/canvas');
      return;
    }
    if (type === 'task') {
      navigate('/tasks');
      return;
    }
    navigate('/documents');
  }, [navigate]);

  const selectedType = normalizeType(selectedNode?.type);

  // Show skeleton while nodes are loading or before first measured layout.
  if (loading) {
    return <GraphLoadingSkeleton />;
  }

  return (
    <div
      ref={containerRef}
      data-testid="knowledge-graph-container"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 0,
        flex: 1,
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

      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          width: '400px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          gap: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
        }}
      >
        <Search size={14} color="var(--text-tertiary)" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search knowledge graph..."
          style={{
            flex: 1,
            height: '36px',
            backgroundColor: 'transparent',
            border: 'none',
            fontSize: '13px',
            color: 'var(--text-primary)'
          }}
        />
        <button
          onClick={handleSearch}
          style={{
            height: '28px',
            borderRadius: '4px',
            border: '1px solid var(--border-default)',
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-secondary)',
            fontSize: '11px',
            padding: '0 8px',
            cursor: 'pointer'
          }}
        >
          Search
        </button>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: '16px',
          left: '16px',
          zIndex: 10,
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '4px',
          padding: '8px 12px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center'
        }}
      >
        {Object.entries({
          document: '#E8000D',
          task: '#FF6B00',
          code: '#3B82F6',
          ai_chat: '#8B5CF6',
          voice: '#3D9970'
        }).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color }} />
            <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.06em', fontWeight: '500' }}>
              {type.replace('_', ' ')}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: selectedNode ? '316px' : '16px',
          zIndex: 10,
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: '4px',
          padding: '4px 10px',
          fontSize: '11px',
          color: 'var(--text-tertiary)'
        }}
      >
        {nodes.length} nodes
      </div>

      <button
        onClick={() => setShowAllNodes((prev) => !prev)}
        style={{
          position: 'absolute',
          top: '52px',
          right: selectedNode ? '316px' : '16px',
          zIndex: 10,
          height: '26px',
          borderRadius: '4px',
          border: showAllNodes ? '1px solid rgba(232,0,13,0.3)' : '1px solid var(--border-default)',
          backgroundColor: showAllNodes ? 'rgba(232,0,13,0.1)' : 'var(--bg-surface)',
          color: showAllNodes ? 'var(--accent)' : 'var(--text-tertiary)',
          fontSize: '11px',
          padding: '0 8px',
          cursor: 'pointer'
        }}
      >
        {showAllNodes ? 'All Nodes' : 'Fast Mode'}
      </button>

      <button
        onClick={handleFitToScreen}
        style={{
          position: 'absolute',
          top: '84px',
          right: selectedNode ? '316px' : '16px',
          zIndex: 10,
          height: '26px',
          borderRadius: '4px',
          border: '1px solid var(--border-default)',
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-secondary)',
          fontSize: '11px',
          padding: '0 8px',
          cursor: 'pointer'
        }}
      >
        Fit to Screen
      </button>

      <button
        onClick={handleBackfillKeywordEdges}
        disabled={backfilling}
        style={{
          position: 'absolute',
          top: '148px',
          right: selectedNode ? '316px' : '16px',
          zIndex: 10,
          height: '26px',
          borderRadius: '4px',
          border: '1px solid var(--border-default)',
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-secondary)',
          fontSize: '11px',
          padding: '0 8px',
          cursor: backfilling ? 'not-allowed' : 'pointer',
          opacity: backfilling ? 0.65 : 1
        }}
      >
        {backfilling ? 'Backfilling...' : 'Backfill Keyword Edges'}
      </button>

      {isNeighborhoodMode && centerNodeId && (
        <button
          onClick={() => fetchGraph({ all: showAllNodes, limit: 500 })}
          style={{
            position: 'absolute',
            top: '180px',
            right: selectedNode ? '316px' : '16px',
            zIndex: 10,
            height: '26px',
            borderRadius: '4px',
            border: '1px solid var(--border-default)',
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-secondary)',
            fontSize: '11px',
            padding: '0 8px',
            cursor: 'pointer'
          }}
        >
          Exit Neighborhood
        </button>
      )}

      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '300px',
          height: '100%',
          backgroundColor: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-default)',
          padding: '20px',
          overflowY: 'auto',
          zIndex: 20,
          display: selectedNode ? 'flex' : 'none',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        <button
          onClick={() => setSelectedNode(null)}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '26px',
            height: '26px',
            borderRadius: '4px',
            border: 'none',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <X size={14} color="var(--text-tertiary)" />
        </button>

        <TypeBadge type={selectedType} />

        <h3 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-primary)', lineHeight: '1.3', marginTop: '4px' }}>
          {selectedNode?.title || 'Untitled'}
        </h3>

        {selectedNode?.content_summary && (
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
            {formatPreviewText(selectedNode.content_summary, { maxLength: 280, fallback: 'No summary available' })}
          </p>
        )}

        {selectedNode?.metadata && Object.keys(selectedNode.metadata).length > 0 && (
          <div style={{ display: 'grid', gap: '6px' }}>
            {Object.entries(selectedNode.metadata).map(([key, value]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                <span>{formatMetadataKey(key)}:</span>
                <span style={{ color: 'var(--text-secondary)' }}>{String(value)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
          Created: {formatRelativeTime(selectedNode?.created_at)}
        </div>

        <button
          onClick={() => handleOpenNode(selectedNode)}
          style={{
            marginTop: 'auto',
            width: '100%',
            padding: '8px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: '6px',
            fontSize: '13px',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            textAlign: 'center'
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

