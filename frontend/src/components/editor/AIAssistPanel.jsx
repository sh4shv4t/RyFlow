import { useEffect, useMemo, useState } from 'react';
import useOllama from '../../hooks/useOllama';

const ACTION_PROMPTS = {
  improve: 'Improve and rewrite this text to be clearer and more professional. Return only the improved text, no explanation:',
  summarize: 'Summarize this text concisely in 2-3 sentences. Return only the summary:',
  translate: 'Translate this text to Hindi. Return only the translation:',
  expand: 'Expand this text with more detail and explanation. Return only the expanded text:'
};

const ACTION_OPTIONS = ['improve', 'summarize', 'translate', 'expand'];

export default function AIAssistPanel({ text, action, onApply, onClose }) {
  const [currentAction, setCurrentAction] = useState(action || 'improve');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const { chat, loading } = useOllama();

  useEffect(() => {
    if (action) setCurrentAction(action);
  }, [action]);

  const trimmedText = useMemo(() => String(text || '').trim(), [text]);

  async function runAssist(nextAction = currentAction) {
    if (!trimmedText) {
      setError('Select some text before using AI Assist.');
      setResult('');
      return;
    }

    setError('');
    setCurrentAction(nextAction);
    setResult('');

    try {
      const prompt = `${ACTION_PROMPTS[nextAction]}\n\n${trimmedText}`;
      const res = await chat([{ role: 'user', content: prompt }]);
      setResult(String(res?.content || '').trim());
    } catch (err) {
      setError(err?.message || 'AI Assist failed.');
    }
  }

  useEffect(() => {
    if (!trimmedText) {
      setResult('');
      return;
    }
    runAssist(action || currentAction);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedText, action]);

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: '16px',
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-tertiary)',
          marginBottom: '8px'
        }}
      >
        Action
      </div>

      <div
        style={{
          display: 'flex',
          gap: '6px',
          flexWrap: 'wrap',
          marginBottom: '12px'
        }}
      >
        {ACTION_OPTIONS.map((option) => (
          <button
            key={option}
            onClick={() => runAssist(option)}
            style={{
              padding: '5px 10px',
              background: currentAction === option ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
              border: currentAction === option ? '1px solid rgba(232,0,13,0.28)' : '1px solid var(--border-subtle)',
              borderRadius: '4px',
              fontSize: '12px',
              color: currentAction === option ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            {option}
          </button>
        ))}
      </div>

      <div
        style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-tertiary)',
          marginBottom: '8px'
        }}
      >
        Selected Text
      </div>

      <textarea
        readOnly
        value={trimmedText}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          minHeight: '84px',
          resize: 'vertical',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '6px',
          color: 'var(--text-secondary)',
          fontSize: '12px',
          lineHeight: 1.6,
          padding: '10px',
          marginBottom: '12px'
        }}
      />

      <div
        style={{
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-tertiary)',
          marginBottom: '8px'
        }}
      >
        Result
      </div>

      <div
        style={{
          width: '100%',
          boxSizing: 'border-box',
          minHeight: '140px',
          maxHeight: '45vh',
          overflowY: 'auto',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '6px',
          padding: '10px',
          marginBottom: '12px'
        }}
      >
        <div
          style={{
            fontSize: '13px',
            lineHeight: 1.7,
            color: 'var(--text-primary)',
            whiteSpace: 'pre-wrap'
          }}
        >
          {loading ? 'Generating...' : (result || error || 'No result yet.')}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => onApply?.(result)}
          disabled={!result || loading}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            height: '32px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '4px',
            color: '#FFFFFF',
            fontSize: '12px',
            fontWeight: 500,
            cursor: !result || loading ? 'not-allowed' : 'pointer',
            opacity: !result || loading ? 0.65 : 1
          }}
        >
          Apply
        </button>
        <button
          onClick={onClose}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            height: '32px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
