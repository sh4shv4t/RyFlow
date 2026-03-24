// Hook for Ollama LLM inference — handles chat, streaming, and status checks
import { useState, useCallback } from 'react';
import axios from 'axios';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';

export default function useOllama() {
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState(null);
  const { selectedModel, setAiActive, language } = useStore();
  const API_BASE = (window.location.protocol === 'file:' || window.electronAPI?.isElectron)
    ? 'http://localhost:3001'
    : '';

  // Sends a chat message and returns the full response
  const chat = useCallback(async (messages, model = null) => {
    setLoading(true);
    setAiActive(true);
    setError(null);
    try {
      // Prepend language system prompt if not English
      const langPrompts = {
        hi: 'Respond only in Hindi.',
        ta: 'Respond only in Tamil.',
        bn: 'Respond only in Bengali.',
        mr: 'Respond only in Marathi.',
      };
      let finalMessages = [...messages];
      if (language !== 'en' && langPrompts[language]) {
        finalMessages = [{ role: 'system', content: langPrompts[language] }, ...finalMessages];
      }

      const res = await axios.post('/api/ai/chat', {
        messages: finalMessages,
        model: model || selectedModel
      });
      // Expose latest response for consumers that use stateful API shape.
      setResponse(res.data.content || '');
      return res.data.content;
    } catch (err) {
      setError(err.message || 'AI service unavailable');
      toast.error('AI service unavailable. Is Ollama running?');
      throw err;
    } finally {
      setLoading(false);
      setAiActive(false);
    }
  }, [selectedModel, language, setAiActive]);

  // Sends a streaming chat request via SSE
  const chatStream = useCallback(async (messages, onChunk, model = null) => {
    setLoading(true);
    setAiActive(true);
    setStreamingText('');
    setError(null);

    try {
      const langPrompts = {
        hi: 'Respond only in Hindi.',
        ta: 'Respond only in Tamil.',
        bn: 'Respond only in Bengali.',
        mr: 'Respond only in Marathi.',
      };
      let finalMessages = [...messages];
      if (language !== 'en' && langPrompts[language]) {
        finalMessages = [{ role: 'system', content: langPrompts[language] }, ...finalMessages];
      }

      const response = await fetch(`${API_BASE}/api/ai/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: finalMessages,
          model: model || selectedModel
        })
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to open SSE stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                fullText += parsed.text;
                setStreamingText(fullText);
                setResponse(fullText);
                onChunk && onChunk(parsed.text, fullText);
              }
            } catch {}
          }
        }
      }

      return fullText;
    } catch (err) {
      setError(err.message || 'AI streaming failed');
      toast.error('AI streaming failed. Is Ollama running?');
      throw err;
    } finally {
      setLoading(false);
      setAiActive(false);
    }
  }, [selectedModel, language, setAiActive]);

  // Provide a generic message sender API for components expecting a simplified hook contract.
  const sendMessage = useCallback(async (messages, onChunk, model = null) => {
    return chatStream(messages, onChunk, model);
  }, [chatStream]);

  // Fetches the AI system status
  const getStatus = useCallback(async () => {
    try {
      const res = await axios.get('/api/ai/system-status');
      return res.data;
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
    isLoading: loading,
    loading,
    streamingText
  };
}
