// Settings page — system controls plus workspace statistics and AI insights.
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Cpu, Palette, RefreshCw, Check, AlertTriangle, Zap, FileText,
  CheckSquare, Code2, PencilRuler, GitBranch, Mic, MessageSquare, Lightbulb
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import { APP_VERSION } from '../constants/appVersion';

const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'es', label: 'Spanish' },
  { code: 'mr', label: 'Marathi' }
];

// Animates numeric values from 0 to target in one second.
function CountUp({ value = 0 }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const target = Number(value || 0);
    const start = Date.now();
    const duration = 1000;
    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - start) / duration);
      setDisplay(Math.round(target * progress));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [value]);
  return <span>{display}</span>;
}

// Formats metadata arrays to top n preview entries.
function topItems(items, n = 3) {
  return Array.isArray(items) ? items.slice(0, n) : [];
}

// Stats card component used throughout the workspace stats grid.
function StatCard({ label, value, subValue, icon: Icon, footer }) {
  return (
    <div className="rounded-xl bg-[#2C2C2C] p-4 border border-border-d">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-amd-white/60">{label}</span>
        <Icon size={14} className="text-amd-white/40" />
      </div>
      <div className="text-2xl font-bold text-amd-red">{value}</div>
      {subValue ? <div className="text-xs text-amd-white/50 mt-1">{subValue}</div> : null}
      {footer ? <div className="flex items-center gap-1 mt-2 flex-wrap">{footer}</div> : null}
    </div>
  );
}

export default function Settings() {
  const { selectedModel, setSelectedModel, workspace, setAiActive, language, setLanguage } = useStore();
  const safeSetAiActive = useCallback((active) => {
    if (typeof setAiActive === 'function') {
      setAiActive(active);
    }
  }, [setAiActive]);
  const [status, setStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [stats, setStats] = useState(null);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storage, setStorage] = useState(null);

  const handleSelectModel = useCallback((name) => {
    if (typeof setSelectedModel === 'function') {
      setSelectedModel(name);
      toast.success(`Model set to ${name}`);
    }
  }, [setSelectedModel]);

  // Fetches backend status, models, and workspace stats.
  const fetchAll = useCallback(async () => {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      const [statusRes, modelsRes] = await Promise.all([
        axios.get('/api/ai/system-status'),
        axios.get('/api/ai/models')
      ]);
      setStatus(statusRes.data);
      setModels(modelsRes.data.models || []);

      let statsData = null;
      try {
        const statsRes = await axios.get('/api/workspace/stats', { params: { workspace_id: workspace.id } });
        statsData = statsRes.data || null;
        setStats(statsData);
      } catch {
        setStats(null);
      }

      try {
        const storageRes = await axios.get('/api/workspace/storage', { params: { workspace_id: workspace.id } });
        setStorage(storageRes.data || null);
      } catch {
        setStorage(null);
      }

      if (statsData) {
        safeSetAiActive(true);
        const insightRes = await axios.post('/api/ai/chat', {
          messages: [{
            role: 'user',
            content: `Based on these workspace statistics: ${JSON.stringify(statsData)}, give 3 short actionable insights about this team's productivity and collaboration patterns. Each insight max 20 words. Return as JSON array of strings.`
          }],
          model: selectedModel,
          workspace_id: null
        });

        try {
          const parsed = JSON.parse(String(insightRes?.data?.content || '[]').replace(/```json|```/gi, '').trim());
          setInsights(Array.isArray(parsed) ? parsed.slice(0, 3) : []);
        } catch {
          setInsights([]);
        }
      } else {
        setInsights([]);
      }
    } catch {
      toast.error('Could not reach backend');
    } finally {
      safeSetAiActive(false);
      setLoading(false);
    }
  }, [workspace?.id, selectedModel, safeSetAiActive]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const StatusDot = ({ ok }) => (
    <span className={`w-2 h-2 rounded-full inline-block ${ok ? 'bg-amd-green' : 'bg-amd-orange'}`} />
  );

  const completionRate = stats?.tasks?.count
    ? Math.round((Number(stats.tasks.completed || 0) / Number(stats.tasks.count || 1)) * 100)
    : 0;

  // Converts bytes to compact human-readable units.
  const formatBytes = (bytes = 0) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  // Clears embeddings for current workspace after explicit confirmation.
  const clearEmbeddings = async () => {
    if (!workspace?.id || !storage?.breakdown?.embeddings?.bytes) return;
    const ok = window.confirm(`Clear embeddings and free ${formatBytes(storage.breakdown.embeddings.bytes)}? They will regenerate as content is reopened.`);
    if (!ok) return;
    try {
      await axios.post('/api/workspace/clear-embeddings', { workspace_id: workspace.id });
      toast.success('Embeddings cleared');
      fetchAll();
    } catch {
      toast.error('Failed to clear embeddings');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ height: '100%', overflowY: 'auto', padding: '40px', backgroundColor: '#111111' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#F0F0F0', marginBottom: '32px' }}>Settings</h1>

        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', paddingBottom: '12px', borderBottom: '1px solid #242424', marginBottom: '4px' }}>
            System Status
          </h2>
          {loading ? (
            <div style={{ fontSize: '13px', color: '#666666', padding: '14px 0' }}>Loading status...</div>
          ) : status ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #242424' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: '#F0F0F0', marginBottom: '2px' }}>Ollama</p>
                  <p style={{ fontSize: '12px', color: '#999999' }}>Model service availability</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#999999' }}>
                  <StatusDot ok={Boolean(status.ollamaRunning ?? status.ollama_running)} /> {Boolean(status.ollamaRunning ?? status.ollama_running) ? 'Running' : 'Offline'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #242424' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: '#F0F0F0', marginBottom: '2px' }}>AMD GPU</p>
                  <p style={{ fontSize: '12px', color: '#999999' }}>{status.gpuName || status.gpu_name || 'Hardware acceleration status'}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#999999' }}>
                  <StatusDot ok={Boolean(status.gpuDetected ?? status.amd_gpu)} /> {Boolean(status.gpuDetected ?? status.amd_gpu) ? 'Detected' : 'Not found'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #242424' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: '#F0F0F0', marginBottom: '2px' }}>Inference Mode</p>
                  <p style={{ fontSize: '12px', color: '#999999' }}>Current processing runtime</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#999999' }}>
                  <Zap size={12} color={Boolean(status.gpuDetected ?? status.amd_gpu) ? '#3D9970' : '#B85C00'} /> {Boolean(status.gpuDetected ?? status.amd_gpu) ? 'GPU (ROCm)' : 'CPU'}
                </div>
              </div>
              {(status.vram || status.gpuVram) ? (
                <div style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #242424' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '14px', fontWeight: '500', color: '#F0F0F0', marginBottom: '2px' }}>VRAM</p>
                    <p style={{ fontSize: '12px', color: '#999999' }}>{status.vram || status.gpuVram}</p>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div style={{ fontSize: '13px', color: '#666666', padding: '14px 0' }}>Unavailable</div>
          )}
        </section>

        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', paddingBottom: '12px', borderBottom: '1px solid #242424', marginBottom: '4px' }}>
            AI Model
          </h2>
          {models.length > 0 ? (
            models.map((m) => (
              <div
                key={m.name}
                onClick={() => handleSelectModel(m.name)}
                style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #242424', cursor: 'pointer' }}
              >
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: '#F0F0F0', marginBottom: '2px' }}>{m.name}</p>
                  <p style={{ fontSize: '12px', color: '#999999' }}>Click to activate this model</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectModel(m.name);
                  }}
                  style={{
                    height: '30px',
                    borderRadius: '6px',
                    border: selectedModel === m.name ? '1px solid rgba(232,0,13,0.3)' : '1px solid #333333',
                    backgroundColor: selectedModel === m.name ? 'rgba(232,0,13,0.1)' : '#1A1A1A',
                    color: selectedModel === m.name ? '#E8000D' : '#999999',
                    fontSize: '12px',
                    padding: '0 10px',
                    cursor: 'pointer'
                  }}
                >
                  {selectedModel === m.name ? 'Selected' : 'Use'}
                </button>
              </div>
            ))
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#B85C00', padding: '14px 0' }}>
              <AlertTriangle size={14} /> No models found. Install with ollama pull phi3:mini
            </div>
          )}
        </section>

        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', paddingBottom: '12px', borderBottom: '1px solid #242424', marginBottom: '4px' }}>
            Language
          </h2>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '8px' }}>
            {LANGUAGE_OPTIONS.map((item) => (
              <button
                key={item.code}
                onClick={() => typeof setLanguage === 'function' && setLanguage(item.code)}
                style={{
                  height: '30px',
                  borderRadius: '6px',
                  border: language === item.code ? '1px solid rgba(232,0,13,0.3)' : '1px solid #333333',
                  backgroundColor: language === item.code ? 'rgba(232,0,13,0.1)' : '#1A1A1A',
                  color: language === item.code ? '#E8000D' : '#999999',
                  fontSize: '12px',
                  padding: '0 10px',
                  cursor: 'pointer'
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', paddingBottom: '12px', borderBottom: '1px solid #242424', marginBottom: '4px' }}>
            Workspace Stats
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px', marginTop: '8px' }}>
            {[ 
              { label: 'Documents', value: stats?.documents?.count || 0 },
              { label: 'Tasks', value: stats?.tasks?.count || 0 },
              { label: 'Completion', value: `${completionRate}%` },
              { label: 'AI Chats', value: stats?.ai_chats?.count || 0 },
              { label: 'Graph Nodes', value: stats?.knowledge_graph?.total_nodes || 0 },
              { label: 'Voice Notes', value: stats?.voice_logs?.count || 0 }
            ].map((stat) => (
              <div key={stat.label} style={{ backgroundColor: '#1A1A1A', border: '1px solid #333333', borderRadius: '6px', padding: '16px' }}>
                <div style={{ fontSize: '24px', fontWeight: '600', color: '#E8000D', marginBottom: '4px' }}>{stat.value}</div>
                <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#666666' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', paddingBottom: '12px', borderBottom: '1px solid #242424', marginBottom: '4px' }}>
            Storage
          </h2>
          {storage ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #242424' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: '#F0F0F0', marginBottom: '2px' }}>Total Usage</p>
                  <p style={{ fontSize: '12px', color: '#999999' }}>{formatBytes(storage.total_bytes || 0)}</p>
                </div>
                <button onClick={clearEmbeddings} style={{ height: '30px', borderRadius: '6px', border: '1px solid #333333', backgroundColor: '#1A1A1A', color: '#999999', fontSize: '12px', padding: '0 10px', cursor: 'pointer' }}>
                  Clear Embeddings
                </button>
              </div>
              <div style={{ padding: '10px 0 0' }}>
                <p style={{ fontSize: '11px', color: '#999999', marginBottom: '6px' }}>Estimated .ryflow size: {formatBytes(Math.round(Number(storage.total_bytes || 0) * 0.7))}</p>
                <div style={{ height: '3px', backgroundColor: '#222222', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', backgroundColor: '#E8000D', borderRadius: '2px', width: '45%' }} />
                </div>
              </div>
            </>
          ) : (
            <div style={{ fontSize: '13px', color: '#666666', padding: '14px 0' }}>Storage data unavailable.</div>
          )}
        </section>

        <section style={{ marginBottom: '20px' }}>
          <h2 style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', paddingBottom: '12px', borderBottom: '1px solid #242424', marginBottom: '4px' }}>
            About RyFlow
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #242424' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '14px', fontWeight: '500', color: '#F0F0F0', marginBottom: '2px' }}>RyFlow</p>
              <p style={{ fontSize: '12px', color: '#999999' }}>Offline-first collaborative workspace</p>
            </div>
            <span style={{ fontSize: '12px', color: '#666666' }}>v{APP_VERSION}</span>
          </div>
          {insights.length > 0 && (
            <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
              {insights.map((insight, i) => (
                <div key={i} style={{ backgroundColor: '#1A1A1A', border: '1px solid #333333', borderRadius: '6px', padding: '10px 12px' }}>
                  <p style={{ fontSize: '12px', color: '#999999' }}><Lightbulb size={12} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} />{insight}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </motion.div>
  );
}

function InfoRow({ label, value, children }) {
  return (
    <div className="flex items-center justify-between bg-surface border border-border-d rounded-lg px-3 py-2">
      <span className="text-xs text-amd-white/50">{label}</span>
      <span className="text-xs text-amd-white flex items-center gap-1.5">
        {children}
        {value}
      </span>
    </div>
  );
}
