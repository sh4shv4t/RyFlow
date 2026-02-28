// AI Studio page — Chat + Image Generation + Voice tabs
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Image, Mic } from 'lucide-react';
import ChatPanel from '../components/ai/ChatPanel';
import ImageGen from '../components/ai/ImageGen';
import VoiceInput from '../components/ai/VoiceInput';

const tabs = [
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'image', label: 'Image Gen', icon: Image },
  { key: 'voice', label: 'Voice', icon: Mic },
];

export default function AIStudio() {
  const [activeTab, setActiveTab] = useState('chat');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-amd-white">AI Studio</h1>
          <p className="text-sm text-amd-white/40 mt-0.5">
            Powered by AMD ROCm &middot; Ollama &middot; Local inference
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-amd-gray/40 rounded-xl p-1 gap-0.5">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === key
                  ? 'bg-amd-red text-white shadow-lg shadow-amd-red/20'
                  : 'text-amd-white/50 hover:text-amd-white hover:bg-white/5'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden rounded-xl">
        <AnimatePresence mode="wait">
          {activeTab === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="h-full"
            >
              <ChatPanel />
            </motion.div>
          )}

          {activeTab === 'image' && (
            <motion.div
              key="image"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="h-full"
            >
              <ImageGen />
            </motion.div>
          )}

          {activeTab === 'voice' && (
            <motion.div
              key="voice"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="h-full glass-card p-6"
            >
              <div className="max-w-xl mx-auto">
                <h2 className="font-heading text-lg font-semibold text-amd-white mb-1">Voice Input</h2>
                <p className="text-sm text-amd-white/40 mb-6">
                  Record speech and transcribe with Whisper.cpp — fully offline
                </p>
                <VoiceInput onTranscript={(text) => {}} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
