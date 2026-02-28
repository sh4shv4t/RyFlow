// ChatPanel — Local LLM chat interface with streaming and prompt templates
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Zap, Loader2, Trash2, ChevronDown } from 'lucide-react';
import useOllama from '../../hooks/useOllama';
import useStore from '../../store/useStore';
import toast from 'react-hot-toast';

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

export default function ChatPanel() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const messagesEndRef = useRef(null);
  const { chatStream, loading, streamingText } = useOllama();
  const { selectedModel, setSelectedModel, language, setLanguage, aiStatus } = useStore();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Sends a message to the LLM and streams the response
  const sendMessage = useCallback(async (text = null) => {
    const msgText = text || input.trim();
    if (!msgText) return;

    const userMsg = { role: 'user', content: msgText };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');

    try {
      const fullResponse = await chatStream(
        newMessages.map(m => ({ role: m.role, content: m.content })),
        () => {} // streaming updates handled by hook
      );

      setMessages(prev => [...prev, { role: 'assistant', content: fullResponse }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Could not reach Ollama. Please make sure it\'s running on localhost:11434'
      }]);
    }
  }, [input, messages, chatStream]);

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
          onClick={() => setMessages([])}
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
              {PROMPT_TEMPLATES.map((t, i) => (
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
                <div className="flex items-center gap-1 mt-2 text-[10px] text-amd-red/50">
                  <Zap size={8} /> Powered by AMD ROCm
                </div>
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
              {PROMPT_TEMPLATES.map((t, i) => (
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
