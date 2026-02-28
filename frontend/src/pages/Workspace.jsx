// Workspace page — workspace overview and management
import React from 'react';
import { motion } from 'framer-motion';
import { Settings, Users, Database, Zap } from 'lucide-react';
import useStore from '../store/useStore';
import PeerList from '../components/workspace/PeerList';

export default function Workspace() {
  const { workspace, user, aiStatus, peers } = useStore();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-heading text-2xl font-bold text-amd-white">
          {workspace?.name || 'Workspace'}
        </h1>
        <p className="text-amd-white/50 mt-1">Workspace settings and team management</p>
      </motion.div>

      <div className="grid grid-cols-2 gap-6">
        {/* Workspace info */}
        <div className="glass-card p-6">
          <h3 className="font-heading font-semibold text-amd-white mb-4 flex items-center gap-2">
            <Database size={18} className="text-amd-red" /> Workspace Details
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-amd-white/40">Name</label>
              <p className="text-sm text-amd-white">{workspace?.name}</p>
            </div>
            <div>
              <label className="text-xs text-amd-white/40">ID</label>
              <p className="text-xs text-amd-white/60 font-mono">{workspace?.id}</p>
            </div>
            <div>
              <label className="text-xs text-amd-white/40">Created</label>
              <p className="text-sm text-amd-white">{workspace?.created_at ? new Date(workspace.created_at).toLocaleDateString() : '-'}</p>
            </div>
          </div>
        </div>

        {/* User info */}
        <div className="glass-card p-6">
          <h3 className="font-heading font-semibold text-amd-white mb-4 flex items-center gap-2">
            <Users size={18} className="text-amd-orange" /> Your Profile
          </h3>
          <div className="flex items-center gap-4 mb-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold"
              style={{ backgroundColor: user?.avatar_color || '#E8000D' }}
            >
              {user?.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div>
              <p className="text-lg text-amd-white font-medium">{user?.name}</p>
              <p className="text-xs text-amd-white/40">Language: {user?.language || 'en'}</p>
            </div>
          </div>
        </div>

        {/* System status */}
        <div className="glass-card p-6">
          <h3 className="font-heading font-semibold text-amd-white mb-4 flex items-center gap-2">
            <Zap size={18} className="text-amd-green" /> System Status
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-amd-white/50">GPU</span>
              <span className="text-amd-white">{aiStatus.gpuName || 'Not detected'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-amd-white/50">ROCm</span>
              <span className={aiStatus.rocmAvailable ? 'text-amd-green' : 'text-amd-orange'}>
                {aiStatus.rocmAvailable ? 'Active' : 'Not available'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-amd-white/50">Ollama</span>
              <span className={aiStatus.ollamaRunning ? 'text-amd-green' : 'text-amd-orange'}>
                {aiStatus.ollamaRunning ? 'Running' : 'Offline'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-amd-white/50">Inference</span>
              <span className="text-amd-white">{aiStatus.inferenceMode}</span>
            </div>
          </div>
        </div>

        {/* Team / peers */}
        <div>
          <h3 className="font-heading font-semibold text-amd-white mb-4 flex items-center gap-2">
            <Users size={18} /> Network Peers ({peers.length})
          </h3>
          <PeerList />
        </div>
      </div>
    </div>
  );
}
