// Code editor workspace page with file list, save/load, and AI-augmented Monaco editor
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { Code2, FilePlus2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import CodeEditor, { detectLanguageFromFileName } from '../components/editor/CodeEditor';

const LANGUAGE_LABELS = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  rust: 'Rust',
  go: 'Go',
  html: 'HTML',
  css: 'CSS',
  sql: 'SQL',
  shell: 'Bash',
  json: 'JSON',
  markdown: 'Markdown'
};

// Derives language icon emoji from language type.
function iconForLanguage(language) {
  const map = {
    javascript: '🟨',
    typescript: '🟦',
    python: '🐍',
    java: '☕',
    cpp: '⚙️',
    c: '🔧',
    rust: '🦀',
    go: '🐹',
    html: '🌐',
    css: '🎨',
    sql: '🗃️',
    shell: '💻',
    json: '🧩',
    markdown: '📝'
  };
  return map[language] || '📄';
}

// Renders the full-page code editor workspace with file sidebar and save flow.
export default function CodeEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { workspace, user, setAiActive } = useStore();
  const [files, setFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState(null);

  // Fetches all saved code files for current workspace.
  const fetchFiles = useCallback(async () => {
    if (!workspace?.id) return;
    try {
      const res = await axios.get('/api/code/list', { params: { workspace_id: workspace.id } });
      setFiles(res.data.files || []);
    } catch (err) {
      setError('Failed to load code files');
    } finally {
      setLoading(false);
    }
  }, [workspace?.id]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Loads a selected code file by id and updates local editor state.
  const loadFile = useCallback(async (fileId) => {
    try {
      const res = await axios.get(`/api/code/${fileId}`);
      const file = res.data;
      setActiveFile(file);
      setLastSavedAt(file.updated_at || file.created_at || null);
      navigate(`/code/${file.id}`);
    } catch (err) {
      toast.error('Failed to load file');
    }
  }, [navigate]);

  useEffect(() => {
    if (!id || !files.length) return;
    if (activeFile?.id === id) return;
    loadFile(id);
  }, [id, files.length, activeFile?.id, loadFile]);

  // Creates a new in-memory code file draft.
  const createNewFile = useCallback(() => {
    const now = new Date().toISOString();
    setActiveFile({
      id: null,
      title: 'untitled.js',
      content: '',
      language: 'javascript',
      updated_at: now,
      created_at: now
    });
    setLastSavedAt(null);
    navigate('/code');
  }, [navigate]);

  // Saves active code file to backend and refreshes sidebar list.
  const saveActiveFile = useCallback(async () => {
    if (!workspace?.id || !activeFile) return;
    try {
      setSaving(true);
      setAiActive(true);
      const normalizedLanguage = activeFile.language || detectLanguageFromFileName(activeFile.title);
      const payload = {
        id: activeFile.id,
        workspace_id: workspace.id,
        title: activeFile.title || 'untitled.js',
        content: activeFile.content || '',
        language: normalizedLanguage,
        created_by: user?.id || null
      };
      const res = await axios.post('/api/code/save', payload);
      const saved = res.data;
      setActiveFile(saved);
      setLastSavedAt(saved.updated_at || saved.created_at || new Date().toISOString());
      await fetchFiles();
      if (saved.id) navigate(`/code/${saved.id}`);
      toast.success('Code file saved');
    } catch (err) {
      toast.error('Failed to save code file');
    } finally {
      setSaving(false);
      setAiActive(false);
    }
  }, [workspace?.id, activeFile, user?.id, fetchFiles, navigate, setAiActive]);

  // Updates local file title and infers language from extension when possible.
  const handleTitleChange = useCallback((title) => {
    setActiveFile((prev) => {
      if (!prev) return prev;
      const inferred = detectLanguageFromFileName(title);
      return { ...prev, title, language: inferred || prev.language };
    });
  }, []);

  // Updates local file content in editor state.
  const handleContentChange = useCallback((next) => {
    setActiveFile((prev) => (prev ? { ...prev, content: next } : prev));
  }, []);

  // Updates local file language from explicit selector change.
  const handleLanguageChange = useCallback((language) => {
    setActiveFile((prev) => (prev ? { ...prev, language } : prev));
  }, []);

  const languageBadge = useMemo(() => LANGUAGE_LABELS[activeFile?.language] || 'Unknown', [activeFile?.language]);

  return (
    <div className="h-full flex gap-4">
      <aside className="w-72 glass-card p-3 overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-amd-white">Code Files</h2>
          <button onClick={createNewFile} className="p-2 rounded-lg bg-amd-red/15 text-amd-red hover:bg-amd-red/25" title="New file">
            <FilePlus2 size={14} />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton-loader h-12 rounded" />)}
          </div>
        ) : files.length === 0 ? (
          <div className="text-xs text-amd-white/40">No code files yet. Create your first file.</div>
        ) : (
          <div className="space-y-2">
            {files.map((f) => (
              <button
                key={f.id}
                onClick={() => loadFile(f.id)}
                className={`w-full text-left p-2 rounded-lg border transition-colors ${activeFile?.id === f.id ? 'border-amd-red/40 bg-amd-red/10' : 'border-white/10 hover:border-white/20'}`}
              >
                <div className="text-sm text-amd-white truncate">{iconForLanguage(f.language)} {f.title}</div>
                <div className="text-[10px] text-amd-white/40 mt-1">{new Date(f.updated_at || f.created_at).toLocaleString()}</div>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="flex-1 flex flex-col gap-3">
        <div className="glass-card p-3 flex items-center gap-3">
          <input
            value={activeFile?.title || ''}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="File name"
            className="flex-1 bg-amd-gray/50 border border-white/10 rounded px-3 py-2 text-amd-white outline-none"
          />
          <span className="text-xs px-2 py-1 rounded-full border border-white/10 text-amd-white/70">{languageBadge}</span>
          <span className="text-xs text-amd-white/40">Last saved: {lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString() : 'Not saved yet'}</span>
          <button onClick={saveActiveFile} disabled={!activeFile || saving} className="px-3 py-2 rounded-lg bg-amd-red text-white disabled:opacity-50 flex items-center gap-2">
            <Save size={14} /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {!activeFile ? (
          <div className="flex-1 glass-card flex items-center justify-center text-amd-white/40">
            <div className="text-center">
              <Code2 size={32} className="mx-auto mb-2 text-amd-red/40" />
              Select a code file or create a new one.
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            <CodeEditor
              fileName={activeFile.title}
              language={activeFile.language || 'javascript'}
              content={activeFile.content || ''}
              onContentChange={handleContentChange}
              onLanguageChange={handleLanguageChange}
            />
          </div>
        )}

        {error && <div className="text-xs text-amd-orange">{error}</div>}
      </section>
    </div>
  );
}
