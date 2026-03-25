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
    <div className="rounded-xl bg-[#2C2C2C] p-4 border border-white/10">
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
  const { selectedModel, setSelectedModel, workspace, setAiActive } = useStore();
  const [status, setStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [stats, setStats] = useState(null);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetches backend status, models, and workspace stats.
  const fetchAll = useCallback(async () => {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      const [statusRes, modelsRes, statsRes] = await Promise.all([
        axios.get('/api/ai/system-status'),
        axios.get('/api/ai/models'),
        axios.get('/api/workspace/stats', { params: { workspace_id: workspace.id } }),
      ]);
      setStatus(statusRes.data);
      setModels(modelsRes.data.models || []);
      setStats(statsRes.data);

      setAiActive(true);
      const insightRes = await axios.post('/api/ai/chat', {
        messages: [{
          role: 'user',
          content: `Based on these workspace statistics: ${JSON.stringify(statsRes.data)}, give 3 short actionable insights about this team's productivity and collaboration patterns. Each insight max 20 words. Return as JSON array of strings.`
        }],
        model: selectedModel,
        workspace_id: null
      });

      try {
        const parsed = JSON.parse(String(insightRes.data.content || '[]').replace(/```json|```/gi, '').trim());
        setInsights(Array.isArray(parsed) ? parsed.slice(0, 3) : []);
      } catch {
        setInsights([]);
      }
    } catch {
      toast.error('Could not reach backend');
    } finally {
      setAiActive(false);
      setLoading(false);
    }
  }, [workspace?.id, selectedModel, setAiActive]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const StatusDot = ({ ok }) => (
    <span className={`w-2 h-2 rounded-full inline-block ${ok ? 'bg-amd-green' : 'bg-amd-orange'}`} />
  );

  const completionRate = stats?.tasks?.count
    ? Math.round((Number(stats.tasks.completed || 0) / Number(stats.tasks.count || 1)) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-6xl mx-auto space-y-6"
    >
      <h1 className="font-heading text-2xl font-bold text-amd-white">Settings</h1>

      <section className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-semibold text-amd-white flex items-center gap-2">
            <Cpu size={16} className="text-amd-red" /> System Status
          </h2>
          <button
            onClick={fetchAll}
            className="text-amd-white/40 hover:text-amd-white p-1.5 rounded-lg hover:bg-white/5"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton-loader h-10 rounded-lg" />)}
          </div>
        ) : status ? (
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Ollama" value={status.ollama_running ? 'Running' : 'Offline'}>
              <StatusDot ok={status.ollama_running} />
            </InfoRow>
            <InfoRow label="AMD GPU" value={status.amd_gpu ? 'Detected' : 'Not found'}>
              <StatusDot ok={status.amd_gpu} />
            </InfoRow>
            {status.gpu_name && <InfoRow label="GPU Name" value={status.gpu_name} />}
            {status.vram && <InfoRow label="VRAM" value={status.vram} />}
            <InfoRow label="Inference Mode" value={status.amd_gpu ? 'GPU (ROCm)' : 'CPU'}>
              <Zap size={12} className={status.amd_gpu ? 'text-amd-green' : 'text-amd-orange'} />
            </InfoRow>
          </div>
        ) : (
          <p className="text-sm text-amd-white/30">Unavailable</p>
        )}
      </section>

      <section className="glass-card p-5 space-y-4">
        <h2 className="font-heading font-semibold text-amd-white flex items-center gap-2">
          <Zap size={16} className="text-amd-orange" /> AI Model
        </h2>

        {models.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {models.map((m) => (
              <button
                key={m.name}
                onClick={() => { setSelectedModel(m.name); toast.success(`Model set to ${m.name}`); }}
                className={`flex items-center gap-2 p-3 rounded-lg text-sm transition-all ${
                  selectedModel === m.name
                    ? 'bg-amd-red/10 border border-amd-red/30 text-amd-white'
                    : 'bg-white/5 text-amd-white/60 hover:bg-white/10'
                }`}
              >
                {selectedModel === m.name && <Check size={14} className="text-amd-green flex-shrink-0" />}
                <span className="truncate">{m.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-amd-orange">
            <AlertTriangle size={14} />
            No models found. Install one with <code className="bg-white/5 px-1.5 rounded">ollama pull phi3:mini</code>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-semibold text-amd-white">Workspace Statistics</h2>
          <button
            onClick={fetchAll}
            className="text-amd-white/50 hover:text-amd-white text-xs flex items-center gap-1"
          >
            <RefreshCw size={12} /> Last updated: just now
          </button>
        </div>

        {loading || !stats ? (
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 rounded-xl bg-[#2C2C2C] animate-pulse" />)}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="Total Documents" value={<CountUp value={stats.documents.count} />} icon={FileText} />
              <StatCard label="Total Tasks" value={<CountUp value={stats.tasks.count} />} icon={CheckSquare} />
              <StatCard label="Completed Tasks" value={`${completionRate}%`} subValue={`${stats.tasks.completed}/${stats.tasks.count}`} icon={Check} />
              <StatCard label="AI Conversations" value={<CountUp value={stats.ai_chats.count} />} icon={MessageSquare} />
            </div>

            <div className="grid grid-cols-4 gap-3">
              <StatCard
                label="Code Files"
                value={<CountUp value={stats.code_files.count} />}
                icon={Code2}
                footer={topItems(stats.code_files.languages).map((lang) => (
                  <span key={lang} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-amd-white/60">{lang}</span>
                ))}
              />
              <StatCard label="Canvas Drawings" value={<CountUp value={stats.canvases.count} />} icon={PencilRuler} />
              <StatCard
                label="Knowledge Graph"
                value={<CountUp value={stats.knowledge_graph.total_nodes} />}
                subValue={`${stats.knowledge_graph.total_edges} edges`}
                icon={GitBranch}
              />
              <StatCard label="Voice Notes" value={<CountUp value={stats.voice_logs.count} />} icon={Mic} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              {insights.map((insight, i) => (
                <div key={i} className="rounded-xl bg-[#2C2C2C] p-4 border border-white/10">
                  <div className="flex items-center gap-2 text-amd-red mb-2">
                    <Lightbulb size={14} />
                    <span className="text-xs font-medium">Insight {i + 1}</span>
                  </div>
                  <p className="text-sm text-amd-white/80">{insight}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="glass-card p-5 space-y-3">
        <h2 className="font-heading font-semibold text-amd-white flex items-center gap-2">
          <Palette size={16} className="text-amd-red" /> About RyFlow
        </h2>
        <p className="text-sm text-amd-white/50 leading-relaxed">
          RyFlow is an offline-first, peer-to-peer AI collaboration workspace built for
          college students. Powered by AMD's open-source AI stack — Ollama, ROCm, Whisper.cpp
          — it runs entirely on your local machine with zero cloud dependency.
        </p>
        <div className="flex gap-4 text-xs text-amd-white/30">
          <span>RyFlow v{APP_VERSION}</span>
          <span>&middot;</span>
          <span>Desktop &middot; Electron</span>
          <span>&middot;</span>
          <span>MIT License</span>
        </div>
      </section>
    </motion.div>
  );
}

function InfoRow({ label, value, children }) {
  return (
    <div className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
      <span className="text-xs text-amd-white/50">{label}</span>
      <span className="text-xs text-amd-white flex items-center gap-1.5">
        {children}
        {value}
      </span>
    </div>
  );
}
