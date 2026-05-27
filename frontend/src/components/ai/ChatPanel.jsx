// ChatPanel — Local LLM chat interface with streaming, persistence, and prompt templates
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Zap, Loader2, Trash2, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import useOllama from '../../hooks/useOllama';
import useStore from '../../store/useStore';
import toast from 'react-hot-toast';
import axios from 'axios';
import { extractTextPreview } from '../../utils/content';

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

function createMessage(role, content, extras = {}) {
  return {
    id: (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`,
    role,
    content,
    ...extras
  };
}

const markdownComponents = {
  h1: ({ children }) => <h4 style={{ margin: '10px 0 6px', fontWeight: 600, color: 'inherit', fontSize: '15px' }}>{children}</h4>,
  h2: ({ children }) => <h5 style={{ margin: '8px 0 4px', fontWeight: 600, color: 'inherit', fontSize: '14px' }}>{children}</h5>,
  h3: ({ children }) => <h6 style={{ margin: '8px 0 4px', fontWeight: 600, color: 'inherit', fontSize: '13px' }}>{children}</h6>,
  h4: () => null,
  h5: () => null,
  h6: () => null,
  img: () => null,
  p: ({ children }) => <p style={{ margin: '0 0 8px', lineHeight: 1.7, color: 'inherit' }}>{children}</p>,
  ul: ({ children }) => <ul style={{ margin: '4px 0 8px', paddingLeft: '1.1rem', color: 'inherit' }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: '4px 0 8px', paddingLeft: '1.1rem', color: 'inherit' }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: 4, color: 'inherit' }}>{children}</li>,
  strong: ({ children }) => <strong style={{ fontWeight: 600, color: 'inherit' }}>{children}</strong>,
  em: ({ children }) => <em style={{ color: 'inherit' }}>{children}</em>,
  pre: ({ children }) => (
    <pre
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        borderRadius: 6,
        padding: 12,
        overflowX: 'auto',
        margin: '8px 0',
        color: 'inherit'
      }}
    >
      {children}
    </pre>
  ),
  code: ({ inline, children, ...props }) => {
    if (inline) {
      return (
        <code
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 3,
            padding: '1px 5px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            color: 'inherit'
          }}
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 12,
          background: 'none',
          border: 'none',
          padding: 0,
          display: 'block',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: 'inherit'
        }}
        {...props}
      >
        {children}
      </code>
    );
  }
};

function AssistantMessageMarkdown({ text }) {
  const src = typeof text === 'string' ? text : extractTextPreview(text, 2000);
  return (
    <div style={{ color: 'inherit' }}>
      <ReactMarkdown components={markdownComponents}>{src}</ReactMarkdown>
    </div>
  );
}

export default function ChatPanel({ activeChatId, onChatCreated, onRequestNewChat }) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [runtimeTemplates, setRuntimeTemplates] = useState(PROMPT_TEMPLATES);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [chatTitle, setChatTitle] = useState('');
  const messagesEndRef = useRef(null);
  const isSendingRef = useRef(false);
  const isCreatingRef = useRef(false);
  const { chatStream, loading, streamingText } = useOllama();
  const { selectedModel, setSelectedModel, language, setLanguage, aiStatus, workspace } = useStore();

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

  // Creates a chat record once (first-message flow).
  const createChatRecord = useCallback(async (userMessage) => {
    if (!workspace?.id) return null;
    if (isCreatingRef.current) return null;

    isCreatingRef.current = true;
    try {
      const res = await axios.post('/api/chats', {
        workspace_id: workspace.id,
        messages: [{ role: 'user', content: userMessage }],
        model: selectedModel,
        rag_used: 0
      });
      const created = res.data;
      setCurrentChatId(created.id);
      setChatTitle(created.title?.trim() || '');
      if (onChatCreated) onChatCreated(created);
      return created.id;
    } catch {
      toast.error('Could not create chat');
      return null;
    } finally {
      isCreatingRef.current = false;
    }
  }, [workspace?.id, selectedModel, onChatCreated]);

  // Persists updates for an already-created chat.
  const persistChatUpdate = useCallback(async (chatId, nextMessages, options = {}) => {
    if (!chatId || !workspace?.id) return;
    const res = await axios.put(`/api/chats/${chatId}`, {
      workspace_id: workspace.id,
      messages: nextMessages,
      model: selectedModel,
      rag_used: options.ragUsed ? 1 : 0
    });
    const t = res.data?.title;
    if (typeof t === 'string' && t.trim()) setChatTitle(t.trim());
    return res.data;
  }, [workspace?.id, selectedModel]);

  // Loads a selected chat session into the panel.
  const loadChat = useCallback(async (chatId) => {
    if (!chatId) {
      setMessages([]);
      setCurrentChatId(null);
      setChatTitle('');
      return;
    }
    try {
      const res = await axios.get(`/api/chats/${chatId}`);
      const hydrated = (Array.isArray(res.data.messages) ? res.data.messages : [])
        .map((msg) => ({
          ...msg,
          id: msg.id || ((typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`)
        }));
      setMessages(hydrated);
      setCurrentChatId(res.data.id);
      setChatTitle(String(res.data.title || '').trim());
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

  // Sends a message to the LLM and streams the response
  const sendMessage = useCallback(async (text = null) => {
    const msgText = text || input.trim();
    if (!msgText || !workspace?.id || isSendingRef.current) return;

    isSendingRef.current = true;

    const userMsg = createMessage('user', msgText);
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');

    try {
      let workingChatId = currentChatId;
      if (!workingChatId) {
        workingChatId = await createChatRecord(msgText);
        if (!workingChatId) {
          isSendingRef.current = false;
          return;
        }
      }

      const streamResult = await chatStream(
        newMessages.map(m => ({ role: m.role, content: m.content })),
        () => {} // streaming updates handled by hook
      );

      const fullResponse = typeof streamResult === 'string' ? streamResult : streamResult?.content || '';
      const ragUsed = typeof streamResult === 'object' ? Boolean(streamResult?.ragUsed) : false;
      const citations = typeof streamResult === 'object' ? (streamResult?.citations || []) : [];

      const finalMessages = [...newMessages, createMessage('assistant', fullResponse, { ragUsed, citations })];
      setMessages(finalMessages);
      setCurrentChatId(workingChatId || null);
      await persistChatUpdate(workingChatId, finalMessages, { ragUsed });
    } catch {
      setMessages((prev) => [...prev, createMessage('assistant', '⚠️ Could not reach Ollama. Please make sure it\'s running on localhost:11434')]);
    } finally {
      isSendingRef.current = false;
    }
  }, [input, messages, chatStream, workspace?.id, currentChatId, createChatRecord, persistChatUpdate]);

  // Handles template selection
  const useTemplate = (template) => {
    setInput(template.prompt + ' ');
    setShowTemplates(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header with model and language selectors */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}>
        <div className="flex items-center gap-3">
          <h3 style={{ fontWeight: 600, color: 'var(--text-primary)' }}>AI Chat</h3>
          {/* Model selector */}
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            style={{ fontSize: '12px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '4px', padding: '4px 8px', color: 'var(--text-primary)', outline: 'none' }}
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
            style={{ fontSize: '12px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '4px', padding: '4px 8px', color: 'var(--text-primary)', outline: 'none' }}
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
            setChatTitle('');
            onRequestNewChat && onRequestNewChat();
          }}
          style={{ color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
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
            <h3 style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '18px', marginBottom: '8px' }}>
              Local AI, Zero Cloud
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', maxWidth: '28rem', marginBottom: '24px' }}>
              Everything runs on your device via Ollama. No data leaves your machine. Ever.
            </p>
            {/* Prompt templates */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-md">
              {runtimeTemplates.map((t, i) => (
                <button
                  key={i}
                  onClick={() => useTemplate(t)}
                  style={{ textAlign: 'left', fontSize: '12px', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', transition: 'background-color 150ms ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-overlay)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'; }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <motion.div
            key={msg.id || `${msg.role}-${i}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              style={{
                maxWidth: '80%',
                borderRadius: '16px',
                padding: '12px 16px',
                fontSize: '13px',
                marginLeft: msg.role === 'user' ? '32px' : 0,
                marginRight: msg.role === 'assistant' ? '32px' : 0,
                backgroundColor: msg.role === 'user' ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
                border: msg.role === 'user' ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)',
                color: 'var(--text-primary)'
              }}
            >
              {msg.role === 'assistant' ? (
                <AssistantMessageMarkdown text={msg.content} />
              ) : (
                <p style={{
                  fontSize: 13,
                  lineHeight: 1.7,
                  color: 'var(--text-primary)',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}>
                  {typeof msg.content === 'string'
                    ? msg.content
                    : extractTextPreview(msg.content, 2000)
                  }
                </p>
              )}
              {msg.role === 'assistant' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px', fontSize: '10px', color: 'var(--text-tertiary)' }}>
                    <Zap size={8} /> Powered by AMD ROCm
                  </div>
                  {msg.ragUsed && (
                    <div style={{ marginTop: '6px', fontSize: '11px', fontStyle: 'italic', backgroundColor: 'var(--bg-overlay)', color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: '999px', display: 'inline-flex', padding: '2px 8px' }}>
                      📚 Answered using your workspace knowledge
                    </div>
                  )}
                  {Array.isArray(msg.citations) && msg.citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {msg.citations.map((c, idx) => (
                        <button
                          key={`${c.id}-${idx}`}
                          onClick={() => {
                            if (c.type === 'document') navigate(c.source_id ? `/editor/${c.source_id}` : '/documents');
                            else if (c.type === 'code') navigate(c.source_id ? `/code/${c.source_id}` : '/code');
                            else if (c.type === 'canvas') navigate(c.source_id ? `/canvas/${c.source_id}` : '/canvas');
                            else if (c.type === 'task') navigate('/tasks');
                            else navigate('/graph');
                          }}
                          style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '999px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
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
            <div style={{ maxWidth: '80%', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '16px', padding: '12px 16px', fontSize: '13px', color: 'var(--text-primary)', marginRight: '32px' }}>
              <AssistantMessageMarkdown text={streamingText} />
              <span className="animate-pulse text-amd-red">▊</span>
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
      <div style={{ padding: '12px', borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              className="placeholder:text-[var(--text-tertiary)]"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder="Ask anything locally..."
              style={{ width: '100%', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: '12px', padding: '12px 16px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none' }}
              disabled={loading}
            />
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="absolute right-12 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
            >
              <ChevronDown size={16} />
            </button>
          </div>
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="px-4 py-3 rounded-xl bg-accent text-[var(--text-on-accent)] disabled:opacity-50 hover:bg-amd-red/80 transition-colors flex items-center gap-1"
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
              style={{ marginTop: '8px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px' }}
            >
              {runtimeTemplates.map((t, i) => (
                <button
                  key={i}
                  onClick={() => useTemplate(t)}
                  style={{ width: '100%', textAlign: 'left', fontSize: '12px', padding: '8px', borderRadius: '6px', color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-overlay)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
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
