// TopBar — shows workspace name, AMD status badge, and peer count
import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, Users, Wifi, WifiOff } from 'lucide-react';
import useStore from '../../store/useStore';
import { detectAMD } from '../../utils/amdDetect';
import { startPeerPolling, stopPeerPolling } from '../../utils/lanDiscovery';
import AMDbadge from './AMDbadge';
import ThemeToggle from './ThemeToggle';

export default function TopBar() {
  const { aiStatus, setAiStatus, peers, setPeers, user, workspace, aiActive } = useStore();

  // Fetch AMD/system status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      const status = await detectAMD();
      if (status) setAiStatus(status);
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [setAiStatus]);

  // Start peer polling
  useEffect(() => {
    startPeerPolling(setPeers);
    return () => stopPeerPolling();
  }, [setPeers]);

  return (
    <header className="h-14 border-b border-white/5 bg-amd-charcoal/80 backdrop-blur-md flex items-center justify-between px-6">
      {/* Left: breadcrumb */}
      <div className="flex items-center gap-3">
        <h2 className="font-heading font-semibold text-amd-white/80 text-sm">
          {workspace?.name || 'RyFlow'}
        </h2>
      </div>

      {/* Right: status indicators */}
      <div className="flex items-center gap-4">
        {/* Ollama status */}
        {!aiStatus.ollamaRunning && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amd-orange/10 text-amd-orange text-xs">
            <WifiOff size={12} />
            <span>Start Ollama for AI</span>
          </div>
        )}

        {/* AMD badge */}
        <AMDbadge />

        {/* Peer count */}
        <div className="flex items-center gap-1.5 text-amd-white/50 text-xs">
          <Users size={14} />
          <span>{peers.length} peer{peers.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Theme toggle */}
        <ThemeToggle />

        {/* User avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style={{ backgroundColor: user?.avatar_color || '#E8000D' }}
        >
          {user?.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
      </div>
    </header>
  );
}
