// AI Studio page — Chat + Image Generation + Voice tabs with persistent chat history
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Image, Mic, Plus, Trash2, Search } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import ChatPanel from '../components/ai/ChatPanel';
import ImageGen from '../components/ai/ImageGen';
import VoiceInput from '../components/ai/VoiceInput';
import StudyGuidePanel from '../components/ai/StudyGuidePanel';
import useStore from '../store/useStore';

const tabs = [
  { key: 'chat', label: 'Chat', icon: MessageSquare },
  { key: 'study', label: 'Study Guide', icon: MessageSquare },
  { key: 'image', label: 'Image Gen', icon: Image },
  { key: 'voice', label: 'Voice', icon: Mic },
];

export default function AIStudio() {
  const [activeTab, setActiveTab] = useState('chat');
  const [chats, setChats] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [activeChatId, setActiveChatId] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const { workspace } = useStore();

  // Loads saved chats for the active workspace.
  const fetchChats = useCallback(async () => {
    if (!workspace?.id) return;
    setChatLoading(true);
    try {
      const res = await axios.get('/api/chats', { params: { workspace_id: workspace.id } });
      setChats(res.data.chats || []);
    } catch {
      toast.error('Failed to load chat history');
    } finally {
      setChatLoading(false);
    }
  }, [workspace?.id]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats, refreshKey]);

  // Creates a fresh local chat session context.
  const handleNewChat = useCallback(() => {
    setActiveChatId(null);
    setRefreshKey((k) => k + 1);
  }, []);

  // Deletes a saved chat after user confirmation.
  const handleDeleteChat = useCallback(async (chatId) => {
    const confirmed = window.confirm('Are you sure? This cannot be undone.');
    if (!confirmed) return;
    try {
      await axios.delete(`/api/chats/${chatId}`);
      toast.success('Are you sure? This cannot be undone.');
      if (activeChatId === chatId) {
        setActiveChatId(null);
      }
      fetchChats();
    } catch {
      toast.error('Failed to delete chat');
    }
  }, [activeChatId, fetchChats]);

  // Formats timestamps into short relative text for chat cards.
  const timeAgo = useCallback((iso) => {
    if (!iso) return 'just now';
    const delta = Date.now() - new Date(iso).getTime();
    const mins = Math.max(1, Math.floor(delta / 60000));
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }, []);

  // Filters chat history by title text.
  const filteredChats = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((chat) => String(chat.title || '').toLowerCase().includes(q));
  }, [chats, searchText]);

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
              className="h-full grid grid-cols-[300px_1fr] gap-4"
            >
              <div className="glass-card p-3 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-heading font-semibold text-amd-white">Chat History</h3>
                  <button
                    onClick={handleNewChat}
                    className="text-xs px-2 py-1 rounded bg-amd-red text-white flex items-center gap-1"
                  >
                    <Plus size={12} /> New Chat
                  </button>
                </div>

                <div className="relative mb-3">
                  <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-amd-white/30" />
                  <input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Search chats"
                    className="w-full bg-black/20 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-amd-white outline-none"
                  />
                </div>

                <div className="flex-1 overflow-auto space-y-2">
                  {chatLoading && <p className="text-xs text-amd-white/40">Loading chats...</p>}
                  {!chatLoading && filteredChats.length === 0 && (
                    <p className="text-xs text-amd-white/40">No saved chats yet</p>
                  )}
                  {filteredChats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => setActiveChatId(chat.id)}
                      className={`w-full text-left p-2.5 rounded-lg border-l-2 transition-colors ${
                        activeChatId === chat.id
                          ? 'border-l-amd-red bg-amd-red/10'
                          : 'border-l-transparent bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs text-amd-white font-medium truncate">{chat.title}</p>
                          <div className="flex items-center gap-1 mt-1 flex-wrap">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-amd-white/60">{chat.model}</span>
                            {chat.rag_used ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amd-orange/20 text-amd-orange">📚 RAG</span> : null}
                            <span className="text-[10px] text-amd-white/40">{chat.message_count} msgs</span>
                          </div>
                          <p className="text-[10px] text-amd-white/30 mt-1">{timeAgo(chat.updated_at)}</p>
                        </div>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteChat(chat.id);
                          }}
                          className="text-amd-white/30 hover:text-amd-red"
                        >
                          <Trash2 size={12} />
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <ChatPanel
                activeChatId={activeChatId}
                onChatPersisted={() => fetchChats()}
                onRequestNewChat={handleNewChat}
              />
            </motion.div>
          )}

          {activeTab === 'study' && (
            <motion.div
              key="study"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="h-full"
            >
              <StudyGuidePanel />
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
