// NLTaskInput — Natural language task creation powered by LLM
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, Check, Plus } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import VoiceInput from '../ai/VoiceInput';

export default function NLTaskInput({ onTasksCreated }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [parsedTasks, setParsedTasks] = useState([]);
  const { workspace, setAiActive } = useStore();

  // Sends natural language to the backend for AI parsing into tasks
  const handleCreate = useCallback(async (inputText = null) => {
    const nlText = inputText || text;
    if (!nlText.trim() || !workspace) return;

    setLoading(true);
    setAiActive(true);
    try {
      const res = await axios.post('/api/tasks/nl-create', {
        text: nlText,
        workspace_id: workspace.id
      });

      setParsedTasks(res.data.tasks || []);
      setText('');
      toast.success(`${res.data.parsed || 0} task(s) created from your input!`);
      onTasksCreated && onTasksCreated(res.data.tasks);

      // Clear parsed tasks preview after 3 seconds
      setTimeout(() => setParsedTasks([]), 3000);
    } catch (err) {
      toast.error('Failed to parse tasks. Is Ollama running?');
    } finally {
      setLoading(false);
      setAiActive(false);
    }
  }, [text, workspace, setAiActive, onTasksCreated]);

  return (
    <div className="space-y-3">
      {/* Text input with AI indicator */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder='e.g. "Remind design team to submit posters 2 days before Techfest and book the auditorium sound system"'
            className="w-full bg-amd-gray/50 border border-white/10 rounded-xl px-4 py-3 pr-12 text-sm text-amd-white placeholder:text-amd-white/30 outline-none focus:border-amd-red/50 transition-colors"
            disabled={loading}
          />
          <Sparkles size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-amd-red/40" />
        </div>
        <button
          onClick={() => handleCreate()}
          disabled={loading || !text.trim()}
          className="px-4 py-3 rounded-xl bg-amd-red text-white text-sm flex items-center gap-1.5 disabled:opacity-50 hover:bg-amd-red/80 transition-colors"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Create
        </button>
      </div>

      {/* Voice input option */}
      <VoiceInput
        onTranscript={(transcript) => {
          setText(transcript);
          handleCreate(transcript);
        }}
        placeholder="Speak your tasks..."
      />

      {/* Parsed tasks preview */}
      <AnimatePresence>
        {parsedTasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-2"
          >
            <p className="text-xs text-amd-green flex items-center gap-1">
              <Check size={12} /> AI parsed {parsedTasks.length} task(s):
            </p>
            {parsedTasks.map((task, i) => (
              <motion.div
                key={task.id || i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="glass-card p-2 text-xs text-amd-white/70 flex items-center gap-2"
              >
                <Check size={12} className="text-amd-green flex-shrink-0" />
                <span className="font-medium text-amd-white">{task.title}</span>
                {task.priority && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    task.priority === 'high' ? 'bg-amd-red/20 text-amd-red' :
                    task.priority === 'medium' ? 'bg-amd-orange/20 text-amd-orange' :
                    'bg-white/10 text-amd-white/50'
                  }`}>
                    {task.priority}
                  </span>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
