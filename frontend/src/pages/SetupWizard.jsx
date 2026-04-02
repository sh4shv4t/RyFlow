// First-launch setup wizard with non-blocking background dependency checks.
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';

const API_BASE = (window.location.protocol === 'file:' || window.electronAPI?.isElectron)
  ? 'http://localhost:3001'
  : '';

// Renders one compact status item with a dot indicator and tooltip detail.
function StatusItem({ label, status, detail }) {
  const dotBase = {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: 0
  };

  let dotStyle = { ...dotBase, backgroundColor: 'var(--status-warning)' };
  if (status === 'checking') {
    dotStyle = {
      ...dotBase,
      backgroundColor: 'transparent',
      border: '1.5px solid var(--border-default)',
      borderTopColor: 'var(--text-tertiary)',
      animation: 'spin 0.8s linear infinite'
    };
  } else if (status === 'ok') {
    dotStyle = { ...dotBase, backgroundColor: 'var(--status-success)' };
  } else if (status === 'warning') {
    dotStyle = { ...dotBase, backgroundColor: 'var(--status-warning)' };
  } else if (status === 'missing') {
    dotStyle = { ...dotBase, backgroundColor: 'var(--status-warning)' };
  }

  return (
    <div title={detail || label} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-secondary)' }}>
      <span style={dotStyle} />
      <span>{label}</span>
    </div>
  );
}

export default function SetupWizard() {
  const { setUser, setWorkspace } = useStore();
  const [step, setStep] = useState(1);
  const [checks, setChecks] = useState({
    ollama: 'checking',
    model: 'checking',
    amd: 'checking',
    whisper: 'checking'
  });
  const [checkDetails, setCheckDetails] = useState({
    ollama: 'Checking Ollama availability',
    model: 'Checking installed model(s)',
    amd: 'Checking AMD GPU / ROCm status',
    whisper: 'Checking voice transcription availability'
  });
  const [form, setForm] = useState({ owner: '', name: '', description: '' });
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);

  // Wraps asynchronous work with a timeout to avoid hanging UI checks.
  const withTimeout = async (promise, ms = 3000) => {
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), ms);
    });
    return Promise.race([promise, timeout]);
  };

  // Checks local Ollama status without blocking setup flow.
  const checkOllama = async () => {
    try {
      const res = await withTimeout(fetch('http://localhost:11434/api/tags'), 3000);
      if (!res.ok) throw new Error('offline');
      setChecks((prev) => ({ ...prev, ollama: 'ok' }));
      setCheckDetails((prev) => ({ ...prev, ollama: 'Ollama is running' }));
    } catch {
      setChecks((prev) => ({ ...prev, ollama: 'missing' }));
      setCheckDetails((prev) => ({ ...prev, ollama: 'Ollama missing or not responding within 3s' }));
    }
  };

  // Checks whether a common local model is available.
  const checkModel = async () => {
    try {
      const res = await withTimeout(fetch('http://localhost:11434/api/tags'), 3000);
      if (!res.ok) throw new Error('offline');
      const data = await res.json();
      const hasModel = (data.models || []).some((m) =>
        String(m?.name || '').includes('phi3') ||
        String(m?.name || '').includes('gemma') ||
        String(m?.name || '').includes('llama')
      );
      setChecks((prev) => ({ ...prev, model: hasModel ? 'ok' : 'missing' }));
      setCheckDetails((prev) => ({
        ...prev,
        model: hasModel ? 'Compatible local model detected' : 'No common model found (phi3/gemma/llama)'
      }));
    } catch {
      setChecks((prev) => ({ ...prev, model: 'missing' }));
      setCheckDetails((prev) => ({ ...prev, model: 'Unable to verify models (timeout/offline)' }));
    }
  };

  // Checks AMD/ROCm status via backend system endpoint.
  const checkAMD = async () => {
    try {
      const res = await withTimeout(fetch(`${API_BASE}/api/ai/system-status`), 3000);
      if (!res.ok) throw new Error('offline');
      const data = await res.json();
      const amdOk = Boolean(data?.rocmAvailable);
      setChecks((prev) => ({ ...prev, amd: amdOk ? 'ok' : 'warning' }));
      setCheckDetails((prev) => ({
        ...prev,
        amd: amdOk ? 'AMD GPU acceleration available' : 'Using CPU mode (GPU acceleration unavailable)'
      }));
    } catch {
      setChecks((prev) => ({ ...prev, amd: 'warning' }));
      setCheckDetails((prev) => ({ ...prev, amd: 'System status unavailable; defaulting to CPU mode' }));
    }
  };

  // Checks voice transcription availability.
  const checkWhisper = async () => {
    try {
      const res = await withTimeout(fetch(`${API_BASE}/api/voice/status`), 3000);
      if (!res.ok) throw new Error('offline');
      const data = await res.json();
      const available = Boolean(data?.available);
      setChecks((prev) => ({ ...prev, whisper: available ? 'ok' : 'warning' }));
      setCheckDetails((prev) => ({
        ...prev,
        whisper: available ? 'Voice transcription available' : 'Voice optional feature unavailable'
      }));
    } catch {
      setChecks((prev) => ({ ...prev, whisper: 'warning' }));
      setCheckDetails((prev) => ({ ...prev, whisper: 'Voice status check timed out or failed' }));
    }
  };

  // Runs checks in parallel on initial render and never blocks wizard flow.
  useEffect(() => {
    Promise.allSettled([
      checkOllama(),
      checkModel(),
      checkAMD(),
      checkWhisper()
    ]);
  }, []);

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
      localStorage.setItem('ryflow_setup_complete', 'true');
      setJoinCode(res.data.join_code || ws.join_code || '');
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    } catch {
      toast.error('Failed to create workspace');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ backgroundColor: '#111111', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ backgroundColor: '#1A1A1A', border: '1px solid #333333', borderRadius: '8px', padding: '40px', width: '100%', maxWidth: '440px' }}>
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '32px' }}>
          {[1, 2].map((i) => (
            <span key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: step === i ? 'var(--accent)' : 'var(--border-default)' }} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '24px' }}>
                <div style={{ width: '26px', height: '26px', backgroundColor: '#E8000D', borderRadius: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#FFFFFF', fontSize: '13px', fontWeight: '700', lineHeight: 1 }}>R</span>
                </div>
                <span style={{ fontSize: '15px', fontWeight: '600', color: '#F0F0F0' }}>RyFlow</span>
              </div>
              <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#F0F0F0', textAlign: 'center' }}>Welcome to RyFlow</h1>
              <p style={{ fontSize: '13px', color: '#999999', textAlign: 'center', marginTop: '6px' }}>Your offline AI workspace for campus teams.</p>
              <div
                style={{
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'center',
                  padding: '10px 14px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  marginTop: '20px',
                  marginBottom: '24px',
                  flexWrap: 'wrap'
                }}
              >
                <StatusItem label="Ollama" status={checks.ollama} detail={checkDetails.ollama} />
                <StatusItem label="Model" status={checks.model} detail={checkDetails.model} />
                <StatusItem label="AMD GPU" status={checks.amd} detail={checkDetails.amd} />
                <StatusItem label="Voice" status={checks.whisper} detail={checkDetails.whisper} />
              </div>
              <button onClick={() => setStep(2)} style={{ width: '100%', height: '36px', borderRadius: '6px', border: 'none', backgroundColor: '#E8000D', color: '#FFFFFF', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>Get Started</button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#F0F0F0', textAlign: 'center' }}>Create Your First Workspace</h2>
              <p style={{ fontSize: '13px', color: '#999999', textAlign: 'center', marginTop: '6px', marginBottom: '14px' }}>Set up your owner profile and workspace</p>
              <div style={{ display: 'grid', gap: '8px' }}>
                <input value={form.owner} onChange={(e) => setForm((s) => ({ ...s, owner: e.target.value }))} placeholder="Your name" style={{ width: '100%', height: '34px', backgroundColor: '#1A1A1A', border: '1px solid #333333', borderRadius: '6px', padding: '0 10px', fontSize: '13px', color: '#F0F0F0' }} />
                <input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="Workspace name" style={{ width: '100%', height: '34px', backgroundColor: '#1A1A1A', border: '1px solid #333333', borderRadius: '6px', padding: '0 10px', fontSize: '13px', color: '#F0F0F0' }} />
                <input value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} placeholder="Description (optional)" style={{ width: '100%', height: '34px', backgroundColor: '#1A1A1A', border: '1px solid #333333', borderRadius: '6px', padding: '0 10px', fontSize: '13px', color: '#F0F0F0' }} />
              </div>

              {!joinCode ? (
                <button onClick={createWorkspace} disabled={creating} style={{ marginTop: '24px', width: '100%', height: '36px', borderRadius: '6px', border: 'none', backgroundColor: '#E8000D', color: '#FFFFFF', fontSize: '13px', fontWeight: '500', cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1 }}>{creating ? 'Creating...' : 'Create Workspace'}</button>
              ) : (
                <div style={{ marginTop: '16px', border: '1px solid #333333', borderRadius: '6px', backgroundColor: '#1A1A1A', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '13px', color: '#999999' }}>Your workspace is ready. Share this code:</div>
                  <div style={{ fontSize: '20px', letterSpacing: '0.08em', color: '#E8000D', fontWeight: '600', marginTop: '8px' }}>{joinCode}</div>
                  <button onClick={() => navigator.clipboard.writeText(joinCode)} style={{ marginTop: '10px', height: '30px', borderRadius: '6px', border: '1px solid #333333', backgroundColor: '#1A1A1A', color: '#999999', fontSize: '12px', padding: '0 10px', cursor: 'pointer' }}>Copy</button>
                  <button onClick={() => { window.location.href = '/'; }} style={{ marginTop: '10px', width: '100%', height: '36px', borderRadius: '6px', border: 'none', backgroundColor: '#E8000D', color: '#FFFFFF', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>Open RyFlow</button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
