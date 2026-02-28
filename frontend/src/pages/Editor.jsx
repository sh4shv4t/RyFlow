// Editor page — Document listing and TipTap editor view
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, FileText, Trash2, Clock } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import RichEditor from '../components/editor/RichEditor';
import CollabPresence from '../components/editor/CollabPresence';

export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { workspace, user } = useStore();
  const [documents, setDocuments] = useState([]);
  const [currentDoc, setCurrentDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState('');

  // Fetch all documents
  const fetchDocuments = useCallback(async () => {
    if (!workspace) return;
    try {
      const res = await axios.get('/api/docs', {
        params: { workspace_id: workspace.id }
      });
      setDocuments(res.data.documents || []);
    } catch (err) {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

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
  }, [id, navigate]);

  // Creates a new document
  const createDocument = async () => {
    if (!workspace) return;
    try {
      const res = await axios.post('/api/docs', {
        workspace_id: workspace.id,
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
    <div className="flex h-full gap-4">
      {/* Document sidebar */}
      <div className="w-64 flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-semibold text-amd-white">Documents</h2>
          <span className="text-xs text-amd-white/40">{documents.length}</span>
        </div>

        {/* New document input */}
        <div className="flex gap-1 mb-3">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createDocument()}
            placeholder="New doc title..."
            className="flex-1 bg-amd-gray/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-amd-white placeholder:text-amd-white/30 outline-none focus:border-amd-red/50"
          />
          <button
            onClick={createDocument}
            className="p-2 rounded-lg bg-amd-red text-white hover:bg-amd-red/80"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-auto space-y-1">
          {loading ? (
            <>
              {[1, 2, 3].map(i => <div key={i} className="skeleton-loader h-12 w-full rounded-lg" />)}
            </>
          ) : documents.length === 0 ? (
            <div className="text-center py-8">
              <FileText size={24} className="text-amd-white/10 mx-auto mb-2" />
              <p className="text-xs text-amd-white/30">Create your first document</p>
            </div>
          ) : (
            documents.map((doc) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => navigate(`/editor/${doc.id}`)}
                className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all group ${
                  currentDoc?.id === doc.id
                    ? 'bg-amd-red/10 border border-amd-red/20'
                    : 'hover:bg-white/5'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-amd-white truncate">{doc.title}</p>
                  <p className="text-[10px] text-amd-white/30 flex items-center gap-1 mt-0.5">
                    <Clock size={8} />
                    {new Date(doc.updated_at || doc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={(e) => deleteDoc(doc.id, e)}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 text-amd-white/30 hover:text-amd-red transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex flex-col glass-card overflow-hidden">
        {currentDoc ? (
          <>
            {/* Doc header */}
            <div className="flex items-center justify-between p-3 border-b border-white/5">
              <input
                value={currentDoc.title}
                onChange={(e) => setCurrentDoc({ ...currentDoc, title: e.target.value })}
                onBlur={() => {
                  axios.put(`/api/docs/${currentDoc.id}`, { title: currentDoc.title }).catch(() => {});
                }}
                className="font-heading font-semibold text-amd-white bg-transparent outline-none text-lg"
              />
              <CollabPresence />
            </div>

            {/* TipTap editor */}
            <div className="flex-1 overflow-hidden relative">
              <RichEditor
                content={getEditorContent()}
                onSave={handleSave}
                docId={currentDoc.id}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <FileText size={48} className="text-amd-white/10 mb-4" />
            <h3 className="font-heading font-semibold text-amd-white/40 mb-2">No document selected</h3>
            <p className="text-sm text-amd-white/20">Select a document or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}
