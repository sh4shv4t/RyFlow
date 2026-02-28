// KnowledgeGraph — D3.js force-directed graph visualization with semantic search
import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Zap, Loader2 } from 'lucide-react';
import useGraph from '../../hooks/useGraph';
import useStore from '../../store/useStore';

const NODE_COLORS = {
  doc: '#E8000D',
  task: '#FF6B00',
  ai_chat: '#9B59B6',
  voice: '#00C853',
  image: '#FFD700',
};

export default function KnowledgeGraph() {
  const svgRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState(null);
  const [highlightedIds, setHighlightedIds] = useState(new Set());
  const { nodes, edges, searchResults, loading, fetchGraph, search } = useGraph();
  const { setAiActive } = useStore();

  // Fetch graph data on mount
  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Renders the D3 force-directed graph
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = svgRef.current.clientWidth;
    const height = svgRef.current.clientHeight;

    const g = svg.append('g');

    // Zoom behavior
    svg.call(
      d3.zoom().scaleExtent([0.3, 4]).on('zoom', (event) => {
        g.attr('transform', event.transform);
      })
    );

    // Count connections for node sizing
    const connectionCount = {};
    edges.forEach(e => {
      connectionCount[e.source_id] = (connectionCount[e.source_id] || 0) + 1;
      connectionCount[e.target_id] = (connectionCount[e.target_id] || 0) + 1;
    });

    // Create simulation
    const simulation = d3.forceSimulation(nodes.map(n => ({ ...n })))
      .force('link', d3.forceLink(edges.map(e => ({
        source: e.source_id,
        target: e.target_id,
        weight: e.weight || 1
      }))).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Draw edges as curved lines
    const links = g.selectAll('.link')
      .data(edges)
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('fill', 'none')
      .attr('stroke', 'rgba(245, 245, 240, 0.1)')
      .attr('stroke-width', d => Math.max(1, (d.weight || 1) * 1.5))
      .attr('opacity', d => Math.min(1, (d.weight || 0.5) * 0.8));

    // Draw nodes
    const nodeGroups = g.selectAll('.node')
      .data(simulation.nodes())
      .enter()
      .append('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(d3.drag()
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

    // Node circles
    nodeGroups.append('circle')
      .attr('r', d => Math.max(8, Math.min(20, 8 + (connectionCount[d.id] || 0) * 3)))
      .attr('fill', d => NODE_COLORS[d.type] || '#E8000D')
      .attr('opacity', 0.8)
      .attr('stroke', d => highlightedIds.has(d.id) ? '#fff' : 'transparent')
      .attr('stroke-width', d => highlightedIds.has(d.id) ? 3 : 0);

    // Glow filter for highlighted nodes
    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'glow');
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Apply glow to highlighted nodes
    nodeGroups.selectAll('circle')
      .filter(d => highlightedIds.has(d.id))
      .attr('filter', 'url(#glow)')
      .attr('stroke', '#E8000D')
      .attr('stroke-width', 4);

    // Node labels
    nodeGroups.append('text')
      .attr('dy', d => Math.max(8, 8 + (connectionCount[d.id] || 0) * 3) + 14)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(245, 245, 240, 0.6)')
      .attr('font-size', '10px')
      .text(d => d.title?.length > 20 ? d.title.substring(0, 20) + '...' : d.title);

    // Hover tooltip
    nodeGroups
      .on('mouseenter', (event, d) => {
        d3.select(event.currentTarget).select('circle')
          .transition().duration(200)
          .attr('opacity', 1)
          .attr('r', d => Math.max(12, Math.min(24, 12 + (connectionCount[d.id] || 0) * 3)));
      })
      .on('mouseleave', (event, d) => {
        d3.select(event.currentTarget).select('circle')
          .transition().duration(200)
          .attr('opacity', 0.8)
          .attr('r', d => Math.max(8, Math.min(20, 8 + (connectionCount[d.id] || 0) * 3)));
      })
      .on('click', (event, d) => {
        setSelectedNode(d);
      });

    // Update positions on simulation tick
    simulation.on('tick', () => {
      links.attr('d', d => {
        const source = simulation.nodes().find(n => n.id === d.source_id) || d.source;
        const target = simulation.nodes().find(n => n.id === d.target_id) || d.target;
        if (!source || !target) return '';
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const dr = Math.sqrt(dx * dx + dy * dy) * 1.5;
        return `M${source.x},${source.y}A${dr},${dr} 0 0,1 ${target.x},${target.y}`;
      });

      nodeGroups.attr('transform', d => `translate(${d.x}, ${d.y})`);
    });

    return () => simulation.stop();
  }, [nodes, edges, highlightedIds]);

  // Handles semantic search
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setHighlightedIds(new Set());
      return;
    }
    const results = await search(searchQuery);
    if (results) {
      setHighlightedIds(new Set(results.map(r => r.id)));
      if (results.length > 0) {
        setSelectedNode(results[0]);
      }
    }
  }, [searchQuery, search]);

  return (
    <div className="flex h-full gap-4">
      {/* Graph area */}
      <div className="flex-1 flex flex-col">
        {/* Search bar */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-amd-white/30" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search knowledge graph semantically..."
              className="w-full bg-amd-gray/50 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-amd-white placeholder:text-amd-white/30 outline-none focus:border-amd-red/50"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl bg-amd-red text-white text-sm flex items-center gap-1 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </button>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mb-3">
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5 text-xs text-amd-white/50">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="capitalize">{type.replace('_', ' ')}</span>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-1 text-xs text-amd-red ml-auto">
              <Zap size={10} className="animate-pulse" /> AMD Inference
            </div>
          )}
        </div>

        {/* SVG graph */}
        <div className="flex-1 glass-card overflow-hidden relative">
          {nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-16 h-16 rounded-full bg-amd-red/10 flex items-center justify-center mb-4">
                <Search size={24} className="text-amd-red/40" />
              </div>
              <h3 className="font-heading font-semibold text-amd-white/60 mb-2">Empty Knowledge Graph</h3>
              <p className="text-sm text-amd-white/40 max-w-sm">
                Create your first document to start building your knowledge graph. Every doc, task, and voice note becomes a connected node.
              </p>
            </div>
          ) : (
            <svg ref={svgRef} className="w-full h-full" style={{ background: '#111' }} />
          )}
        </div>
      </div>

      {/* Right panel — selected node detail */}
      <AnimatePresence>
        {selectedNode && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="w-80 glass-card p-4 overflow-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: NODE_COLORS[selectedNode.type] || '#E8000D' }}
                />
                <span className="text-xs text-amd-white/50 capitalize">{selectedNode.type?.replace('_', ' ')}</span>
              </div>
              <button onClick={() => setSelectedNode(null)} className="text-amd-white/40 hover:text-amd-white">
                <X size={16} />
              </button>
            </div>

            <h3 className="font-heading font-semibold text-amd-white mb-3">{selectedNode.title}</h3>

            {selectedNode.content_summary && (
              <div className="text-sm text-amd-white/70 mb-4 leading-relaxed">
                {selectedNode.content_summary}
              </div>
            )}

            {selectedNode.score !== undefined && (
              <div className="glass-card p-2 text-xs text-amd-white/50">
                Relevance: <span className="text-amd-red font-medium">{(selectedNode.score * 100).toFixed(1)}%</span>
              </div>
            )}

            <div className="mt-4 text-xs text-amd-white/30">
              Created: {new Date(selectedNode.created_at).toLocaleDateString()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
