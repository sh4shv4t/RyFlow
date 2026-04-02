// Editor page — Document listing and TipTap editor view
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, FileText, Trash2, Clock, CalendarDays, History } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import RichEditor from '../components/editor/RichEditor';
import CollabPresence from '../components/editor/CollabPresence';
import HistoryPanel from '../components/editor/HistoryPanel';

export default function Editor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { workspace, workspaceId, user } = useStore();
  const [documents, setDocuments] = useState([]);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [templates, setTemplates] = useState([]);

  const resolveWorkspaceId = useCallback(() => {
    return workspaceId || workspace?.id || localStorage.getItem('ryflow_workspace_id') || null;
  }, [workspaceId, workspace?.id]);

  // Fetch all documents
  const fetchDocuments = useCallback(async () => {
    const activeWorkspaceId = resolveWorkspaceId();
    if (!activeWorkspaceId) return;
    try {
      const res = await axios.get('/api/docs', {
        params: { workspace_id: activeWorkspaceId }
      });
      setDocuments(res.data.documents || []);
    } catch (err) {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [resolveWorkspaceId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    if (!workspace?.id) return;
    axios.get('/api/templates', { params: { workspace_id: workspace.id, type: 'document' } })
      .then((res) => setTemplates(res.data.templates || []))
      .catch(() => setTemplates([]));
  }, [workspace?.id]);

  const openDailyNote = useCallback(async () => {
    const activeWorkspaceId = resolveWorkspaceId();
    if (!activeWorkspaceId) {
      toast.error('No active workspace');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    const res = await axios.get('/api/docs/daily', {
      params: { workspace_id: activeWorkspaceId, date: today, created_by: user?.id || null }
    });
    navigate(`/editor/${res.data.id}`);
  }, [resolveWorkspaceId, user?.id, navigate]);

  useEffect(() => {
    if (searchParams.get('daily') === 'today') {
      openDailyNote().catch(() => {
        toast.error('Failed to open daily note');
      });
    }
  }, [searchParams, openDailyNote]);

  // Load specific document if ID in URL
  useEffect(() => {
    if (id) {
      const fetchDoc = async () => {
        try {
          const res = await axios.get(`/api/docs/${id}`);
          setCurrentDoc(res.data);
        } catch {
          toast.error('Document not found');
          navigate('/editor');
        }
      };
      fetchDoc();
    } else {
      setCurrentDoc(null);
    }
  }, [id, navigate, workspace?.id]);

  // Creates a new document
  const createDocument = async () => {
    const activeWorkspaceId = resolveWorkspaceId();
    if (!activeWorkspaceId) {
      toast.error('No active workspace');
      return;
    }
    try {
      const res = await axios.post('/api/docs', {
        workspace_id: activeWorkspaceId,
        title: newTitle || 'Untitled Document',
        content: '',
        created_by: user?.id
      });
      setNewTitle('');
      await fetchDocuments();
      navigate(`/editor/${res.data.id}`);
      toast.success('Document created');
    } catch (err) {
      toast.error('Failed to create document');
    }
  };

  const createFromTemplate = async (template) => {
    const activeWorkspaceId = resolveWorkspaceId();
    if (!activeWorkspaceId || !template) return;
    try {
      const res = await axios.post('/api/docs', {
        workspace_id: activeWorkspaceId,
        title: template.name,
        content: template.content,
        created_by: user?.id
      });
      await fetchDocuments();
      navigate(`/editor/${res.data.id}`);
    } catch {
      toast.error('Failed to create from template');
    }
  };

  // Keeps current document title and sidebar list in sync while typing.
  const handleTitleChange = (nextTitle) => {
    setCurrentDoc((prev) => {
      if (!prev) return prev;
      return { ...prev, title: nextTitle };
    });
    setDocuments((prev) => prev.map((d) => (
      d.id === currentDoc?.id ? { ...d, title: nextTitle } : d
    )));
  };

  // Persists title edits and reconciles local list with server response.
  const handleTitleBlur = async () => {
    if (!currentDoc) return;
    try {
      const res = await axios.put(`/api/docs/${currentDoc.id}`, { title: currentDoc.title });
      const saved = res.data;
      setCurrentDoc(saved);
      setDocuments((prev) => prev.map((d) => (d.id === saved.id ? { ...d, ...saved } : d)));
    } catch {
      toast.error('Failed to rename document');
    }
  };

  // Saves document content
  const handleSave = useCallback(async (jsonContent, textContent) => {
    if (!currentDoc) return;
    try {
      await axios.put(`/api/docs/${currentDoc.id}`, {
        title: currentDoc.title,
        content: JSON.stringify(jsonContent)
      });
    } catch (err) {
      toast.error('Auto-save failed');
    }
  }, [currentDoc]);

  // Deletes a document
  const deleteDoc = async (docId, e) => {
    e.stopPropagation();
    try {
      await axios.delete(`/api/docs/${docId}`);
      await fetchDocuments();
      if (currentDoc?.id === docId) {
        setCurrentDoc(null);
        navigate('/editor');
      }
      toast.success('Document deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  // Parse stored content
  const getEditorContent = () => {
    if (!currentDoc?.content) return '';
    try {
      return JSON.parse(currentDoc.content);
    } catch {
      return currentDoc.content;
    }
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        backgroundColor: '#111111',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          width: '260px',
          minWidth: '260px',
          borderRight: '1px solid #242424',
          padding: '16px 12px',
          overflowY: 'auto'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666' }}>
            Documents
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#666666' }}>{documents.length}</span>
            <button
              onClick={openDailyNote}
              style={{
                fontSize: '11px',
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #333333',
                backgroundColor: '#1A1A1A',
                color: '#999999',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer'
              }}
            >
              <CalendarDays size={12} /> Today
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createDocument()}
            placeholder="New doc title..."
            style={{
              flex: 1,
              height: '34px',
              backgroundColor: '#1A1A1A',
              border: '1px solid #333333',
              borderRadius: '6px',
              padding: '0 10px',
              fontSize: '12px',
              color: '#F0F0F0'
            }}
          />
          <button
            onClick={createDocument}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#E8000D',
              color: '#FFFFFF',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Plus size={14} />
          </button>
        </div>

        {templates.length > 0 && (
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', marginBottom: '6px' }}>Templates</div>
            <div style={{ display: 'grid', gap: '4px' }}>
              {templates.slice(0, 4).map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => createFromTemplate(tpl)}
                  style={{
                    textAlign: 'left',
                    fontSize: '12px',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: '1px solid #333333',
                    backgroundColor: '#1A1A1A',
                    color: '#999999',
                    cursor: 'pointer'
                  }}
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {loading ? (
            <>
              {[1, 2, 3].map(i => <div key={i} style={{ height: '44px', width: '100%', borderRadius: '6px', backgroundColor: '#1A1A1A', border: '1px solid #333333' }} />)}
            </>
          ) : documents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 8px' }}>
              <FileText size={20} color="#666666" style={{ margin: '0 auto 6px' }} />
              <p style={{ fontSize: '12px', color: '#666666' }}>Create your first document</p>
            </div>
          ) : (
            documents.map((doc) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => navigate(`/editor/${doc.id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  backgroundColor: currentDoc?.id === doc.id ? 'rgba(232,0,13,0.1)' : 'transparent',
                  border: currentDoc?.id === doc.id ? '1px solid rgba(232,0,13,0.3)' : '1px solid transparent'
                }}
              >
                <div className="min-w-0 flex-1">
                  <p style={{ fontSize: '13px', color: '#F0F0F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title}</p>
                  {doc.is_daily_note ? <p style={{ fontSize: '10px', color: '#B85C00' }}>Daily Note</p> : null}
                  <p style={{ fontSize: '10px', color: '#666666', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <Clock size={8} />
                    {new Date(doc.updated_at || doc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={(e) => deleteDoc(doc.id, e)}
                  style={{
                    padding: '4px',
                    borderRadius: '4px',
                    border: 'none',
                    background: 'transparent',
                    color: '#666666',
                    cursor: 'pointer'
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </motion.div>
            ))
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#111111', overflow: 'hidden' }}>
        {currentDoc ? (
          <>
            <input
              value={currentDoc.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              onBlur={handleTitleBlur}
              placeholder="Untitled"
              style={{
                width: '100%',
                fontSize: '20px',
                fontWeight: '600',
                color: '#F0F0F0',
                backgroundColor: 'transparent',
                border: 'none',
                padding: '24px 40px 8px',
                fontFamily: 'Inter, sans-serif'
              }}
            />

            <div style={{ display: 'flex', gap: '6px', padding: '6px 40px', borderBottom: '1px solid #242424', backgroundColor: '#1A1A1A', flexShrink: 0, alignItems: 'center' }}>
              <button
                onClick={() => setShowHistory((prev) => !prev)}
                style={{
                  height: '26px',
                  borderRadius: '4px',
                  border: '1px solid #333333',
                  backgroundColor: '#222222',
                  color: '#999999',
                  fontSize: '11px',
                  padding: '0 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <History size={12} /> History
              </button>
              <CollabPresence connected={false} presenceList={[]} />
            </div>

            <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex' }}>
              <RichEditor
                key={currentDoc.id}
                content={getEditorContent()}
                onSave={handleSave}
                docId={currentDoc.id}
                collabDoc={null}
              />
              {showHistory && (
                <HistoryPanel
                  docId={currentDoc.id}
                  onRestored={async () => {
                    const refreshed = await axios.get(`/api/docs/${currentDoc.id}`);
                    setCurrentDoc(refreshed.data);
                    fetchDocuments();
                  }}
                />
              )}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <FileText size={42} color="#333333" style={{ marginBottom: '8px' }} />
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#999999', marginBottom: '4px' }}>No document selected</h3>
            <p style={{ fontSize: '13px', color: '#666666' }}>Select a document or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}
