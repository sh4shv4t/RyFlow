// Canvas workspace page with sidebar list, save/load flow, and Excalidraw integration
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { Plus, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import RyCanvas from '../components/canvas/RyCanvas';
import TagPicker from '../components/common/TagPicker';

// Renders the full-page canvas workspace with saved-canvas sidebar.
export default function CanvasPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { workspace, user } = useStore();
  const [canvases, setCanvases] = useState([]);
  const [activeCanvas, setActiveCanvas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Idle');
  const [canvasTags, setCanvasTags] = useState([]);

  // Fetches saved canvas list for the active workspace.
  const fetchCanvases = useCallback(async () => {
    if (!workspace?.id) return;
    try {
      const res = await axios.get('/api/canvas/list', { params: { workspace_id: workspace.id } });
      setCanvases(res.data.canvases || []);
    } catch (err) {
      toast.error('Failed to load canvases');
    } finally {
      setLoading(false);
    }
  }, [workspace?.id]);

  useEffect(() => {
    fetchCanvases();
  }, [fetchCanvases]);

  // Loads a single canvas by id and normalizes parsed JSON fields.
  const loadCanvas = useCallback(async (canvasId) => {
    try {
      const res = await axios.get(`/api/canvas/${canvasId}`);
      const c = res.data;
      setActiveCanvas({
        ...c,
        elements: JSON.parse(c.elements || '[]'),
        app_state: JSON.parse(c.app_state || '{}')
      });
      if (workspace?.id) {
        const tagsRes = await axios.get('/api/tags/by-source', {
          params: { workspace_id: workspace.id, type: 'canvas', source_id: c.id }
        });
        setCanvasTags(tagsRes.data.tags || []);
      }
      navigate(`/canvas/${c.id}`);
    } catch (err) {
      toast.error('Failed to load canvas');
    }
  }, [navigate, workspace?.id]);

  useEffect(() => {
    if (!id || activeCanvas?.id === id) return;
    loadCanvas(id);
  }, [id, activeCanvas?.id, loadCanvas]);

  // Creates a new blank canvas session in memory.
  const createCanvas = useCallback(() => {
    setActiveCanvas({
      id: null,
      title: `Canvas ${new Date().toLocaleTimeString()}`,
      elements: [],
      app_state: {}
    });
    navigate('/canvas');
  }, [navigate]);

  // Persists the active canvas to backend and refreshes sidebar list.
  const saveCanvas = useCallback(async ({ elements, appState }) => {
    if (!workspace?.id || !activeCanvas) return;

    try {
      setSaving(true);
      setSaveStatus('Saving...');
      const payload = {
        id: activeCanvas.id,
        workspace_id: workspace.id,
        title: activeCanvas.title || 'Untitled Canvas',
        elements: JSON.stringify(elements || []),
        app_state: JSON.stringify(appState || {}),
        thumbnail: null,
        created_by: user?.id || null
      };
      const res = await axios.post('/api/canvas/save', payload);
      const saved = res.data;
      setActiveCanvas({
        ...saved,
        elements: JSON.parse(saved.elements || '[]'),
        app_state: JSON.parse(saved.app_state || '{}')
      });
      setSaveStatus('Saved');
      if (workspace?.id && saved.id) {
        await axios.post('/api/tags/by-source', {
          workspace_id: workspace.id,
          type: 'canvas',
          source_id: saved.id,
          tag_ids: canvasTags.map((t) => t.id || t)
        });
      }
      await fetchCanvases();
      if (saved.id) navigate(`/canvas/${saved.id}`);
      toast.success('Canvas saved');
    } catch (err) {
      setSaveStatus('Save failed');
      toast.error('Failed to save canvas');
    } finally {
      setSaving(false);
    }
  }, [activeCanvas, fetchCanvases, navigate, user?.id, workspace?.id, canvasTags]);

  const saveTags = async (nextTags) => {
    setCanvasTags(nextTags);
    if (!workspace?.id || !activeCanvas?.id) return;
    try {
      await axios.post('/api/tags/by-source', {
        workspace_id: workspace.id,
        type: 'canvas',
        source_id: activeCanvas.id,
        tag_ids: nextTags.map((t) => t.id || t)
      });
    } catch {
      toast.error('Failed to save canvas tags');
    }
  };

  // Updates active canvas title in local state.
  const handleTitleChange = useCallback((title) => {
    setActiveCanvas((prev) => (prev ? { ...prev, title } : prev));
  }, []);

  const collaborators = useMemo(() => [user?.name || 'You'], [user?.name]);

  return (
    <div className="h-full flex gap-4">
      <aside className="w-72 glass-card p-3 overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-amd-white">Canvases</h2>
          <button onClick={createCanvas} className="p-2 rounded bg-amd-red/15 text-amd-red hover:bg-amd-red/25">
            <Plus size={14} />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="skeleton-loader h-12 rounded" />)}</div>
        ) : canvases.length === 0 ? (
          <div className="text-xs text-amd-white/40">No saved canvases yet.</div>
        ) : (
          <div className="space-y-2">
            {canvases.map((c) => (
              <button
                key={c.id}
                onClick={() => loadCanvas(c.id)}
                className={`w-full text-left p-2 rounded-lg border transition-colors ${activeCanvas?.id === c.id ? 'border-amd-red/40 bg-amd-red/10' : 'border-white/10 hover:border-white/20'}`}
              >
                <div className="text-sm text-amd-white truncate">🧭 {c.title}</div>
                <div className="text-[10px] text-amd-white/40 mt-1">{new Date(c.updated_at || c.created_at).toLocaleString()}</div>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="flex-1 flex flex-col gap-3 min-h-0">
        <div className="glass-card p-3 flex items-center gap-3">
          <div className="font-heading text-amd-white">{activeCanvas?.title || 'Untitled Canvas'}</div>
          <div className="text-xs text-amd-white/40">{saveStatus}</div>
          <div className="text-xs text-amd-white/40">Collaborators: {collaborators.join(', ')}</div>
          <button
            onClick={() => saveCanvas({ elements: activeCanvas?.elements || [], appState: activeCanvas?.app_state || {} })}
            disabled={!activeCanvas || saving}
            className="ml-auto px-3 py-2 rounded-lg bg-amd-red text-white disabled:opacity-50 flex items-center gap-1"
          >
            <Save size={14} /> Save
          </button>
        </div>

        {activeCanvas && <TagPicker value={canvasTags} onChange={saveTags} compact />}

        {!activeCanvas ? (
          <div className="flex-1 glass-card flex items-center justify-center text-amd-white/40">Create or select a canvas.</div>
        ) : (
          <div className="flex-1 min-h-0">
            <RyCanvas
              canvasId={activeCanvas.id}
              title={activeCanvas.title || ''}
              elements={activeCanvas.elements || []}
              appState={activeCanvas.app_state || {}}
              onTitleChange={handleTitleChange}
              onSave={saveCanvas}
            />
          </div>
        )}
      </section>
    </div>
  );
}
