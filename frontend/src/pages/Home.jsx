// Home page — unified workspace activity dashboard.
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  FileText, CheckSquare, Code2, PencilRuler, MessageSquare,
  AlertCircle, Mic
} from 'lucide-react';
import axios from 'axios';
import { apiFetch } from '../utils/apiClient';
import useStore from '../store/useStore';
import PeerList from '../components/workspace/PeerList';
import AMDbadge from '../components/layout/AMDbadge';
import TypeBadge from '../components/shared/TypeBadge';
import {
  ActivityRowSkeleton,
  ListSkeleton,
  TaskCardSkeleton
} from '../components/shared/Skeleton';
import { formatRelativeTime } from '../utils/time';

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
  const { user, workspace, aiStatus, peers } = useStore();
  const [clock, setClock] = useState(new Date());
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [recentChats, setRecentChats] = useState([]);
  const [codeFiles, setCodeFiles] = useState([]);
  const [canvases, setCanvases] = useState([]);
  const [isLoadingActivity, setIsLoadingActivity] =
    useState(true);
  const [isLoadingTasks, setIsLoadingTasks] =
    useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(true);
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
    if (!workspace?.id) {
      setDashboardLoading(false);
      return;
    }

    setDashboardLoading(true);
    try {
      const [statsRes, chatsRes, codeRes, canvasRes] = await Promise.all([
        axios.get('/api/workspace/stats', { params: { workspace_id: workspace.id } }),
        axios.get('/api/chats', { params: { workspace_id: workspace.id } }),
        axios.get('/api/code/list', { params: { workspace_id: workspace.id } }),
        axios.get('/api/canvas/list', { params: { workspace_id: workspace.id } })
      ]);

      setStats(statsRes.data);
      setRecentChats((chatsRes.data.chats || []).slice(0, 2));
      setCodeFiles((codeRes.data.files || []).slice(0, 3));
      const canvasList = Array.isArray(canvasRes.data) ? canvasRes.data : (canvasRes.data?.canvases || []);
      setCanvases(canvasList.slice(0, 3));
    } finally {
      setDashboardLoading(false);
    }
  }, [workspace?.id]);

  useEffect(() => {
    fetchDashboard().catch(() => {});
  }, [fetchDashboard]);

  useEffect(() => {
    if (!workspace?.id) {
      setActivity([]);
      setIsLoadingActivity(false);
      return;
    }

    setIsLoadingActivity(true);
    axios.get('/api/workspace/activity', {
      params: { workspace_id: workspace.id }
    })
      .then((res) => {
        setActivity(res.data?.activity || []);
      })
      .catch(() => {
        setActivity([]);
      })
      .finally(() => {
        setIsLoadingActivity(false);
      });
  }, [workspace?.id]);

  useEffect(() => {
    if (!workspace?.id) {
      setTasks([]);
      setIsLoadingTasks(false);
      return;
    }

    setIsLoadingTasks(true);
    axios.get('/api/tasks', {
      params: { workspace_id: workspace.id }
    })
      .then((res) => {
        setTasks(res.data?.tasks || []);
      })
      .catch(() => {
        setTasks([]);
      })
      .finally(() => {
        setIsLoadingTasks(false);
      });
  }, [workspace?.id]);

  const inProgressTasks = useMemo(
    () => tasks.filter((t) => ['in_progress', 'in-progress'].includes(t.status)).slice(0, 3),
    [tasks]
  );

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
              color: 'var(--text-primary)',
              lineHeight: '1.2',
              marginBottom: '4px'
            }}
          >
            Welcome back, {user?.name || 'Teammate'}
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            {workspace?.name || 'Workspace'} • {clock.toLocaleString()}
          </p>
        </div>

        <div style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { label: 'New Doc', icon: FileText, onClick: () => navigate('/documents'), accent: '#E8000D' },
              { label: 'New Task', icon: CheckSquare, onClick: () => navigate('/tasks'), accent: '#FF6B00' },
              { label: 'Ask AI', icon: MessageSquare, onClick: () => navigate('/ai'), accent: '#8B5CF6' },
              { label: 'Voice Note', icon: Mic, onClick: () => navigate('/ai'), accent: '#3D9970' }
            ].map((action) => {
              const ActionIcon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
                    e.currentTarget.style.borderColor = 'var(--border-strong)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    borderLeft: `3px solid ${action.accent}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 150ms ease'
                  }}
                >
                  <ActionIcon size={14} color={action.accent} />
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {!aiStatus.ollamaRunning && (
          <div
            style={{
              marginBottom: '20px',
              border: '1px solid var(--border-default)',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: '6px',
              padding: '10px 12px',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <AlertCircle size={14} color="var(--status-warning)" /> Ollama is offline. AI features may be limited.
          </div>
        )}

        {showTranscript && briefingText ? (
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: '6px',
              padding: '16px 20px',
              marginBottom: '24px',
              fontSize: '13px',
              color: 'var(--text-secondary)',
              lineHeight: '1.7'
            }}
          >
            {briefingText}
          </div>
        ) : null}

        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', flex: 1 }}>
              ACTIVE TASKS
            </p>
          </div>

          <div>
            {isLoadingTasks ? (
              <>
                <TaskCardSkeleton />
                <TaskCardSkeleton />
                <TaskCardSkeleton />
              </>
            ) : inProgressTasks.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', padding: '8px 8px' }}>No active tasks</div>
            ) : inProgressTasks.map((task) => (
              <button
                key={task.id}
                onClick={() => navigate('/tasks')}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface)'; }}
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
                    backgroundColor: task.priority === 'high' ? 'var(--status-error)' : task.priority === 'medium' ? 'var(--status-warning)' : 'var(--text-tertiary)'
                  }}
                />
                <span
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {task.title}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                  {task.due_date || 'No due'}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', flex: 1 }}>
              RECENT ACTIVITY
            </p>
          </div>

          <div>
            {isLoadingActivity ? (
              <ListSkeleton
                rows={4}
                RowComponent={ActivityRowSkeleton}
              />
            ) : activity.slice(0, 7).map((item) => {
              const ItemIcon = iconForType(item.type);
              return (
                <button
                  key={`${item.type}-${item.id}`}
                  onClick={() => {
                    if (item.type === 'document') navigate('/documents');
                    if (item.type === 'task') navigate('/tasks');
                    if (item.type === 'code') navigate('/code');
                    if (item.type === 'canvas') navigate('/canvas');
                    if (item.type === 'ai_chat') navigate('/ai');
                    if (item.type === 'voice') navigate('/ai');
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface)'; }}
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
                  <ItemIcon size={14} color={TYPE_COLORS[item.type] || 'var(--text-tertiary)'} />
                  <span
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {item.title}
                  </span>
                  <TypeBadge type={item.type} />
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0 }}>{formatRelativeTime(item.updated_at)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div />
      </div>

      <div
        style={{
          width: '260px',
          flexShrink: 0,
          backgroundColor: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-subtle)',
          padding: '20px 16px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0'
        }}
      >
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: '10px' }}>
            AMD STATUS
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '32px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: aiStatus?.rocmAvailable || aiStatus?.gpuDetected ? '#3D9970' : 'var(--text-tertiary)' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{aiStatus?.rocmAvailable || aiStatus?.gpuDetected ? 'ROCm Active' : 'CPU Mode'}</span>
          </div>
          <div style={{ marginTop: '8px' }}><AMDbadge /></div>
        </div>

        <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)', margin: '0 0 20px' }} />

        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: '10px' }}>
            PEERS ONLINE
          </p>
          {peers.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No peers online</p>
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
                    backgroundColor: 'var(--bg-overlay)',
                    fontSize: '11px',
                    color: 'var(--text-inverse)',
                    fontWeight: '600'
                  }}
                >
                  {initials || 'P'}
                </div>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500', flex: 1 }}>{name}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>online</span>
              </div>
            );
          })}
        </div>

        <div style={{ height: '1px', backgroundColor: 'var(--border-subtle)', margin: '0 0 20px' }} />

        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: '10px' }}>
            RECENT CHATS
          </p>
          {dashboardLoading ? (
            <ListSkeleton rows={2} RowComponent={ActivityRowSkeleton} />
          ) : recentChats.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No recent chats</p>
          ) : recentChats.slice(0, 2).map((chat) => (
            <button
              key={chat.id}
              onClick={() => navigate('/ai')}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'; }}
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
              <MessageSquare size={13} color="var(--text-tertiary)" />
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {chat.title}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{formatRelativeTime(chat.updated_at)}</span>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={handlePlayBriefing}
            style={{
              height: '34px',
              borderRadius: '6px',
              border: '1px solid var(--border-default)',
              backgroundColor: briefingSpeaking ? 'rgba(232,0,13,0.1)' : 'var(--bg-surface)',
              color: briefingSpeaking ? 'var(--accent)' : 'var(--text-secondary)',
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
                color: 'var(--text-tertiary)',
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

