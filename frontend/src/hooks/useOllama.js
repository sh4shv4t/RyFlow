// Hook for Ollama LLM inference — handles chat, streaming, and status checks
import { useState, useCallback, useRef, useEffect } from 'react';
import axios from 'axios';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';
import { apiFetch } from '../utils/apiClient';
import { detectAMD } from '../utils/amdDetect';

export default function useOllama() {
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState(null);
  const [ragUsed, setRagUsed] = useState(false);
  const [citations, setCitations] = useState([]);
  const chunkBufferRef = useRef('');
  const flushIntervalRef = useRef(null);
  const lastFlushedRef = useRef('');
  const { selectedModel, setAiActive, language, workspace } = useStore();

  const stopFlushLoop = useCallback(() => {
    if (flushIntervalRef.current) {
      clearInterval(flushIntervalRef.current);
      flushIntervalRef.current = null;
    }
  }, []);

  // Call this before starting a stream
  const startStreaming = useCallback((setResponseFn) => {
    chunkBufferRef.current = '';
    lastFlushedRef.current = '';
    stopFlushLoop();

    flushIntervalRef.current = setInterval(() => {
      const current = chunkBufferRef.current;
      if (current === lastFlushedRef.current) return;
      lastFlushedRef.current = current;
      setResponseFn(current);
    }, 50); // Update UI at most 20 times per second
  }, [stopFlushLoop]);

  // Call this when stream ends
  const stopStreaming = useCallback((setResponseFn) => {
    stopFlushLoop();
    setResponseFn(chunkBufferRef.current); // Final flush
  }, [stopFlushLoop]);

  // In the SSE chunk handler - do not set state here
  const handleChunk = useCallback((text) => {
    chunkBufferRef.current += text;
  }, []);

  useEffect(() => {
    return () => {
      stopFlushLoop();
    };
  }, [stopFlushLoop]);

  // Enforce selected language on every turn with stable system constraints.
  const buildLanguageLockedMessages = useCallback((messages) => {
    const langPrompts = {
      hi: { label: 'Hindi', system: 'Respond only in Hindi.' },
      ta: { label: 'Tamil', system: 'Respond only in Tamil.' },
      bn: { label: 'Bengali', system: 'Respond only in Bengali.' },
      mr: { label: 'Marathi', system: 'Respond only in Marathi.' },
    };

    const cloned = Array.isArray(messages) ? messages.map((m) => ({ ...m })) : [];
    if (language === 'en' || !langPrompts[language]) return cloned;

    const { label, system } = langPrompts[language];

    // Remove prior language-lock system instructions before adding the current one.
    const sanitized = cloned.filter((m) => !(m.role === 'system' && /Respond only in/i.test(m.content || '')));

    const locked = [
      { role: 'system', content: system },
      {
        role: 'system',
        content: `Strict rule: Every assistant response must be entirely in ${label}. If the user writes in another language, still reply only in ${label}.`
      },
      ...sanitized
    ];

    // Reinforce the most recent user turn to prevent drift in longer chats.
    for (let i = locked.length - 1; i >= 0; i -= 1) {
      if (locked[i].role === 'user') {
        locked[i].content = `[Reply language: ${label}]\n${locked[i].content || ''}`;
        break;
      }
    }

    return locked;
  }, [language]);

  // Sends a chat message and returns the full response
  const chat = useCallback(async (messages, model = null) => {
    setLoading(true);
    setAiActive(true);
    setError(null);
    setRagUsed(false);
    setCitations([]);
    try {
      const finalMessages = buildLanguageLockedMessages(messages);

      const res = await axios.post('/api/ai/chat', {
        messages: finalMessages,
        model: model || selectedModel,
        workspace_id: workspace?.id || null
      });
      // Expose latest response for consumers that use stateful API shape.
      setResponse(res.data.content || '');
      setRagUsed(Boolean(res.data.ragUsed));
      setCitations(Array.isArray(res.data.citations) ? res.data.citations : []);
      return {
        content: res.data.content || '',
        ragUsed: Boolean(res.data.ragUsed),
        citations: Array.isArray(res.data.citations) ? res.data.citations : []
      };
    } catch (err) {
      setError(err.message || 'AI service unavailable');
      toast.error('AI service unavailable. Is Ollama running?');
      throw err;
    } finally {
      setLoading(false);
      setAiActive(false);
    }
  }, [selectedModel, setAiActive, buildLanguageLockedMessages, workspace?.id]);

  // Sends a streaming chat request via SSE
  const chatStream = useCallback(async (messages, onChunk, model = null) => {
    setLoading(true);
    setAiActive(true);
    setStreamingText('');
    setError(null);
    setRagUsed(false);
    setCitations([]);

    try {
      const finalMessages = buildLanguageLockedMessages(messages);

      const response = await apiFetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: finalMessages,
          model: model || selectedModel,
          workspace_id: workspace?.id || null
        })
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to open SSE stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      startStreaming((current) => {
        setStreamingText(current);
        setResponse(current);
      });

      let localRagUsed = false;
      let localCitations = [];
      let sseBuffer = '';

      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });

        let newlineIndex = sseBuffer.indexOf('\n');
        while (newlineIndex >= 0) {
          const line = sseBuffer.slice(0, newlineIndex).trimEnd();
          sseBuffer = sseBuffer.slice(newlineIndex + 1);

          if (line.startsWith('data:')) {
            const data = line.slice(5).trimStart();
            if (data === '[DONE]') {
              streamDone = true;
              break;
            }
            try {
              const parsed = JSON.parse(data);
              if (typeof parsed.ragUsed === 'boolean') {
                localRagUsed = parsed.ragUsed;
                setRagUsed(localRagUsed);
              }
              if (Array.isArray(parsed.citations)) {
                localCitations = parsed.citations;
                setCitations(localCitations);
              }
              if (parsed.text) {
                handleChunk(parsed.text);
              }
            } catch {}
          }

          newlineIndex = sseBuffer.indexOf('\n');
        }
      }

      if (sseBuffer.trim().startsWith('data:')) {
        const data = sseBuffer.trim().slice(5).trimStart();
        if (data && data !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              handleChunk(parsed.text);
            }
          } catch {}
        }
      }

      stopStreaming((current) => {
        setStreamingText(current);
        setResponse(current);
      });

      const fullText = chunkBufferRef.current;
      if (onChunk) onChunk(fullText, fullText, localRagUsed, localCitations);
      return { content: fullText, ragUsed: localRagUsed, citations: localCitations };
    } catch (err) {
      stopFlushLoop();
      setError(err.message || 'AI streaming failed');
      toast.error('AI streaming failed. Is Ollama running?');
      throw err;
    } finally {
      setLoading(false);
      setAiActive(false);
    }
  }, [selectedModel, setAiActive, buildLanguageLockedMessages, workspace?.id]);

  // Provide a generic message sender API for components expecting a simplified hook contract.
  const sendMessage = useCallback(async (messages, onChunk, model = null) => {
    return chatStream(messages, onChunk, model);
  }, [chatStream]);

  // Fetches the AI system status
  const getStatus = useCallback(async () => {
    try {
      return await detectAMD();
    } catch (err) {
      return null;
    }
  }, []);

  return {
    chat,
    chatStream,
    getStatus,
    sendMessage,
    response,
    error,
    ragUsed,
    citations,
    isLoading: loading,
    loading,
    streamingText
  };
}
