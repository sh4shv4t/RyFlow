// VoiceInput — Mic recording + Whisper transcription UI component
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Loader2, Keyboard, Zap } from 'lucide-react';
import useVoice from '../../hooks/useVoice';
import useStore from '../../store/useStore';

export default function VoiceInput({ onTranscript, placeholder }) {
  const [manualMode, setManualMode] = useState(false);
  const [manualText, setManualText] = useState('');
  const {
    recording, transcribing, transcript, setTranscript,
    whisperAvailable, checkWhisper, startRecording, stopRecording
  } = useVoice();
  const { workspace } = useStore();

  // Check whisper availability on mount
  useEffect(() => {
    checkWhisper();
  }, [checkWhisper]);

  // Forward transcript to parent when received
  useEffect(() => {
    if (transcript) {
      onTranscript && onTranscript(transcript);
    }
  }, [transcript, onTranscript]);

  // Handles mic button click
  const handleMicClick = async () => {
    if (recording) {
      const result = await stopRecording(workspace?.id);
      if (result) onTranscript && onTranscript(result);
    } else {
      await startRecording();
    }
  };

  // Handles manual text submission
  const handleManualSubmit = () => {
    if (manualText.trim()) {
      onTranscript && onTranscript(manualText.trim());
      setManualText('');
    }
  };

  const micStyle = recording
    ? {
        backgroundColor: 'var(--accent)',
        color: 'var(--text-on-accent)',
        border: '1px solid var(--accent-border)'
      }
    : transcribing
    ? {
        backgroundColor: 'var(--bg-elevated)',
        color: 'var(--accent)',
        border: '1px solid var(--accent-border)'
      }
    : {
        backgroundColor: 'var(--bg-surface)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-default)'
      };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {/* Mic button */}
        <motion.button
          onClick={handleMicClick}
          disabled={transcribing || manualMode}
          whileTap={{ scale: 0.95 }}
          className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all ${recording ? 'amd-pulse' : ''}`}
          style={micStyle}
        >
          {transcribing ? (
            <Loader2 size={20} className="animate-spin" />
          ) : recording ? (
            <MicOff size={20} />
          ) : (
            <Mic size={20} />
          )}

          {/* Recording pulse rings */}
          <AnimatePresence>
            {recording && (
              <>
                <motion.div
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 2, opacity: 0 }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute inset-0 rounded-full bg-amd-red"
                />
                <motion.div
                  initial={{ scale: 1, opacity: 0.3 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  transition={{ duration: 1, repeat: Infinity, delay: 0.5 }}
                  className="absolute inset-0 rounded-full bg-amd-red"
                />
              </>
            )}
          </AnimatePresence>
        </motion.button>

        <div className="flex-1">
          {transcribing && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--accent)' }}>
              <Zap size={14} style={{ color: 'var(--accent)' }} />
              🎙 Transcribing via AMD Ryzen AI...
            </div>
          )}
          {recording && (
            <div className="text-sm animate-pulse" style={{ color: 'var(--accent)' }}>
              Recording... (tap to stop, max 60s)
            </div>
          )}
          {!recording && !transcribing && (
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {whisperAvailable === false
                ? 'Whisper not available — use manual input'
                : 'Tap mic to record, or type below'}
            </p>
          )}
        </div>

        {/* Toggle manual mode */}
        <button
          onClick={() => setManualMode(!manualMode)}
          className="p-2 rounded-lg transition-colors"
          style={{
            backgroundColor: manualMode ? 'var(--accent-subtle)' : 'transparent',
            color: manualMode ? 'var(--accent)' : 'var(--text-tertiary)',
            border: manualMode ? '1px solid var(--accent-border)' : '1px solid transparent'
          }}
          title="Switch to manual text input"
        >
          <Keyboard size={18} />
        </button>
      </div>

      {/* Manual text input fallback */}
      <AnimatePresence>
        {(manualMode || whisperAvailable === false) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
              placeholder={placeholder || 'Type your text here...'}
              className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)'
              }}
            />
            <button
              onClick={handleManualSubmit}
              className="px-4 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--text-on-accent)',
                border: '1px solid var(--accent-border)'
              }}
            >
              Submit
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transcript display */}
      {transcript && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-3 text-sm"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span className="text-xs block mb-1" style={{ color: 'var(--text-tertiary)' }}>Transcription:</span>
          {transcript}
        </motion.div>
      )}
    </div>
  );
}
