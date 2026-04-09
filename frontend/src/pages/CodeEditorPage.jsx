// Code editor workspace page with file list, save/load, and AI-augmented Monaco editor
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { Code2, FilePlus2, Save, Link as LinkIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import CodeEditor, { detectLanguageFromFileName } from '../components/editor/CodeEditor';
import BacklinksPanel from '../components/editor/BacklinksPanel';
import {
  CodeFileRowSkeleton,
  ListSkeleton
} from '../components/shared/Skeleton';
import { waitForMinimumLoading } from '../utils/loadingDelay';

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
  const { workspace, workspaceId, user, setAiActive } = useStore();
  const [files, setFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [isLoadingFiles, setIsLoadingFiles] =
    useState(true);
  const [saving, setSaving] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [codeNodeId, setCodeNodeId] = useState(null);
  const [backlinks, setBacklinks] = useState({ incoming: [], outgoing: [], total: 0 });
  const [backlinksOpen, setBacklinksOpen] = useState(false);
  const [backlinksLoading, setBacklinksLoading] = useState(false);
  const loadingRef = useRef(false);
  const activeFileRef = useRef(null);

  const resolveWorkspaceId = useCallback(() => {
    return workspaceId || workspace?.id || localStorage.getItem('ryflow_workspace_id') || null;
  }, [workspaceId, workspace?.id]);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  // Fetches all saved code files for current workspace.
  const fetchFiles = useCallback(async () => {
    const activeWorkspaceId = resolveWorkspaceId();
    if (!activeWorkspaceId) {
      setFiles([]);
      setIsLoadingFiles(false);
      return;
    }
    const startedAt = Date.now();
    setIsLoadingFiles(true);
    try {
      const res = await axios.get('/api/code/list', { params: { workspace_id: activeWorkspaceId } });
      setFiles(res.data.files || []);
    } catch (err) {
      setError('Failed to load code files');
    } finally {
      await waitForMinimumLoading(startedAt);
      setIsLoadingFiles(false);
    }
  }, [resolveWorkspaceId]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Loads a selected code file by id and updates local editor state.
  const loadFile = useCallback(async (fileId) => {
    if (!fileId) return;
    if (loadingRef.current) return;
    if (fileId === activeFileRef.current?.id) return;

    loadingRef.current = true;
    setIsFileLoading(true);

    try {
      const res = await axios.get(`/api/code/${fileId}`);
      const file = res.data;
      setActiveFile(file);
      activeFileRef.current = file;
      setLastSavedAt(file.updated_at || file.created_at || null);
      navigate(`/code/${file.id}`);

      const activeWorkspaceId = resolveWorkspaceId();
      if (activeWorkspaceId) {
        const nodesRes = await axios.get('/api/graph/nodes', { params: { workspace_id: activeWorkspaceId, all: 1 } });
        const node = (nodesRes.data.nodes || []).find((n) => n.type === 'code' && n.source_id === file.id);
        setCodeNodeId(node?.id || null);
      }
    } catch (err) {
      toast.error('Failed to load file');
    } finally {
      setIsFileLoading(false);
      loadingRef.current = false;
    }
  }, [navigate, resolveWorkspaceId]);

  // Loads backlinks for current code graph node.
  const loadBacklinks = useCallback(async () => {
    if (!codeNodeId) {
      setBacklinks({ incoming: [], outgoing: [], total: 0 });
      return;
    }
    setBacklinksLoading(true);
    try {
      const res = await axios.get(`/api/graph/backlinks/${codeNodeId}`);
      setBacklinks(res.data || { incoming: [], outgoing: [], total: 0 });
    } catch {
      setBacklinks({ incoming: [], outgoing: [], total: 0 });
    } finally {
      setBacklinksLoading(false);
    }
  }, [codeNodeId]);

  useEffect(() => {
    loadBacklinks();
  }, [loadBacklinks]);

  useEffect(() => {
    if (!id) return;
    if (activeFile?.id === id) return;
    loadFile(id);
  }, [id, activeFile?.id, loadFile]);

  // Creates a new in-memory code file draft.
  const createNewFile = useCallback(() => {
    loadingRef.current = false;
    setIsFileLoading(false);
    const now = new Date().toISOString();
    setActiveFile({
      id: null,
      title: 'untitled.js',
      content: '',
      language: 'javascript',
      updated_at: now,
      created_at: now
    });
    activeFileRef.current = {
      id: null,
      title: 'untitled.js',
      content: '',
      language: 'javascript',
      updated_at: now,
      created_at: now
    };
    setCodeNodeId(null);
    setLastSavedAt(null);
    navigate('/code');
  }, [navigate]);

  // Saves active code file to backend and refreshes sidebar list.
  const saveActiveFile = useCallback(async () => {
    const snapshot = activeFileRef.current;
    const activeWorkspaceId = resolveWorkspaceId();
    if (!activeWorkspaceId || !snapshot) return;
    try {
      setSaving(true);
      setAiActive(true);
      const normalizedLanguage = snapshot.language || detectLanguageFromFileName(snapshot.title);
      const payload = {
        id: snapshot.id,
        workspace_id: activeWorkspaceId,
        title: snapshot.title || 'untitled.js',
        content: snapshot.content || '',
        language: normalizedLanguage,
        created_by: user?.id || null
      };
      const res = await axios.post('/api/code/save', payload);
      const saved = res.data;
      setActiveFile(saved);
      activeFileRef.current = saved;
      setLastSavedAt(saved.updated_at || saved.created_at || new Date().toISOString());
      await fetchFiles();
      if (saved.id) navigate(`/code/${saved.id}`);
      if (activeWorkspaceId) {
        const nodesRes = await axios.get('/api/graph/nodes', { params: { workspace_id: activeWorkspaceId, all: 1 } });
        const node = (nodesRes.data.nodes || []).find((n) => n.type === 'code' && n.source_id === saved.id);
        setCodeNodeId(node?.id || null);
      }
      loadBacklinks();
      toast.success('Code file saved');
    } catch (err) {
      toast.error('Failed to save code file');
    } finally {
      setSaving(false);
      setAiActive(false);
    }
  }, [resolveWorkspaceId, user?.id, fetchFiles, navigate, setAiActive, loadBacklinks]);

  // Updates local file title and infers language from extension when possible.
  const handleTitleChange = useCallback((title) => {
    setActiveFile((prev) => {
      if (!prev) return prev;
      const inferred = detectLanguageFromFileName(title);
      const next = { ...prev, title, language: inferred || prev.language };
      activeFileRef.current = next;
      return next;
    });
  }, []);

  // Updates local file content in editor state.
  const handleContentChange = useCallback((next) => {
    setActiveFile((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, content: next };
      activeFileRef.current = updated;
      return updated;
    });
  }, []);

  // Updates local file language from explicit selector change.
  const handleLanguageChange = useCallback((language) => {
    setActiveFile((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, language };
      activeFileRef.current = updated;
      return updated;
    });
  }, []);

  const languageBadge = useMemo(() => LANGUAGE_LABELS[activeFile?.language] || 'Unknown', [activeFile?.language]);

  return (
    <div style={{ backgroundColor: '#111111', height: '100%', display: 'flex' }}>
      <aside style={{ width: '260px', minWidth: '260px', borderRight: '1px solid #242424', padding: '12px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666' }}>Code Files</p>
          <button onClick={createNewFile} style={{ width: '28px', height: '28px', borderRadius: '4px', border: '1px solid #333333', backgroundColor: '#1A1A1A', color: '#999999', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="New file">
            <FilePlus2 size={14} />
          </button>
        </div>

        {isLoadingFiles ? (
          <ListSkeleton
            rows={6}
            RowComponent={CodeFileRowSkeleton}
          />
        ) : files.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#666666' }}>No code files yet. Create your first file.</div>
        ) : (
          <div style={{ display: 'grid', gap: '6px' }}>
            {files.map((f) => (
              <button
                key={f.id}
                onClick={() => loadFile(f.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px',
                  borderRadius: '6px',
                  border: activeFile?.id === f.id ? '1px solid rgba(232,0,13,0.3)' : '1px solid #333333',
                  backgroundColor: activeFile?.id === f.id ? 'rgba(232,0,13,0.08)' : '#1A1A1A',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '13px', color: '#F0F0F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{iconForLanguage(f.language)} {f.title}</div>
                <div style={{ fontSize: '10px', color: '#666666', marginTop: '2px' }}>{new Date(f.updated_at || f.created_at).toLocaleString()}</div>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: '48px', backgroundColor: '#1A1A1A', borderBottom: '1px solid #242424', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            value={activeFile?.title || ''}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="File name"
            style={{ backgroundColor: 'transparent', border: 'none', fontSize: '14px', fontWeight: '500', color: '#F0F0F0', flex: 1 }}
          />
          <span style={{ backgroundColor: '#222222', border: '1px solid #333333', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', color: '#999999' }}>{languageBadge}</span>
          <button onClick={() => { setBacklinksOpen((v) => !v); loadBacklinks(); }} style={{ height: '28px', borderRadius: '4px', border: '1px solid #333333', backgroundColor: '#1A1A1A', color: '#999999', padding: '0 8px', fontSize: '11px', cursor: 'pointer', position: 'relative' }}>
            <LinkIcon size={12} style={{ display: 'inline', marginRight: '4px' }} /> Backlinks
            {Number(backlinks.total || 0) > 0 ? <span style={{ marginLeft: '4px', display: 'inline-flex', minWidth: '14px', height: '14px', alignItems: 'center', justifyContent: 'center', borderRadius: '999px', backgroundColor: '#E8000D', color: '#FFFFFF', fontSize: '10px', padding: '0 4px' }}>{backlinks.total}</span> : null}
          </button>
          <span style={{ fontSize: '11px', color: '#666666' }}>Last saved: {lastSavedAt ? new Date(lastSavedAt).toLocaleTimeString() : 'Not saved yet'}</span>
          <button onClick={saveActiveFile} disabled={!activeFile || saving} style={{ height: '30px', padding: '0 12px', backgroundColor: '#E8000D', color: '#FFFFFF', fontSize: '13px', fontWeight: '500', border: 'none', borderRadius: '6px', cursor: !activeFile || saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !activeFile || saving ? 0.6 : 1 }}>
            <Save size={14} /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {!activeFile ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666666' }}>
            <div className="text-center">
              <Code2 size={32} className="mx-auto mb-2 text-amd-red/40" />
              Select a code file or create a new one.
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', position: 'relative', height: 'calc(100vh - 96px)' }}>
            <CodeEditor
              fileName={activeFile.title}
              language={activeFile.language || 'javascript'}
              content={activeFile.content || ''}
              onContentChange={handleContentChange}
              onLanguageChange={handleLanguageChange}
            />
            {isFileLoading && (
              <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(17,17,17,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999999', fontSize: '13px', zIndex: 5 }}>
                Loading file...
              </div>
            )}
            <BacklinksPanel
              open={backlinksOpen}
              loading={backlinksLoading}
              backlinks={backlinks}
              onClose={() => setBacklinksOpen(false)}
              onOpenNode={(entry) => {
                const sid = entry?.source_id;
                if (!sid) return;
                if (entry.type === 'doc') window.location.href = `/editor/${sid}`;
                else if (entry.type === 'task') window.location.href = '/tasks';
                else if (entry.type === 'code') window.location.href = `/code/${sid}`;
                else if (entry.type === 'canvas') window.location.href = `/canvas/${sid}`;
              }}
            />
          </div>
        )}

        {error && <div style={{ fontSize: '12px', color: '#B85C00', padding: '8px 16px' }}>{error}</div>}
      </section>
    </div>
  );
}
