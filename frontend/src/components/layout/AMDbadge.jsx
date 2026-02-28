// AMD Accelerated badge — pulses when AI inference is running
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Monitor } from 'lucide-react';
import useStore from '../../store/useStore';

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
        ${aiActive ? 'amd-pulse' : ''}
      `}
      animate={aiActive ? { scale: [1, 1.02, 1] } : {}}
      transition={{ duration: 0.5, repeat: aiActive ? Infinity : 0 }}
    >
      {isROCm ? (
        <>
          <Zap size={12} className="text-amd-green" />
          <span>AMD ROCm — GPU Accelerated</span>
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
