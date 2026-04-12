// AMD Accelerated badge — pulses when AI inference is running
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Monitor } from 'lucide-react';
import useStore from '../../store/useStore';
import { apiFetch } from '../../utils/apiClient';

export function OllamaStatusBadge() {
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    let mounted = true;

    const checkStatus = async () => {
      try {
        const res = await apiFetch('/api/ai/system-status');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json().catch(() => ({}));
        const isAvailable = Boolean(
          data?.ollama_available ??
          data?.ollamaRunning ??
          data?.ollama_running ??
          data?.system?.ollama_running
        );
        if (mounted) setStatus(isAvailable ? 'ready' : 'offline');
      } catch {
        if (mounted) setStatus('offline');
      }
    };

    checkStatus();
    const intervalId = setInterval(checkStatus, 10000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, []);

  const isReady = status === 'ready';
  const label = isReady ? 'AI Ready' : 'Ollama Offline';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        borderRadius: '4px',
        padding: '2px 8px',
        border: isReady ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(245,158,11,0.35)',
        backgroundColor: isReady ? 'rgba(16,185,129,0.12)' : 'rgba(245,158,11,0.12)',
        color: isReady ? '#10B981' : '#F59E0B'
      }}
      title={isReady ? 'Ollama is reachable' : 'Ollama is not running'}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: 'currentColor',
          flexShrink: 0
        }}
      />
      <span style={{ fontSize: '11px', fontWeight: '500' }}>{label}</span>
    </div>
  );
}

export default function AMDbadge() {
  const { aiStatus, aiActive } = useStore();

  const isROCm = aiStatus.rocmAvailable;
  const isGPU = aiStatus.gpuDetected;

  return (
    <motion.div
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
        ${isROCm
          ? 'bg-amd-green/10 text-amd-green border border-amd-green/20'
          : 'bg-amd-orange/10 text-amd-orange border border-amd-orange/20'
        }
        ${aiActive ? 'amd-active' : ''}
      `}
      animate={aiActive ? { scale: [1, 1.02, 1] } : {}}
      transition={{ duration: 0.5, repeat: aiActive ? Infinity : 0 }}
    >
      {isROCm ? (
        <>
          <Zap size={12} className="text-amd-green" />
          <span>⚡ AMD ROCm — GPU Accelerated</span>
        </>
      ) : (
        <>
          <Monitor size={12} />
          <span>🖥 CPU Mode</span>
        </>
      )}

      {/* Active inference dot */}
      <AnimatePresence>
        {aiActive && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="w-2 h-2 rounded-full bg-current ml-1"
            style={{ animation: 'pulse 1s infinite' }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
