// PeerList — Shows discovered LAN peers with online status
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Wifi, UserPlus } from 'lucide-react';
import useStore from '../../store/useStore';

export default function PeerList() {
  const { peers } = useStore();

  if (peers.length === 0) {
    return (
      <div className="glass-card p-4 text-center">
        <Users size={24} className="text-amd-white/20 mx-auto mb-2" />
        <p className="text-xs text-amd-white/40">No peers on your network yet</p>
        <p className="text-[10px] text-amd-white/20 mt-1">Peers running RyFlow on the same WiFi will appear here</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-amd-white flex items-center gap-2">
          <Wifi size={14} className="text-amd-green" />
          LAN Peers
        </h3>
        <span className="text-xs text-amd-white/40">{peers.length} online</span>
      </div>

      <div className="space-y-2">
        <AnimatePresence>
          {peers.map((peer, i) => (
            <motion.div
              key={`${peer.host}-${peer.port}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-amd-red/20 flex items-center justify-center text-amd-red text-xs font-bold">
                    {peer.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-amd-green border-2 border-amd-charcoal" />
                </div>
                <div>
                  <p className="text-sm text-amd-white font-medium">{peer.name}</p>
                  <p className="text-[10px] text-amd-white/30">{peer.host}:{peer.port}</p>
                </div>
              </div>

              <button className="p-1.5 rounded-lg text-amd-white/30 hover:text-amd-red hover:bg-amd-red/10 transition-colors" title="Invite to workspace">
                <UserPlus size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
