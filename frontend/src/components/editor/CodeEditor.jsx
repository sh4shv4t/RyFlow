// Monaco-powered code editor with AI actions and AMD-themed toolbar
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bug, Copy, Download, Languages, MessageSquareText, MessageSquareWarning, Sparkles, WrapText, X, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { apiFetch } from '../../utils/apiClient';

class MonacoErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

const LANGUAGE_OPTIONS = [
  { label: 'JavaScript', value: 'javascript', ext: 'js' },
  { label: 'TypeScript', value: 'typescript', ext: 'ts' },
  { label: 'Python', value: 'python', ext: 'py' },
  { label: 'Java', value: 'java', ext: 'java' },
  { label: 'C++', value: 'cpp', ext: 'cpp' },
  { label: 'C', value: 'c', ext: 'c' },
  { label: 'Rust', value: 'rust', ext: 'rs' },
  { label: 'Go', value: 'go', ext: 'go' },
  { label: 'HTML', value: 'html', ext: 'html' },
  { label: 'CSS', value: 'css', ext: 'css' },
  { label: 'SQL', value: 'sql', ext: 'sql' },
  { label: 'Bash', value: 'shell', ext: 'sh' },
  { label: 'JSON', value: 'json', ext: 'json' },
  { label: 'Markdown', value: 'markdown', ext: 'md' }
];

// Detects Monaco language from file name extension.
export function detectLanguageFromFileName(fileName = '') {
  const lower = fileName.toLowerCase();
  const map = {
    '.js': 'javascript',
    '.ts': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.c': 'c',
    '.rs': 'rust',
    '.go': 'go',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.sql': 'sql',
    '.sh': 'shell',
    '.bash': 'shell',
    '.json': 'json',
    '.md': 'markdown'
  };
  const ext = Object.keys(map).find((k) => lower.endsWith(k));
  return ext ? map[ext] : 'javascript';
}

// Returns the preferred file extension for the selected language.
function extensionForLanguage(language) {
  const found = LANGUAGE_OPTIONS.find((o) => o.value === language);
  return found?.ext || 'txt';
}

// Renders Monaco editor with code-specific toolbar actions and AI panel.
export default function CodeEditor({
  fileName,
  language,
  content,
  onContentChange,
  onLanguageChange
}) {
  const editorRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const [wordWrap, setWordWrap] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiPanelTitle, setAiPanelTitle] = useState('AI Assistant');
  const [aiText, setAiText] = useState('');
  const { selectedModel, workspace, setAiActive, theme: appTheme } = useStore();

  const monacoThemeName = appTheme === 'light' ? 'light' : 'vs-dark';
  // Cursor offset diagnosis (pre-fix): Monaco host height was tied to 100vh-96,
  // which can mismatch real shell chrome (titlebar/topbar/toolbar). Use explicit pixels.
  const editorHeight = 'calc(100vh - 140px)';

  // Configures custom Monaco theme to match RyFlow colors.
  const handleBeforeMount = useCallback((monaco) => {
    // Use a safe worker fallback to prevent runtime blank-editor failures.
    if (typeof window !== 'undefined') {
      window.MonacoEnvironment = {
        getWorker: () => null
      };
    }
  }, []);

  // Stores Monaco instance after mount for selection-aware actions.
  // Also forces repeated layout passes after mount and on container resize.
  const handleEditorMount = useCallback((editor) => {
    editorRef.current = editor;

    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }

    editor.layout();
    setTimeout(() => editor.layout(), 100);
    setTimeout(() => editor.layout(), 300);

    const container = editor.getContainerDomNode();
    if (container && typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        editor.layout();
      });
      ro.observe(container);
      resizeObserverRef.current = ro;
    }
  }, []);

  // Re-layout editor after theme/layout transitions to keep cursor and text alignment in sync.
  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.layout();
    const timer = setTimeout(() => {
      editorRef.current?.layout();
    }, 150);
    return () => clearTimeout(timer);
  }, [monacoThemeName]);

  // Re-layout after file switches to prevent stale click-to-cursor coordinate maps.
  useEffect(() => {
    if (!editorRef.current) return;
    const timer = setTimeout(() => {
      editorRef.current?.layout();
    }, 50);
    return () => clearTimeout(timer);
  }, [fileName, language]);

  useEffect(() => {
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, []);

  // Returns selected code or full editor content when no selection exists.
  const getActiveCode = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return content || '';
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!model || !selection) return content || '';
    const selected = model.getValueInRange(selection);
    return selected && selected.trim() ? selected : model.getValue();
  }, [content]);

  // Streams AI output for a code action and shows it in side panel.
  const runAiAction = useCallback(async (title, promptBuilder) => {
    try {
      const code = getActiveCode();
      if (!code.trim()) {
        toast.error('No code available to process');
        return;
      }

      setAiPanelTitle(title);
      setAiPanelOpen(true);
      setAiText('');
      setAiLoading(true);
      setAiActive(true);

      const response = await apiFetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspace?.id || null,
          model: selectedModel,
          messages: [{ role: 'user', content: promptBuilder(code) }]
        })
      });

      if (!response.ok || !response.body) {
        throw new Error('Failed to open AI stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let next = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              next += parsed.text;
              setAiText(next);
            }
          } catch {
            // Ignore malformed SSE payloads.
          }
        }
      }
    } catch (err) {
      toast.error(`AI action failed: ${err.message}`);
    } finally {
      setAiLoading(false);
      setAiActive(false);
    }
  }, [getActiveCode, selectedModel, setAiActive, workspace?.id]);

  // Copies current code content to clipboard.
  const handleCopy = useCallback(async () => {
    const text = getActiveCode();
    await navigator.clipboard.writeText(text);
    toast.success('Code copied to clipboard');
  }, [getActiveCode]);

  // Downloads current file content using language-aware extension.
  const handleDownload = useCallback(() => {
    const filename = fileName?.trim() || `untitled.${extensionForLanguage(language)}`;
    const blob = new Blob([content || ''], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.includes('.') ? filename : `${filename}.${extensionForLanguage(language)}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [content, fileName, language]);

  const options = useMemo(() => ({
    minimap: { enabled: false },
    lineNumbers: 'on',
    wordWrap: wordWrap ? 'on' : 'off',
    fontSize: 14,
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    automaticLayout: true,
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    formatOnPaste: true,
    scrollBeyondLastLine: false
  }), [wordWrap]);

  return (
    <div className="h-full flex">
      <div className="flex-1 flex flex-col glass-card overflow-hidden">
        <div style={{ padding: '8px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
          <select
            value={language}
            onChange={(e) => onLanguageChange?.(e.target.value)}
            style={{ fontSize: '12px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '4px', padding: '4px 8px', color: 'var(--text-primary)', outline: 'none' }}
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <button
            onClick={() => runAiAction('Explain Code', (code) => `Explain this code in detail and walk through logic, intent, and key sections:\n\n${code}`)}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-overlay)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'; }}
            style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            ✨ Explain Code
          </button>

          <button
            onClick={() => runAiAction('Find Bugs', (code) => `Review this code for bugs, logic errors, and improvements. Be specific about line numbers. Code: ${code}`)}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-overlay)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'; }}
            style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            🐛 Find Bugs
          </button>

          <button
            onClick={() => runAiAction('Add Comments', (code) => `Rewrite this code and add clear inline comments while preserving behavior:\n\n${code}`)}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-overlay)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'; }}
            style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            📝 Add Comments
          </button>

          <button
            onClick={() => runAiAction('Optimize Code', (code) => `Suggest an optimized version of this code and explain performance tradeoffs:\n\n${code}`)}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-overlay)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'; }}
            style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '4px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            ⚡ Optimize
          </button>

          <button
            onClick={handleCopy}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-overlay)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'; }}
            style={{ padding: '6px', borderRadius: '4px', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
            title="Copy"
          >
            <Copy size={14} />
          </button>

          <button
            onClick={handleDownload}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-overlay)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'; }}
            style={{ padding: '6px', borderRadius: '4px', backgroundColor: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
            title="Download"
          >
            <Download size={14} />
          </button>

          <button
            onClick={() => setWordWrap((w) => !w)}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-overlay)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = wordWrap ? 'var(--accent-subtle)' : 'var(--bg-elevated)'; }}
            style={{
              padding: '6px',
              borderRadius: '4px',
              backgroundColor: wordWrap ? 'var(--accent-subtle)' : 'var(--bg-elevated)',
              color: wordWrap ? 'var(--accent)' : 'var(--text-secondary)',
              border: `1px solid ${wordWrap ? 'var(--accent-border)' : 'var(--border-subtle)'}`
            }}
            title="Toggle wrap"
          >
            <WrapText size={14} />
          </button>

          <div style={{ marginLeft: 'auto', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '999px', border: aiLoading ? '1px solid var(--accent-border)' : '1px solid var(--border-subtle)', color: aiLoading ? 'var(--accent)' : 'var(--text-tertiary)' }} className={aiLoading ? 'amd-pulse' : ''}>
            <Zap size={12} /> ⚡ AMD Accelerated
          </div>
        </div>

        <div className="flex-1 no-transition" style={{ minHeight: '400px', height: editorHeight, width: '100%', overflow: 'hidden', position: 'relative', transform: 'none', animation: 'none' }}>
          <MonacoErrorBoundary
            fallback={(
              <div style={{ height: '100%', padding: '16px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '13px', overflow: 'auto' }}>
                Monaco editor failed to load. You can still edit this file below.
                <textarea
                  value={content || ''}
                  onChange={(e) => onContentChange?.(e.target.value)}
                  className="mt-3 w-full rounded p-3 outline-none"
                  style={{ backgroundColor: 'var(--bg-overlay)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', height: 'calc(100% - 48px)' }}
                />
              </div>
            )}
          >
            <Editor
              key="ryflow-monaco-stable"
              height="100%"
              language={language}
              value={content}
              path={fileName || `untitled.${extensionForLanguage(language)}`}
              theme={monacoThemeName}
              beforeMount={handleBeforeMount}
              onMount={handleEditorMount}
              options={options}
              onChange={(val) => onContentChange?.(val || '')}
            />
          </MonacoErrorBoundary>
        </div>
      </div>

      <AnimatePresence>
        {aiPanelOpen && (
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            style={{ width: '360px', marginLeft: '16px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '16px', overflow: 'auto' }}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 style={{ fontSize: '13px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MessageSquareText size={14} color="var(--accent)" /> {aiPanelTitle}
              </h3>
              <button
                onClick={() => setAiPanelOpen(false)}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
                style={{ color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <X size={14} />
              </button>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Zap size={10} className={aiLoading ? 'animate-pulse' : ''} /> Local inference
            </div>
            <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" }}>
              {aiText || (aiLoading ? 'Generating response...' : 'No response yet.')}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
