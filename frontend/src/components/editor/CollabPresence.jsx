// Collaboration presence indicator — shows who else is editing
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users } from 'lucide-react';
import usePeer from '../../hooks/usePeer';

export default function CollabPresence() {
  const { connected, presenceList } = usePeer();

  if (!connected || presenceList.length <= 1) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 glass-card">
      <Users size={14} className="text-amd-white/40" />
      <div className="flex -space-x-2">
        <AnimatePresence>
          {presenceList.map((peer, i) => (
            <motion.div
              key={peer.userId || i}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold border-2 border-amd-charcoal"
              style={{ backgroundColor: peer.avatarColor || '#E8000D' }}
              title={peer.userName}
            >
              {peer.userName?.charAt(0)?.toUpperCase() || '?'}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <span className="text-xs text-amd-white/40">
        {presenceList.length} editing
      </span>
    </div>
  );
}
