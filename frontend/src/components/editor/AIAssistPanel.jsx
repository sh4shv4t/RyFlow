// AI Assist Panel — processes selected text with AI actions (improve, summarize, translate, expand)
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Check, Loader2, Zap } from 'lucide-react';
import useOllama from '../../hooks/useOllama';

const ACTION_PROMPTS = {
  improve: 'Improve and rewrite this text to be clearer and more professional. Return only the improved text, no explanation:',
  summarize: 'Summarize this text concisely in 2-3 sentences. Return only the summary:',
  translate: 'Translate this text to Hindi. Return only the translation:',
  expand: 'Expand this text with more detail and explanation. Return only the expanded text:',
};

export default function AIAssistPanel({ text, action, onApply, onClose }) {
  const [result, setResult] = useState('');
  const { chatStream, loading, streamingText } = useOllama();

  // Runs the AI action on mount
  useEffect(() => {
    if (!text || !action) return;

    const prompt = `${ACTION_PROMPTS[action]} "${text}"`;
    chatStream(
      [{ role: 'user', content: prompt }],
      (chunk, full) => setResult(full)
    ).catch(() => {});
  }, [text, action]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="absolute bottom-4 right-4 w-96 glass-card p-4 shadow-2xl z-50"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-amd-red" />
          <span className="text-sm font-medium text-amd-white capitalize">{action} Text</span>
        </div>
        <button onClick={onClose} className="text-amd-white/40 hover:text-amd-white">
          <X size={16} />
        </button>
      </div>

      {/* Original text */}
      <div className="text-xs text-amd-white/40 mb-2">Original:</div>
      <div className="text-xs text-amd-white/60 bg-black/20 rounded p-2 mb-3 max-h-20 overflow-auto">
        {text}
      </div>

      {/* AI result */}
      <div className="text-xs text-amd-white/40 mb-2 flex items-center gap-1">
        AI Result:
        {loading && <Loader2 size={10} className="animate-spin text-amd-red" />}
      </div>
      <div className="text-sm text-amd-white bg-black/20 rounded p-3 mb-3 max-h-40 overflow-auto min-h-[60px]">
        {loading ? (
          <span>{streamingText || result}<span className="animate-pulse">▊</span></span>
        ) : (
          result || <span className="text-amd-white/30">Processing...</span>
        )}
      </div>

      {/* AMD badge */}
      <div className="flex items-center gap-1 text-[10px] text-amd-red/60 mb-3">
        <Zap size={8} /> Powered by AMD ROCm
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onApply(result || streamingText)}
          disabled={loading || !(result || streamingText)}
          className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg bg-amd-red text-white text-sm font-medium disabled:opacity-50 hover:bg-amd-red/80 transition-colors"
        >
          <Check size={14} /> Apply
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-white/5 text-amd-white/60 text-sm hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}
