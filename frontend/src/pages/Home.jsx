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
  const { user, workspace, aiStatus, peers } = useStore();
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

  const TYPE_BADGE_COLORS = {
    document: { bg: 'rgba(232,0,13,0.1)', text: '#E8000D' },
    task: { bg: 'rgba(255,107,0,0.1)', text: '#FF6B00' },
    code: { bg: 'rgba(59,130,246,0.1)', text: '#3B82F6' },
    canvas: { bg: 'rgba(0,188,212,0.1)', text: '#00BCD4' },
    ai_chat: { bg: 'rgba(139,92,246,0.1)', text: '#8B5CF6' },
    voice: { bg: 'rgba(61,153,112,0.1)', text: '#3D9970' }
  };

  const iconForType = (type) => {
    if (type === 'task') return CheckSquare;
    if (type === 'code') return Code2;
    if (type === 'canvas') return PencilRuler;
    if (type === 'ai_chat') return MessageSquare;
    if (type === 'voice') return Mic;
    return FileText;
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '40px' }}>
        <div style={{ marginBottom: '32px' }}>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: '600',
              color: '#F0F0F0',
              lineHeight: '1.2',
              marginBottom: '4px'
            }}
          >
            Welcome back, {user?.name || 'Teammate'}
          </h1>
          <p style={{ fontSize: '13px', color: '#999999' }}>
            {workspace?.name || 'Workspace'} • {clock.toLocaleString()}
          </p>
        </div>

        <div style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { label: 'New Doc', icon: FileText, onClick: () => navigate('/editor') },
              { label: 'New Task', icon: CheckSquare, onClick: () => navigate('/tasks') },
              { label: 'Ask AI', icon: MessageSquare, onClick: () => navigate('/ai') },
              { label: 'Voice Note', icon: Mic, onClick: () => navigate('/ai') }
            ].map((action) => {
              const ActionIcon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#222222';
                    e.currentTarget.style.borderColor = '#444444';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#1A1A1A';
                    e.currentTarget.style.borderColor = '#333333';
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    backgroundColor: '#1A1A1A',
                    border: '1px solid #333333',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 150ms ease'
                  }}
                >
                  <ActionIcon size={14} color="#666666" />
                  <span style={{ fontSize: '13px', color: '#999999' }}>{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {!aiStatus.ollamaRunning && (
          <div
            style={{
              marginBottom: '20px',
              border: '1px solid #333333',
              backgroundColor: '#1A1A1A',
              borderRadius: '6px',
              padding: '10px 12px',
              color: '#999999',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <AlertCircle size={14} color="#B85C00" /> Ollama is offline. AI features may be limited.
          </div>
        )}

        {showTranscript && briefingText ? (
          <div
            style={{
              backgroundColor: '#1A1A1A',
              border: '1px solid #333333',
              borderRadius: '6px',
              padding: '16px 20px',
              marginBottom: '24px',
              fontSize: '13px',
              color: '#999999',
              lineHeight: '1.7'
            }}
          >
            {briefingText}
          </div>
        ) : null}

        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', flex: 1 }}>
              ACTIVE TASKS
            </p>
          </div>

          <div>
            {inProgressTasks.length === 0 ? (
              <div style={{ fontSize: '13px', color: '#666666', padding: '8px 8px' }}>No active tasks</div>
            ) : inProgressTasks.map((task) => (
              <button
                key={task.id}
                onClick={() => navigate('/tasks')}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1A1A1A'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  height: '36px',
                  padding: '0 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'background 150ms ease',
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  textAlign: 'left'
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    backgroundColor: task.priority === 'high' ? '#C0392B' : task.priority === 'medium' ? '#B85C00' : '#666666'
                  }}
                />
                <span
                  style={{
                    fontSize: '13px',
                    color: '#F0F0F0',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {task.title}
                </span>
                <span style={{ fontSize: '11px', color: '#666666', flexShrink: 0 }}>
                  {task.due_date || 'No due'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', flex: 1 }}>
              RECENT ACTIVITY
            </p>
          </div>

          <div>
            {activity.slice(0, 7).map((item) => {
              const ItemIcon = iconForType(item.type);
              const badge = TYPE_BADGE_COLORS[item.type] || TYPE_BADGE_COLORS.document;
              return (
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
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1A1A1A'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    height: '36px',
                    padding: '0 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'background 150ms ease',
                    width: '100%',
                    border: 'none',
                    background: 'transparent',
                    textAlign: 'left'
                  }}
                >
                  <ItemIcon size={14} color="#666666" />
                  <span
                    style={{
                      fontSize: '13px',
                      color: '#F0F0F0',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {item.title}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: '500',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      flexShrink: 0,
                      backgroundColor: badge.bg,
                      color: badge.text
                    }}
                  >
                    {String(item.type || 'item').replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: '11px', color: '#666666', flexShrink: 0 }}>{timeAgo(item.updated_at)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', flex: 1 }}>
              KNOWLEDGE GRAPH
            </p>
          </div>
          <div
            style={{
              backgroundColor: '#111111',
              border: '1px solid #242424',
              borderRadius: '6px',
              height: '220px',
              overflow: 'hidden',
              marginBottom: '8px'
            }}
          >
            <svg ref={svgRef} style={{ width: '100%', height: '100%' }} />
          </div>
          <button
            onClick={() => navigate('/graph')}
            style={{
              display: 'block',
              textAlign: 'right',
              fontSize: '12px',
              color: '#E8000D',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              width: '100%'
            }}
          >
            Open Graph →
          </button>
        </div>
      </div>

      <div
        style={{
          width: '260px',
          flexShrink: 0,
          backgroundColor: '#1A1A1A',
          borderLeft: '1px solid #242424',
          padding: '20px 16px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0'
        }}
      >
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', marginBottom: '10px' }}>
            AMD STATUS
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '32px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: aiStatus?.rocmAvailable || aiStatus?.gpuDetected ? '#3D9970' : '#666666' }} />
            <span style={{ fontSize: '13px', color: '#999999' }}>{aiStatus?.rocmAvailable || aiStatus?.gpuDetected ? 'ROCm Active' : 'CPU Mode'}</span>
          </div>
          <div style={{ marginTop: '8px' }}><AMDbadge /></div>
        </div>

        <div style={{ height: '1px', backgroundColor: '#242424', margin: '0 0 20px' }} />

        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', marginBottom: '10px' }}>
            PEERS ONLINE
          </p>
          {peers.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#666666' }}>No peers online</p>
          ) : peers.map((peer) => {
            const name = peer.name || 'Peer';
            const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
            return (
              <div key={`${peer.host || 'peer'}-${peer.port || name}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '34px' }}>
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#2A3A5A',
                    fontSize: '11px',
                    color: '#FFFFFF',
                    fontWeight: '600'
                  }}
                >
                  {initials || 'P'}
                </div>
                <span style={{ fontSize: '13px', color: '#F0F0F0', fontWeight: '500', flex: 1 }}>{name}</span>
                <span style={{ fontSize: '11px', color: '#666666' }}>online</span>
              </div>
            );
          })}
        </div>

        <div style={{ height: '1px', backgroundColor: '#242424', margin: '0 0 20px' }} />

        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', marginBottom: '10px' }}>
            RECENT CHATS
          </p>
          {recentChats.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#666666' }}>No recent chats</p>
          ) : recentChats.slice(0, 2).map((chat) => (
            <button
              key={chat.id}
              onClick={() => navigate('/ai')}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#222222'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                height: '32px',
                borderRadius: '4px',
                padding: '0 4px',
                cursor: 'pointer',
                transition: 'background 150ms',
                width: '100%',
                background: 'transparent',
                border: 'none',
                textAlign: 'left'
              }}
            >
              <MessageSquare size={13} color="#666666" />
              <span style={{ fontSize: '12px', color: '#F0F0F0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {chat.title}
              </span>
              <span style={{ fontSize: '10px', color: '#666666' }}>{timeAgo(chat.updated_at)}</span>
            </button>
          ))}
        </div>

        <div style={{ height: '1px', backgroundColor: '#242424', margin: '0 0 20px' }} />

        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', marginBottom: '10px' }}>
            STORAGE
          </p>
          <p style={{ fontSize: '11px', color: '#999999', marginBottom: '6px' }}>Workspace usage unavailable</p>
          <div style={{ height: '3px', backgroundColor: '#222222', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ height: '100%', backgroundColor: '#E8000D', borderRadius: '2px', width: '18%' }} />
          </div>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={handlePlayBriefing}
            style={{
              height: '34px',
              borderRadius: '6px',
              border: '1px solid #333333',
              backgroundColor: briefingSpeaking ? 'rgba(232,0,13,0.1)' : '#1A1A1A',
              color: briefingSpeaking ? '#E8000D' : '#999999',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            {briefingSpeaking ? 'Stop Briefing' : (briefingLoading ? 'Generating...' : 'Play Briefing')}
          </button>
          {briefingText ? (
            <button
              onClick={() => setShowTranscript((v) => !v)}
              style={{
                fontSize: '11px',
                color: '#666666',
                background: 'none',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              {showTranscript ? 'Hide transcript' : 'Show transcript'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
