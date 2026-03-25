// ChatPanel — Local LLM chat interface with streaming, persistence, and prompt templates
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Zap, Loader2, Trash2, ChevronDown } from 'lucide-react';
import useOllama from '../../hooks/useOllama';
import useStore from '../../store/useStore';
import toast from 'react-hot-toast';
import axios from 'axios';

const PROMPT_TEMPLATES = [
  { label: '📋 Draft a fest poster description', prompt: 'Draft a creative and engaging poster description for a college tech fest.' },
  { label: '📝 Summarize my notes', prompt: 'Summarize the following notes concisely:' },
  { label: '✅ Break this goal into tasks', prompt: 'Break this goal into actionable tasks with deadlines:' },
  { label: '📢 Write a club announcement', prompt: 'Write a professional club announcement for:' },
];

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'bn', label: 'Bengali' },
  { code: 'mr', label: 'Marathi' },
];

export default function ChatPanel({ activeChatId, onChatPersisted, onRequestNewChat }) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [runtimeTemplates, setRuntimeTemplates] = useState(PROMPT_TEMPLATES);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [chatTitle, setChatTitle] = useState('New Chat');
  const [titleGenerated, setTitleGenerated] = useState(false);
  const messagesEndRef = useRef(null);
  const { chatStream, loading, streamingText } = useOllama();
  const { selectedModel, setSelectedModel, language, setLanguage, aiStatus, workspace, setAiActive } = useStore();

  useEffect(() => {
    if (!workspace?.id) return;
    axios.get('/api/templates', { params: { workspace_id: workspace.id, type: 'chat' } })
      .then((res) => {
        const fromApi = (res.data.templates || []).map((tpl) => ({
          label: `🧩 ${tpl.name}`,
          prompt: tpl.content
        }));
        setRuntimeTemplates([...PROMPT_TEMPLATES, ...fromApi]);
      })
      .catch(() => {
        setRuntimeTemplates(PROMPT_TEMPLATES);
      });
  }, [workspace?.id]);

  // Builds a fallback chat title from first user text.
  const fallbackTitle = useCallback((text) => {
    const value = String(text || '').trim();
    if (!value) return 'New Chat';
    return value.length > 50 ? `${value.slice(0, 50)}...` : value;
  }, []);

  // Persists current chat session by creating or updating chat row.
  const persistChat = useCallback(async (nextMessages, options = {}) => {
    if (!workspace?.id || !Array.isArray(nextMessages) || nextMessages.length === 0) return null;
    const payload = {
      workspace_id: workspace.id,
      title: options.title || chatTitle,
      messages: nextMessages,
      model: selectedModel,
      rag_used: options.ragUsed ? 1 : 0
    };

    if (!currentChatId) {
      const created = await axios.post('/api/chats', payload);
      setCurrentChatId(created.data.id);
      setChatTitle(created.data.title || payload.title);
      onChatPersisted && onChatPersisted();
      return created.data.id;
    }

    await axios.put(`/api/chats/${currentChatId}`, payload);
    onChatPersisted && onChatPersisted();
    return currentChatId;
  }, [workspace?.id, chatTitle, selectedModel, currentChatId, onChatPersisted]);

  // Loads a selected chat session into the panel.
  const loadChat = useCallback(async (chatId) => {
    if (!chatId) {
      setMessages([]);
      setCurrentChatId(null);
      setChatTitle('New Chat');
      setTitleGenerated(false);
      return;
    }
    try {
      const res = await axios.get(`/api/chats/${chatId}`);
      setMessages(Array.isArray(res.data.messages) ? res.data.messages : []);
      setCurrentChatId(res.data.id);
      setChatTitle(res.data.title || 'New Chat');
      setTitleGenerated(true);
    } catch {
      toast.error('Failed to load chat');
    }
  }, []);

  useEffect(() => {
    loadChat(activeChatId || null);
  }, [activeChatId, loadChat]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Persists pending chat state when this panel unmounts.
  useEffect(() => () => {
    if (messages.length > 0) {
      persistChat(messages).catch(() => {});
    }
  }, [messages, persistChat]);

  // Auto-generates a concise chat title after first full exchange.
  useEffect(() => {
    const generateTitle = async () => {
      if (titleGenerated || messages.length < 2 || !currentChatId) return;
      const firstUser = messages.find((m) => m.role === 'user' && m.content);
      if (!firstUser) return;
      try {
        setAiActive(true);
        const res = await axios.post('/api/ai/chat', {
          messages: [{
            role: 'user',
            content: `Generate a 4-6 word title for a conversation that starts with: '${firstUser.content}'. Return only the title, nothing else.`
          }],
          model: selectedModel,
          workspace_id: null
        });
        const title = String(res.data.content || '').trim().replace(/^"|"$/g, '') || fallbackTitle(firstUser.content);
        setChatTitle(title);
        await axios.put(`/api/chats/${currentChatId}`, {
          title,
          messages,
          model: selectedModel
        });
        setTitleGenerated(true);
        onChatPersisted && onChatPersisted();
      } catch {
        setTitleGenerated(true);
      } finally {
        setAiActive(false);
      }
    };
    generateTitle();
  }, [messages, titleGenerated, currentChatId, selectedModel, fallbackTitle, onChatPersisted, setAiActive]);

  // Sends a message to the LLM and streams the response
  const sendMessage = useCallback(async (text = null) => {
    const msgText = text || input.trim();
    if (!msgText || !workspace?.id) return;

    const userMsg = { role: 'user', content: msgText };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');

    try {
      let workingChatId = currentChatId;
      if (!workingChatId) {
        const firstTitle = fallbackTitle(msgText);
        workingChatId = await persistChat(newMessages, { title: firstTitle, ragUsed: false });
      }

      const streamResult = await chatStream(
        newMessages.map(m => ({ role: m.role, content: m.content })),
        () => {} // streaming updates handled by hook
      );

      const fullResponse = typeof streamResult === 'string' ? streamResult : streamResult?.content || '';
      const ragUsed = typeof streamResult === 'object' ? Boolean(streamResult?.ragUsed) : false;
      const citations = typeof streamResult === 'object' ? (streamResult?.citations || []) : [];

      const finalMessages = [...newMessages, { role: 'assistant', content: fullResponse, ragUsed, citations }];
      setMessages(finalMessages);
      setCurrentChatId(workingChatId || null);
      await persistChat(finalMessages, { ragUsed });
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Could not reach Ollama. Please make sure it\'s running on localhost:11434'
      }]);
    }
  }, [input, messages, chatStream, workspace?.id, currentChatId, fallbackTitle, persistChat]);

  // Handles template selection
  const useTemplate = (template) => {
    setInput(template.prompt + ' ');
    setShowTemplates(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with model and language selectors */}
      <div className="flex items-center justify-between p-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <h3 className="font-heading font-semibold text-amd-white">AI Chat</h3>
          {/* Model selector */}
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="text-xs bg-amd-gray border border-white/10 rounded px-2 py-1 text-amd-white outline-none"
          >
            {(aiStatus.models?.length > 0 ? aiStatus.models : [{ name: 'phi3:mini' }, { name: 'gemma:2b' }, { name: 'tinyllama' }])
              .map(m => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))
            }
          </select>
          {/* Language selector */}
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="text-xs bg-amd-gray border border-white/10 rounded px-2 py-1 text-amd-white outline-none"
          >
            {LANGUAGES.map(l => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => {
            setMessages([]);
            setCurrentChatId(null);
            setChatTitle('New Chat');
            setTitleGenerated(false);
            onRequestNewChat && onRequestNewChat();
          }}
          className="text-amd-white/40 hover:text-amd-red transition-colors"
          title="Clear chat"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Zap size={48} className="text-amd-red/30 mb-4" />
            <h3 className="font-heading font-semibold text-amd-white/80 text-lg mb-2">
              Local AI, Zero Cloud
            </h3>
            <p className="text-sm text-amd-white/40 max-w-md mb-6">
              Everything runs on your device via Ollama. No data leaves your machine. Ever.
            </p>
            {/* Prompt templates */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-md">
              {runtimeTemplates.map((t, i) => (
                <button
                  key={i}
                  onClick={() => useTemplate(t)}
                  className="text-left text-xs p-3 glass-card glass-card-hover text-amd-white/70 hover:text-amd-white transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-amd-red/20 text-amd-white ml-8'
                  : 'glass-card text-amd-white/90 mr-8'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.role === 'assistant' && (
                <>
                  <div className="flex items-center gap-1 mt-2 text-[10px] text-amd-red/50">
                    <Zap size={8} /> Powered by AMD ROCm
                  </div>
                  {msg.ragUsed && (
                    <div className="mt-1 text-[11px] italic text-amd-orange/90">
                      📚 Answered using your workspace knowledge
                    </div>
                  )}
                  {Array.isArray(msg.citations) && msg.citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {msg.citations.map((c, idx) => (
                        <button
                          key={`${c.id}-${idx}`}
                          onClick={() => {
                            if (c.type === 'doc') navigate(c.source_id ? `/editor/${c.source_id}` : '/editor');
                            else if (c.type === 'code') navigate(c.source_id ? `/code/${c.source_id}` : '/code');
                            else if (c.type === 'canvas') navigate(c.source_id ? `/canvas/${c.source_id}` : '/canvas');
                            else if (c.type === 'task') navigate('/tasks');
                            else navigate('/graph');
                          }}
                          className="text-[10px] px-2 py-1 rounded-full bg-amd-orange/20 text-amd-orange hover:bg-amd-orange/30"
                        >
                          {c.title}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        ))}

        {/* Streaming response */}
        {loading && streamingText && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="max-w-[80%] glass-card rounded-2xl px-4 py-3 text-sm text-amd-white/90 mr-8">
              <div className="whitespace-pre-wrap">
                {streamingText}<span className="animate-pulse text-amd-red">▊</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Loading indicator */}
        {loading && !streamingText && (
          <div className="flex justify-start">
            <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-2">
              <div className="skeleton-loader-red h-4 w-32" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-white/5">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Ask anything locally..."
              className="w-full bg-amd-gray/50 border border-white/10 rounded-xl px-4 py-3 text-sm text-amd-white placeholder:text-amd-white/30 outline-none focus:border-amd-red/50 transition-colors"
              disabled={loading}
            />
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="absolute right-12 top-1/2 -translate-y-1/2 text-amd-white/30 hover:text-amd-white/60"
            >
              <ChevronDown size={16} />
            </button>
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="px-4 py-3 rounded-xl bg-amd-red text-white disabled:opacity-50 hover:bg-amd-red/80 transition-colors flex items-center gap-1"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>

        {/* Template dropdown */}
        <AnimatePresence>
          {showTemplates && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-2 glass-card p-2 space-y-1"
            >
              {runtimeTemplates.map((t, i) => (
                <button
                  key={i}
                  onClick={() => useTemplate(t)}
                  className="w-full text-left text-xs p-2 rounded hover:bg-white/5 text-amd-white/70 transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
