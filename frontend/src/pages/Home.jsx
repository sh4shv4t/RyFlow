// Home page — unified workspace activity dashboard.
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as d3 from 'd3';
import {
  FileText, CheckSquare, Code2, PencilRuler, MessageSquare,
  GitBranch, ArrowRight, AlertCircle, Mic
} from 'lucide-react';
import axios from 'axios';
import { apiFetch } from '../utils/apiClient';
import useStore from '../store/useStore';
import PeerList from '../components/workspace/PeerList';
import AMDbadge from '../components/layout/AMDbadge';

// Formats ISO dates into compact relative labels.
function timeAgo(iso) {
  if (!iso) return 'just now';
  const delta = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(delta / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const TYPE_COLORS = {
  document: '#E8000D',
  task: '#FF6B00',
  code: '#64B5F6',
  canvas: '#00BCD4',
  ai_chat: '#9B59B6',
  voice: '#00C853'
};

export default function Home() {
  const navigate = useNavigate();
  const svgRef = useRef(null);
  const { user, workspace, aiStatus } = useStore();
  const [clock, setClock] = useState(new Date());
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [recentChats, setRecentChats] = useState([]);
  const [codeFiles, setCodeFiles] = useState([]);
  const [canvases, setCanvases] = useState([]);
  const [graphPreview, setGraphPreview] = useState({ nodes: [], edges: [] });
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingSpeaking, setBriefingSpeaking] = useState(false);
  const [briefingText, setBriefingText] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);

  // Updates the live clock every minute.
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Cancels active speech output when leaving page.
  useEffect(() => () => {
    window.speechSynthesis?.cancel();
  }, []);

  // Speaks the provided briefing text using the Web Speech API voice list.
  const speakBriefing = useCallback((text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => v.name.includes('Google') || v.name.includes('Natural') || v.lang === 'en-IN');
    if (preferred) utterance.voice = preferred;
    utterance.onend = () => setBriefingSpeaking(false);
    utterance.onerror = () => setBriefingSpeaking(false);
    setBriefingSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, []);

  // Requests and plays a generated workspace briefing transcript.
  const handlePlayBriefing = useCallback(async () => {
    if (!workspace?.id) return;
    if (briefingSpeaking) {
      window.speechSynthesis.cancel();
      setBriefingSpeaking(false);
      return;
    }

    setBriefingLoading(true);
    try {
      const res = await apiFetch('/api/workspace/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspace.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate briefing');
      setBriefingText(data.briefing_text || '');
      speakBriefing(data.briefing_text || '');
    } catch {
      // Keep UX non-blocking if speech generation fails.
    } finally {
      setBriefingLoading(false);
    }
  }, [briefingSpeaking, speakBriefing, workspace?.id]);

  // Loads all dashboard data in one batch.
  const fetchDashboard = useCallback(async () => {
    if (!workspace?.id) return;
    const [statsRes, activityRes, tasksRes, chatsRes, codeRes, canvasRes, graphRes] = await Promise.all([
      axios.get('/api/workspace/stats', { params: { workspace_id: workspace.id } }),
      axios.get('/api/workspace/activity', { params: { workspace_id: workspace.id } }),
      axios.get('/api/tasks', { params: { workspace_id: workspace.id } }),
      axios.get('/api/chats', { params: { workspace_id: workspace.id } }),
      axios.get('/api/code/list', { params: { workspace_id: workspace.id } }),
      axios.get('/api/canvas/list', { params: { workspace_id: workspace.id } }),
      axios.get('/api/graph', { params: { workspace_id: workspace.id } })
    ]);

    setStats(statsRes.data);
    setActivity(activityRes.data.activity || []);
    setTasks(tasksRes.data.tasks || []);
    setRecentChats((chatsRes.data.chats || []).slice(0, 2));
    setCodeFiles((codeRes.data.files || []).slice(0, 3));
    setCanvases((canvasRes.data.canvases || []).slice(0, 3));

    const nodes = (graphRes.data.nodes || []).slice(-10);
    const ids = new Set(nodes.map((n) => n.id));
    const edges = (graphRes.data.edges || []).filter((e) => ids.has(e.source_id) && ids.has(e.target_id));
    setGraphPreview({ nodes, edges });
  }, [workspace?.id]);

  useEffect(() => {
    fetchDashboard().catch(() => {});
  }, [fetchDashboard]);

  // Draws mini non-interactive force graph preview.
  useEffect(() => {
    if (!svgRef.current || graphPreview.nodes.length === 0) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const width = svgRef.current.clientWidth;
    const height = 300;

    const simulation = d3.forceSimulation(graphPreview.nodes.map((n) => ({ ...n })))
      .force('link', d3.forceLink(graphPreview.edges.map((e) => ({ source: e.source_id, target: e.target_id }))).id((d) => d.id).distance(70))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(width / 2, height / 2));

    const links = svg.append('g').selectAll('line').data(graphPreview.edges).enter().append('line')
      .attr('stroke', 'rgba(255,255,255,0.18)');

    const nodes = svg.append('g').selectAll('circle').data(simulation.nodes()).enter().append('circle')
      .attr('r', 6)
      .attr('fill', (d) => TYPE_COLORS[d.type] || '#E8000D');

    simulation.on('tick', () => {
      links
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);
      nodes
        .attr('cx', (d) => d.x)
        .attr('cy', (d) => d.y);
    });

    return () => simulation.stop();
  }, [graphPreview]);

  const inProgressTasks = useMemo(
    () => tasks.filter((t) => ['in_progress', 'in-progress'].includes(t.status)).slice(0, 3),
    [tasks]
  );

  const quickStats = [
    { label: 'Documents', value: stats?.documents?.count || 0, path: '/editor' },
    { label: 'Tasks Done/Total', value: `${stats?.tasks?.completed || 0}/${stats?.tasks?.count || 0}`, path: '/tasks' },
    { label: 'Code Files', value: stats?.code_files?.count || 0, path: '/code' },
    { label: 'Canvases', value: stats?.canvases?.count || 0, path: '/canvas' },
    { label: 'AI Chats', value: stats?.ai_chats?.count || 0, path: '/ai' },
    { label: 'Graph Nodes', value: stats?.knowledge_graph?.total_nodes || 0, path: '/graph' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <section className="glass-card p-5 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-amd-white">Welcome back, {user?.name || 'Teammate'}</h1>
          <p className="text-amd-white/60 mt-1">{workspace?.name || 'Workspace'} • {clock.toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-1">
            <button onClick={handlePlayBriefing} className="px-3 py-2 rounded bg-amd-red/20 text-amd-red text-sm">
              {briefingSpeaking ? '⏹ Stop Briefing' : (briefingLoading ? 'Generating...' : '🎙 Play Briefing')}
            </button>
            {briefingText ? (
              <button onClick={() => setShowTranscript((v) => !v)} className="text-xs text-amd-white/55 hover:text-amd-white/75">
                📄 {showTranscript ? 'Hide transcript' : 'Show transcript'}
              </button>
            ) : null}
          </div>
          <AMDbadge />
        </div>
      </section>

      {showTranscript && briefingText ? (
        <section className="glass-card p-4 text-sm text-amd-white/75">
          {briefingText}
        </section>
      ) : null}

      {!aiStatus.ollamaRunning && (
        <div className="glass-card p-3 border border-amd-orange/30 text-amd-orange text-sm flex items-center gap-2">
          <AlertCircle size={16} /> Ollama is offline. AI-only widgets may be limited.
        </div>
      )}

      <section className="grid grid-cols-6 gap-3">
        {quickStats.map((item) => (
          <button key={item.label} onClick={() => navigate(item.path)} className="rounded-xl bg-[#2C2C2C] p-3 text-left hover:bg-[#343434] transition-colors">
            <p className="text-[11px] text-amd-white/60">{item.label}</p>
            <p className="text-xl font-bold text-amd-red">{item.value}</p>
          </button>
        ))}
      </section>

      <section className="grid grid-cols-[1.5fr_1fr] gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading text-amd-white font-semibold">Active Tasks</h3>
            <button onClick={() => navigate('/tasks')} className="text-xs text-amd-red flex items-center gap-1">View All Tasks <ArrowRight size={12} /></button>
          </div>
          <div className="space-y-2">
            {inProgressTasks.map((task) => {
              const overdue = task.due_date && task.status !== 'done' && task.due_date < new Date().toISOString().slice(0, 10);
              return (
                <div key={task.id} className="rounded-lg bg-white/5 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-amd-white font-medium">{task.title}</p>
                    {overdue ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amd-red/20 text-amd-red">OVERDUE</span> : null}
                  </div>
                  <div className="mt-1 text-xs text-amd-white/50">{task.assignee || 'Unassigned'} • {task.priority || 'medium'} • {task.due_date || 'No due date'}</div>
                </div>
              );
            })}
            {inProgressTasks.length === 0 ? <p className="text-xs text-amd-white/40">No in-progress tasks</p> : null}
          </div>
        </div>

        <div className="glass-card p-4">
          <h3 className="font-heading text-amd-white font-semibold mb-3">AI Chat Snapshot</h3>
          <div className="space-y-2">
            {recentChats.map((chat) => (
              <div key={chat.id} className="rounded-lg bg-white/5 p-3">
                <p className="text-sm text-amd-white font-medium">{chat.title}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-amd-white/60">{chat.model}</span>
                  {chat.rag_used ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amd-orange/20 text-amd-orange">📚 RAG</span> : null}
                  <span className="text-[10px] text-amd-white/40">{chat.message_count} msgs</span>
                </div>
                <button onClick={() => navigate('/ai')} className="text-xs text-amd-red mt-2">Continue →</button>
              </div>
            ))}
            {recentChats.length === 0 ? <p className="text-xs text-amd-white/40">No recent chats</p> : null}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-[1.2fr_1fr] gap-4">
        <div className="glass-card p-4">
          <h3 className="font-heading text-amd-white font-semibold mb-3">Recent Activity</h3>
          <div className="max-h-72 overflow-auto space-y-2 pr-1">
            {activity.map((item) => (
              <button
                key={`${item.type}-${item.id}`}
                onClick={() => {
                  if (item.type === 'document') navigate('/editor');
                  if (item.type === 'task') navigate('/tasks');
                  if (item.type === 'code') navigate('/code');
                  if (item.type === 'canvas') navigate('/canvas');
                  if (item.type === 'ai_chat') navigate('/ai');
                  if (item.type === 'voice') navigate('/ai');
                }}
                className="w-full text-left rounded-lg bg-white/5 p-2.5 hover:bg-white/10"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_COLORS[item.type] || '#E8000D' }} />
                    <span className="text-sm text-amd-white">{item.title}</span>
                  </div>
                  <span className="text-[10px] text-amd-white/40">{timeAgo(item.updated_at)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-card p-4">
            <h3 className="font-heading text-amd-white font-semibold mb-3">Code & Canvas</h3>
            <div className="space-y-2">
              {codeFiles.map((file) => (
                <div key={file.id} className="rounded-lg bg-white/5 p-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-amd-white">{file.title}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-amd-white/60">{file.language}</span>
                  </div>
                  <p className="text-[10px] text-amd-white/40">{timeAgo(file.updated_at)}</p>
                </div>
              ))}
              {canvases.map((canvas) => (
                <div key={canvas.id} className="rounded-lg bg-white/5 p-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-amd-white">{canvas.title}</p>
                    <span className="text-[10px] text-amd-white/50">Canvas</span>
                  </div>
                  <p className="text-[10px] text-amd-white/40">{timeAgo(canvas.updated_at)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-4">
            <h3 className="font-heading text-amd-white font-semibold mb-2">Peers Online</h3>
            <PeerList />
          </div>
        </div>
      </section>

      <section className="glass-card p-4">
        <h3 className="font-heading text-amd-white font-semibold mb-3">Knowledge Graph Mini Preview</h3>
        <svg ref={svgRef} className="w-full h-[300px] rounded bg-black/20" />
        <button onClick={() => navigate('/graph')} className="mt-3 text-sm text-amd-red">Open Full Graph →</button>
      </section>
    </div>
  );
}
