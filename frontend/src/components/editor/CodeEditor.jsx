// Monaco-powered code editor with AI actions and AMD-themed toolbar
import React, { useCallback, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bug, Copy, Download, Languages, MessageSquareText, MessageSquareWarning, Sparkles, WrapText, X, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { apiFetch } from '../../utils/apiClient';

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
  const [wordWrap, setWordWrap] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiPanelTitle, setAiPanelTitle] = useState('AI Assistant');
  const [aiText, setAiText] = useState('');
  const { selectedModel, workspace, setAiActive } = useStore();

  const monacoThemeName = 'ryflow-dark';

  // Configures custom Monaco theme to match RyFlow colors.
  const handleBeforeMount = useCallback((monaco) => {
    monaco.editor.defineTheme(monacoThemeName, {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: '', foreground: 'F5F5F0', background: '1A1A1A' }
      ],
      colors: {
        'editor.background': '#1A1A1A',
        'editor.lineHighlightBackground': '#2C2C2C',
        'editor.selectionBackground': '#E8000D4D',
        'editorCursor.foreground': '#E8000D'
      }
    });
  }, []);

  // Stores Monaco instance after mount for selection-aware actions.
  const handleEditorMount = useCallback((editor) => {
    editorRef.current = editor;
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
        <div className="p-2 border-b border-white/10 bg-amd-gray/40 flex flex-wrap items-center gap-2">
          <select
            value={language}
            onChange={(e) => onLanguageChange?.(e.target.value)}
            className="text-xs bg-amd-gray border border-white/10 rounded px-2 py-1 text-amd-white outline-none"
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <button
            onClick={() => runAiAction('Explain Code', (code) => `Explain this code in detail and walk through logic, intent, and key sections:\n\n${code}`)}
            className="px-2 py-1 text-xs rounded bg-amd-red/15 text-amd-red hover:bg-amd-red/25"
          >
            ✨ Explain Code
          </button>

          <button
            onClick={() => runAiAction('Find Bugs', (code) => `Review this code for bugs, logic errors, and improvements. Be specific about line numbers. Code: ${code}`)}
            className="px-2 py-1 text-xs rounded bg-amd-orange/15 text-amd-orange hover:bg-amd-orange/25"
          >
            🐛 Find Bugs
          </button>

          <button
            onClick={() => runAiAction('Add Comments', (code) => `Rewrite this code and add clear inline comments while preserving behavior:\n\n${code}`)}
            className="px-2 py-1 text-xs rounded bg-white/10 text-amd-white hover:bg-white/20"
          >
            📝 Add Comments
          </button>

          <button
            onClick={() => runAiAction('Optimize Code', (code) => `Suggest an optimized version of this code and explain performance tradeoffs:\n\n${code}`)}
            className="px-2 py-1 text-xs rounded bg-white/10 text-amd-white hover:bg-white/20"
          >
            ⚡ Optimize
          </button>

          <button onClick={handleCopy} className="p-1.5 rounded bg-white/10 text-amd-white hover:bg-white/20" title="Copy">
            <Copy size={14} />
          </button>

          <button onClick={handleDownload} className="p-1.5 rounded bg-white/10 text-amd-white hover:bg-white/20" title="Download">
            <Download size={14} />
          </button>

          <button
            onClick={() => setWordWrap((w) => !w)}
            className={`p-1.5 rounded ${wordWrap ? 'bg-amd-red/15 text-amd-red' : 'bg-white/10 text-amd-white'} hover:bg-white/20`}
            title="Toggle wrap"
          >
            <WrapText size={14} />
          </button>

          <div className={`ml-auto text-xs flex items-center gap-1 px-2 py-1 rounded-full border ${aiLoading ? 'amd-pulse border-amd-red/40 text-amd-red' : 'border-amd-red/20 text-amd-red/70'}`}>
            <Zap size={12} /> ⚡ AMD Accelerated
          </div>
        </div>

        <div className="flex-1">
          <Editor
            height="100%"
            language={language}
            value={content}
            theme={monacoThemeName}
            beforeMount={handleBeforeMount}
            onMount={handleEditorMount}
            options={options}
            onChange={(val) => onContentChange?.(val || '')}
          />
        </div>
      </div>

      <AnimatePresence>
        {aiPanelOpen && (
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            className="w-[360px] ml-4 glass-card p-4 overflow-auto"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-heading text-amd-white text-sm flex items-center gap-2">
                <MessageSquareText size={14} className="text-amd-red" /> {aiPanelTitle}
              </h3>
              <button onClick={() => setAiPanelOpen(false)} className="text-amd-white/50 hover:text-amd-white">
                <X size={14} />
              </button>
            </div>
            <div className="text-xs text-amd-red/70 mb-3 flex items-center gap-1">
              <Zap size={10} className={aiLoading ? 'animate-pulse' : ''} /> Local inference
            </div>
            <pre className="text-xs whitespace-pre-wrap text-amd-white/80 font-mono">
              {aiText || (aiLoading ? 'Generating response...' : 'No response yet.')}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
