// First-launch setup wizard that verifies dependencies and creates first workspace.
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';

const API_BASE = (window.location.protocol === 'file:' || window.electronAPI?.isElectron)
  ? 'http://localhost:3001'
  : '';

// Renders one dependency check row with status icon and text.
function CheckRow({ label, status, detail }) {
  const icon = status === 'ok' ? '✅' : status === 'warn' ? '⚠️' : status === 'fail' ? '❌' : '⏳';
  return (
    <div className="rounded bg-white/5 border border-white/10 p-2">
      <div className="text-sm text-amd-white">{icon} {label}</div>
      {detail ? <div className="text-xs text-amd-white/55 mt-1 whitespace-pre-wrap">{detail}</div> : null}
    </div>
  );
}

export default function SetupWizard() {
  const { setUser, setWorkspace } = useStore();
  const [step, setStep] = useState(1);
  const [checks, setChecks] = useState({});
  const [checking, setChecking] = useState(false);
  const [models, setModels] = useState([]);
  const [form, setForm] = useState({ owner: '', name: '', description: '' });
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);

  // Runs all dependency checks sequentially and updates statuses.
  const runChecks = async () => {
    setChecking(true);
    const next = {};
    try {
      next.ollama = { status: 'pending' };
      setChecks({ ...next });
      const tagsRes = await fetch('http://localhost:11434/api/tags');
      if (!tagsRes.ok) throw new Error('Ollama not running');
      const tags = await tagsRes.json();
      const names = (tags?.models || []).map((m) => m.name);
      setModels(names);
      next.ollama = { status: 'ok', detail: 'Ollama is running' };
      setChecks({ ...next });

      next.model = { status: names.some((n) => n.includes('phi3:mini')) && names.some((n) => n.includes('nomic-embed-text')) ? 'ok' : 'warn', detail: names.some((n) => n.includes('phi3:mini')) && names.some((n) => n.includes('nomic-embed-text')) ? 'AI model ready (phi3:mini + nomic-embed-text)' : 'Model not downloaded yet.\nRun:\nollama pull phi3:mini\nollama pull nomic-embed-text' };
      setChecks({ ...next });

      const sysRes = await axios.get('/api/ai/system-status');
      next.gpu = {
        status: sysRes.data?.gpuDetected ? 'ok' : 'warn',
        detail: sysRes.data?.gpuDetected
          ? `AMD GPU detected — ${sysRes.data?.gpuName || 'AMD GPU'}`
          : 'Running in CPU mode. AI still works normally.'
      };
      setChecks({ ...next });

      const voiceRes = await axios.get('/api/voice/status');
      next.voice = {
        status: voiceRes.data?.available ? 'ok' : 'warn',
        detail: voiceRes.data?.available ? 'Voice transcription ready' : 'Voice features unavailable (optional)'
      };
      setChecks({ ...next });
    } catch {
      next.ollama = { status: 'fail', detail: 'Ollama not found. Install from ollama.ai and run: ollama serve' };
      setChecks({ ...next });
    } finally {
      setChecking(false);
    }
  };

  const requiredReady = useMemo(() => checks.ollama?.status === 'ok' && checks.model?.status === 'ok', [checks]);

  // Creates first workspace and local user identity from wizard inputs.
  const createWorkspace = async () => {
    if (!form.owner.trim() || !form.name.trim()) return;
    setCreating(true);
    try {
      const res = await axios.post('/api/workspaces/create', {
        name: form.name,
        description: form.description,
        owner_name: form.owner
      });
      const ws = res.data.workspace;
      setWorkspace({ id: ws.id, name: ws.name, description: ws.description, owner_name: ws.owner_name, join_code: ws.join_code });

      const userRes = await axios.post('/api/workspace/user', {
        name: form.owner,
        workspace_id: ws.id,
        avatar_color: '#E8000D',
        language: 'en'
      });
      setUser(userRes.data);
      localStorage.setItem('ryflow_onboarded', 'true');
      setJoinCode(res.data.join_code || ws.join_code || '');
    } catch {
      toast.error('Failed to create workspace');
    } finally {
      setCreating(false);
    }
  };

  const openApp = () => {
    localStorage.setItem('ryflow_setup_complete', 'true');
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-amd-charcoal flex items-center justify-center p-6">
      <div className="w-full max-w-[520px] glass-card p-6 space-y-4">
        <div className="flex justify-center gap-2">
          {[1, 2, 3].map((i) => <span key={i} className={`w-2 h-2 rounded-full ${step === i ? 'bg-amd-red' : 'bg-white/20'}`} />)}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h1 className="font-heading text-3xl text-amd-white text-center">Welcome to RyFlow</h1>
              <p className="text-center text-amd-white/60 mt-2">Your offline AI workspace for campus teams.</p>
              <div className="text-center mt-4 text-xs text-amd-red">Built on AMD ROCm</div>
              <button onClick={() => setStep(2)} className="mt-6 w-full py-2 rounded bg-amd-red text-white">Get Started</button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="font-heading text-xl text-amd-white mb-3">Checking your setup...</h2>
              <div className="space-y-2">
                <CheckRow label="Ollama" status={checks.ollama?.status} detail={checks.ollama?.detail} />
                <CheckRow label="AI Model" status={checks.model?.status} detail={checks.model?.detail} />
                <CheckRow label="AMD GPU" status={checks.gpu?.status} detail={checks.gpu?.detail} />
                <CheckRow label="Whisper" status={checks.voice?.status} detail={checks.voice?.detail} />
              </div>
              <button onClick={runChecks} disabled={checking} className="mt-3 px-3 py-2 rounded bg-white/10 text-amd-white text-sm">{checking ? 'Checking...' : 'Check Again'}</button>
              <button onClick={() => setStep(3)} disabled={!requiredReady} className="mt-3 ml-2 px-3 py-2 rounded bg-amd-red text-white text-sm disabled:opacity-50">Continue</button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="font-heading text-xl text-amd-white mb-3">Create Your First Workspace</h2>
              <div className="space-y-2">
                <input value={form.owner} onChange={(e) => setForm((s) => ({ ...s, owner: e.target.value }))} placeholder="Your name" className="w-full bg-amd-gray/40 border border-white/10 rounded px-3 py-2 text-sm text-amd-white" />
                <input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="Workspace name" className="w-full bg-amd-gray/40 border border-white/10 rounded px-3 py-2 text-sm text-amd-white" />
                <input value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} placeholder="Description (optional)" className="w-full bg-amd-gray/40 border border-white/10 rounded px-3 py-2 text-sm text-amd-white" />
              </div>

              {!joinCode ? (
                <button onClick={createWorkspace} disabled={creating} className="mt-4 w-full py-2 rounded bg-amd-red text-white disabled:opacity-50">{creating ? 'Creating...' : 'Create Workspace'}</button>
              ) : (
                <div className="mt-4 rounded bg-amd-orange/20 border border-amd-orange/30 p-3 text-center">
                  <div className="text-sm text-amd-white">Your workspace is ready! Share this code with teammates:</div>
                  <div className="text-2xl tracking-widest text-amd-orange font-bold mt-2">{joinCode}</div>
                  <button onClick={() => navigator.clipboard.writeText(joinCode)} className="mt-2 px-2 py-1 text-xs rounded bg-white/10 text-amd-white/70">Copy</button>
                  <button onClick={openApp} className="mt-3 w-full py-2 rounded bg-amd-red text-white">Open RyFlow</button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
