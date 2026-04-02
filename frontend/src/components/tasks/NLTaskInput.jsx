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
  const [flashSuccess, setFlashSuccess] = useState(false);
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
      }, {
        timeout: 35000
      });

      const createdTasks = res.data.tasks || [];
      if (createdTasks.length === 0) {
        toast.error('No tasks were parsed. Try a clearer sentence or one task per line.');
        return;
      }
      setParsedTasks(createdTasks);
      onTasksCreated && onTasksCreated(createdTasks);
      setText('');
      toast.success(`✅ ${createdTasks.length} tasks created`);
      setFlashSuccess(true);
      setTimeout(() => setFlashSuccess(false), 500);

      // Clear parsed tasks preview after 3 seconds
      setTimeout(() => setParsedTasks([]), 3000);
    } catch (err) {
      const backendMessage = err?.response?.data?.error || err?.response?.data?.details;
      if (err?.code === 'ECONNABORTED') {
        toast.error('Task parsing timed out. Try a shorter request.');
      } else if (err?.response?.status === 422) {
        toast.error(backendMessage || 'Could not parse tasks reliably. Try one task per line.');
      } else {
        toast.error(backendMessage || 'Failed to parse tasks. Is Ollama running?');
      }
    } finally {
      setLoading(false);
      setAiActive(false);
    }
  }, [text, workspace, setAiActive, onTasksCreated]);

  return (
    <div style={{ marginBottom: '20px', flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder='e.g. "Remind design team to submit posters 2 days before Techfest and book the auditorium sound system"'
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#444444';
              e.currentTarget.style.boxShadow = '0 0 0 2px rgba(232,0,13,0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = flashSuccess ? '#3D9970' : '#333333';
              e.currentTarget.style.boxShadow = 'none';
            }}
            style={{
              width: '100%',
              height: '36px',
              padding: '0 36px 0 12px',
              backgroundColor: '#1A1A1A',
              border: `1px solid ${flashSuccess ? '#3D9970' : '#333333'}`,
              borderRadius: '6px',
              fontSize: '13px',
              color: '#F0F0F0',
              outline: 'none'
            }}
            disabled={loading}
          />
          <Sparkles size={14} color="#666666" style={{ position: 'absolute', right: '10px', top: '11px' }} />
        </div>
        <button
          onClick={() => handleCreate()}
          disabled={loading || !text.trim()}
          onMouseEnter={(e) => {
            if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = '#CC0000';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#E8000D';
          }}
          style={{
            height: '36px',
            padding: '0 16px',
            backgroundColor: '#E8000D',
            color: '#FFFFFF',
            fontSize: '13px',
            fontWeight: '500',
            border: 'none',
            borderRadius: '6px',
            cursor: loading || !text.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            opacity: loading || !text.trim() ? 0.6 : 1
          }}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Create
        </button>
      </div>

      <div style={{ marginTop: '10px' }}>
        <VoiceInput
          onTranscript={(transcript) => {
            setText(transcript);
            handleCreate(transcript);
          }}
          placeholder="Speak your tasks..."
        />
      </div>

      <AnimatePresence>
        {parsedTasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}
          >
            <p style={{ fontSize: '11px', color: '#3D9970', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Check size={12} /> AI parsed {parsedTasks.length} task(s):
            </p>
            {parsedTasks.map((task, i) => (
              <motion.div
                key={task.id || i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                style={{
                  backgroundColor: '#1A1A1A',
                  border: '1px solid #333333',
                  borderRadius: '6px',
                  padding: '8px 10px',
                  fontSize: '12px',
                  color: '#999999',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <Check size={12} color="#3D9970" style={{ flexShrink: 0 }} />
                <span style={{ fontWeight: '500', color: '#F0F0F0' }}>{task.title}</span>
                {task.priority && (
                  <span
                    style={{
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontSize: '10px',
                      backgroundColor: task.priority === 'high'
                        ? 'rgba(192,57,43,0.15)'
                        : task.priority === 'medium'
                        ? 'rgba(184,92,0,0.15)'
                        : 'rgba(85,85,85,0.15)',
                      color: task.priority === 'high'
                        ? '#C0392B'
                        : task.priority === 'medium'
                        ? '#B85C00'
                        : '#888888'
                    }}
                  >
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
