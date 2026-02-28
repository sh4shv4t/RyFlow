// Hook for Ollama LLM inference — handles chat, streaming, and status checks
import { useState, useCallback } from 'react';
import axios from 'axios';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';

export default function useOllama() {
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const { selectedModel, setAiActive, language } = useStore();

  // Sends a chat message and returns the full response
  const chat = useCallback(async (messages, model = null) => {
    setLoading(true);
    setAiActive(true);
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
      return res.data.content;
    } catch (err) {
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

      const response = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: finalMessages,
          model: model || selectedModel
        })
      });

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
                onChunk && onChunk(parsed.text, fullText);
              }
            } catch {}
          }
        }
      }

      return fullText;
    } catch (err) {
      toast.error('AI streaming failed. Is Ollama running?');
      throw err;
    } finally {
      setLoading(false);
      setAiActive(false);
    }
  }, [selectedModel, language, setAiActive]);

  // Fetches the AI system status
  const getStatus = useCallback(async () => {
    try {
      const res = await axios.get('/api/ai/system-status');
      return res.data;
    } catch (err) {
      return null;
    }
  }, []);

  return { chat, chatStream, getStatus, loading, streamingText };
}
