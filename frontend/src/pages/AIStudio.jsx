// AI Studio page — Chat + Image Generation + Voice tabs with persistent chat history
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, Image, Mic, Plus, Trash2, Search } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import ChatPanel from '../components/ai/ChatPanel';
import ImageGen from '../components/ai/ImageGen';
import VoiceInput from '../components/ai/VoiceInput';
import StudyGuidePanel from '../components/ai/StudyGuidePanel';
import useStore from '../store/useStore';
import Skeleton from '../components/common/Skeleton';

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
  const workspaceId = useStore((s) => s.workspace?.id || null);
  const fetchTokenRef = useRef(0);

  // Loads saved chats for the active workspace.
  const fetchChats = useCallback(async () => {
    if (!workspaceId) return;
    const token = fetchTokenRef.current + 1;
    fetchTokenRef.current = token;
    setChatLoading(true);
    try {
      const res = await axios.get('/api/chats', { params: { workspace_id: workspaceId } });
      if (token !== fetchTokenRef.current) return;
      setChats(res.data.chats || []);
    } catch {
      toast.error('Failed to load chat history');
    } finally {
      if (token === fetchTokenRef.current) {
        setChatLoading(false);
      }
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  // Creates a fresh local chat session context.
  const handleNewChat = useCallback(() => {
    setActiveChatId(null);
  }, []);

  // Deletes a saved chat with optimistic UI removal.
  const handleDeleteChat = useCallback(async (chatId) => {
    const previous = chats;
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) {
      setActiveChatId(null);
    }
    try {
      await axios.delete(`/api/chats/${chatId}`);
    } catch {
      setChats(previous);
      fetchChats();
      toast.error('Failed to delete chat');
    }
  }, [activeChatId, chats, fetchChats]);

  const handleChatCreated = useCallback((createdChat) => {
    if (!createdChat?.id) return;
    setActiveChatId(createdChat.id);
    setChats((prev) => {
      const filtered = prev.filter((c) => c.id !== createdChat.id);
      return [createdChat, ...filtered];
    });
  }, []);

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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', height: '100%', overflow: 'hidden', backgroundColor: '#111111' }}>
      <div
        style={{
          width: '240px',
          minWidth: '240px',
          backgroundColor: '#1A1A1A',
          borderRight: '1px solid #242424',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            padding: '14px 12px 10px',
            borderBottom: '1px solid #242424',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#F0F0F0', flex: 1 }}>Chats</span>
          <button
            onClick={handleNewChat}
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Plus size={14} color="#666666" />
          </button>
        </div>

        <div style={{ padding: '8px 12px', borderBottom: '1px solid #242424' }}>
          <div style={{ position: 'relative' }}>
            <Search size={13} color="#666666" style={{ position: 'absolute', left: '8px', top: '7px' }} />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search chats..."
              style={{
                width: '100%',
                height: '28px',
                padding: '0 10px 0 28px',
                backgroundColor: '#222222',
                border: '1px solid #333333',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#F0F0F0'
              }}
            />
          </div>
        </div>

        <div style={{ padding: '8px 12px', borderBottom: '1px solid #242424' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{
                  height: '24px',
                  borderRadius: '4px',
                  border: activeTab === key ? '1px solid rgba(232,0,13,0.3)' : '1px solid #333333',
                  backgroundColor: activeTab === key ? 'rgba(232,0,13,0.08)' : '#1A1A1A',
                  color: activeTab === key ? '#E8000D' : '#666666',
                  fontSize: '11px',
                  padding: '0 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
          {chatLoading && (
            <div style={{ display: 'grid', gap: '6px', padding: '8px 6px' }}>
              {[1, 2, 3, 4].map((item) => (
                <div key={item} style={{ border: '1px solid #2D2D2D', borderRadius: '6px', padding: '8px' }}>
                  <Skeleton width="70%" height={12} radius={4} style={{ marginBottom: '8px' }} />
                  <Skeleton width="46%" height={10} radius={4} />
                </div>
              ))}
            </div>
          )}
          {!chatLoading && filteredChats.length === 0 && (
            <p style={{ padding: '20px 10px', fontSize: '13px', color: '#666666', textAlign: 'center' }}>No chats yet</p>
          )}
          {!chatLoading && filteredChats.map((chat) => (
            <div
              key={chat.id}
              style={{ position: 'relative' }}
              onMouseEnter={(e) => {
                const btn = e.currentTarget.querySelector('.chat-delete-btn');
                if (btn) btn.style.opacity = '1';
                const card = e.currentTarget.querySelector('.chat-item-card');
                if (card && activeChat?.id !== chat.id) card.style.backgroundColor = '#222222';
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget.querySelector('.chat-delete-btn');
                if (btn) btn.style.opacity = '0';
                const card = e.currentTarget.querySelector('.chat-item-card');
                if (card && activeChat?.id !== chat.id) card.style.backgroundColor = 'transparent';
              }}
            >
              <button
                className="chat-item-card"
                onClick={() => setActiveChatId(chat.id)}
                style={{
                  width: '100%',
                  padding: activeChat?.id === chat.id ? '8px 28px 8px 8px' : '8px 28px 8px 10px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  marginBottom: '1px',
                  transition: 'background 150ms',
                  borderLeft: activeChat?.id === chat.id ? '2px solid #E8000D' : '2px solid transparent',
                  backgroundColor: activeChat?.id === chat.id ? 'rgba(232,0,13,0.08)' : 'transparent',
                  borderTop: 'none',
                  borderRight: 'none',
                  borderBottom: 'none',
                  textAlign: 'left'
                }}
              >
                <p
                  style={{
                    fontSize: '13px',
                    fontWeight: '500',
                    color: '#F0F0F0',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginBottom: '3px'
                  }}
                >
                  {chat.title}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ fontSize: '10px', textTransform: 'uppercase', backgroundColor: '#2A2A2A', color: '#666666', padding: '1px 5px', borderRadius: '2px' }}>{chat.model}</span>
                  {chat.rag_used ? <span style={{ fontSize: '10px', textTransform: 'uppercase', backgroundColor: 'rgba(59,130,246,0.1)', color: '#3B82F6', padding: '1px 5px', borderRadius: '2px' }}>RAG</span> : null}
                  <span style={{ fontSize: '10px', color: '#666666', marginLeft: 'auto' }}>{timeAgo(chat.updated_at)}</span>
                </div>
              </button>

              <button
                className="chat-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChat(chat.id);
                }}
                style={{
                  opacity: 0,
                  position: 'absolute',
                  right: '6px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--error)',
                  padding: '2px 4px',
                  borderRadius: '3px',
                  flexShrink: 0,
                  transition: 'opacity 150ms ease'
                }}
                title="Delete chat"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#111111' }}>
        <div style={{ padding: '14px 20px 10px' }}>
          <h1
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              paddingLeft: '12px',
              borderLeft: '3px solid var(--accent)',
              margin: 0
            }}
          >
            AI Studio
          </h1>
        </div>
        <AnimatePresence mode="wait">
          {activeTab === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            >
              <ChatPanel
                activeChatId={activeChatId}
                onChatCreated={handleChatCreated}
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
              style={{ flex: 1, overflow: 'hidden' }}
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
              style={{ flex: 1, overflow: 'hidden' }}
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
              style={{ flex: 1, padding: '20px', overflowY: 'auto' }}
            >
              <div style={{ maxWidth: '720px', margin: '0 auto' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#F0F0F0', marginBottom: '4px' }}>Voice Input</h2>
                <p style={{ fontSize: '13px', color: '#999999', marginBottom: '16px' }}>
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
