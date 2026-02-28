// Settings page — Ollama status, model management, preferences
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Cpu, Globe, Palette, RefreshCw, Check, AlertTriangle, Zap } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';

const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ja', label: 'Japanese' },
  { code: 'zh', label: 'Chinese' },
];

export default function Settings() {
  const { language, setLanguage, selectedModel, setSelectedModel, user, workspace } = useStore();
  const [status, setStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const [statusRes, modelsRes] = await Promise.all([
        axios.get('/api/ai/system-status'),
        axios.get('/api/ai/models'),
      ]);
      setStatus(statusRes.data);
      setModels(modelsRes.data.models || []);
    } catch {
      toast.error('Could not reach backend');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const StatusDot = ({ ok }) => (
    <span className={`w-2 h-2 rounded-full inline-block ${ok ? 'bg-amd-green' : 'bg-amd-orange'}`} />
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-3xl mx-auto space-y-6"
    >
      <h1 className="font-heading text-2xl font-bold text-amd-white">Settings</h1>

      {/* ---------- System Status ---------- */}
      <section className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-semibold text-amd-white flex items-center gap-2">
            <Cpu size={16} className="text-amd-red" /> System Status
          </h2>
          <button
            onClick={fetchStatus}
            className="text-amd-white/40 hover:text-amd-white p-1.5 rounded-lg hover:bg-white/5"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="skeleton-loader h-10 rounded-lg" />)}
          </div>
        ) : status ? (
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Ollama" value={status.ollama_running ? 'Running' : 'Offline'}>
              <StatusDot ok={status.ollama_running} />
            </InfoRow>
            <InfoRow label="AMD GPU" value={status.amd_gpu ? 'Detected' : 'Not found'}>
              <StatusDot ok={status.amd_gpu} />
            </InfoRow>
            {status.gpu_name && (
              <InfoRow label="GPU Name" value={status.gpu_name} />
            )}
            {status.vram && (
              <InfoRow label="VRAM" value={status.vram} />
            )}
            <InfoRow label="Inference Mode" value={status.amd_gpu ? 'GPU (ROCm)' : 'CPU'}>
              <Zap size={12} className={status.amd_gpu ? 'text-amd-green' : 'text-amd-orange'} />
            </InfoRow>
          </div>
        ) : (
          <p className="text-sm text-amd-white/30">Unavailable</p>
        )}
      </section>

      {/* ---------- Model Selection ---------- */}
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

      {/* ---------- Language ---------- */}
      <section className="glass-card p-5 space-y-4">
        <h2 className="font-heading font-semibold text-amd-white flex items-center gap-2">
          <Globe size={16} className="text-amd-red" /> Language
        </h2>
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map(({ code, label }) => (
            <button
              key={code}
              onClick={() => { setLanguage(code); toast.success(`Language set to ${label}`); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                language === code
                  ? 'bg-amd-red text-white'
                  : 'bg-white/5 text-amd-white/60 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* ---------- About ---------- */}
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
          <span>v1.0.0</span>
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
