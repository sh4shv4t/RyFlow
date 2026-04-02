// Canvas workspace page with sidebar list, save/load flow, and Excalidraw integration
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { Plus, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import RyCanvas from '../components/canvas/RyCanvas';

function parseMaybeJSON(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

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
  const latestSceneRef = useRef({ elements: [], appState: {} });

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
        elements: parseMaybeJSON(c.elements, []),
        app_state: parseMaybeJSON(c.app_state, {})
      });
      latestSceneRef.current = {
        elements: parseMaybeJSON(c.elements, []),
        appState: parseMaybeJSON(c.app_state, {})
      };
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
    latestSceneRef.current = { elements: [], appState: {} };
    navigate('/canvas');
  }, [navigate]);

  // Persists the active canvas to backend and supports silent autosave.
  const saveCanvas = useCallback(async ({ elements, appState }, options = {}) => {
    if (!workspace?.id || !activeCanvas) return;
    const silent = Boolean(options.silent);

    try {
      if (!silent) {
        setSaving(true);
        setSaveStatus('Saving...');
      } else {
        setSaveStatus('Auto-saving...');
      }

      const payload = {
        id: activeCanvas.id,
        workspace_id: workspace.id,
        title: activeCanvas.title || 'Untitled Canvas',
        elements: elements || [],
        app_state: appState || {},
        thumbnail: null,
        created_by: user?.id || null
      };
      const res = await axios.post('/api/canvas/save', payload, { timeout: 20000 });
      const saved = res.data;
      setActiveCanvas({
        ...saved,
        elements: parseMaybeJSON(saved.elements, []),
        app_state: parseMaybeJSON(saved.app_state, {})
      });

      setCanvases((prev) => {
        const nextItem = {
          id: saved.id,
          workspace_id: saved.workspace_id,
          title: saved.title,
          thumbnail: saved.thumbnail,
          created_by: saved.created_by,
          updated_at: saved.updated_at,
          created_at: saved.created_at
        };
        const filtered = prev.filter((c) => c.id !== saved.id);
        return [nextItem, ...filtered];
      });

      setSaveStatus(silent ? 'Auto-saved' : 'Saved');
      if (saved.id && saved.id !== activeCanvas.id) {
        navigate(`/canvas/${saved.id}`);
      }
      if (!silent) {
        toast.success('Canvas saved');
      }
    } catch (err) {
      setSaveStatus(silent ? 'Auto-save failed' : 'Save failed');
      if (!silent) {
        toast.error('Failed to save canvas');
      }
    } finally {
      if (!silent) {
        setSaving(false);
      }
    }
  }, [activeCanvas, navigate, user?.id, workspace?.id]);

  // Updates active canvas title in local state.
  const handleTitleChange = useCallback((title) => {
    setActiveCanvas((prev) => (prev ? { ...prev, title } : prev));
  }, []);

  const collaborators = useMemo(() => [user?.name || 'You'], [user?.name]);

  return (
    <div style={{ backgroundColor: '#111111', height: '100%', display: 'flex' }}>
      <aside style={{ width: '260px', minWidth: '260px', borderRight: '1px solid #242424', padding: '12px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666' }}>Canvases</p>
          <button onClick={createCanvas} style={{ width: '28px', height: '28px', borderRadius: '4px', border: '1px solid #333333', backgroundColor: '#1A1A1A', color: '#999999', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={14} />
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gap: '6px' }}>{[1, 2, 3].map((i) => <div key={i} style={{ height: '44px', borderRadius: '6px', backgroundColor: '#1A1A1A', border: '1px solid #333333' }} />)}</div>
        ) : canvases.length === 0 ? (
          <div style={{ fontSize: '12px', color: '#666666' }}>No saved canvases yet.</div>
        ) : (
          <div style={{ display: 'grid', gap: '6px' }}>
            {canvases.map((c) => (
              <button
                key={c.id}
                onClick={() => loadCanvas(c.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px',
                  borderRadius: '6px',
                  border: activeCanvas?.id === c.id ? '1px solid rgba(232,0,13,0.3)' : '1px solid #333333',
                  backgroundColor: activeCanvas?.id === c.id ? 'rgba(232,0,13,0.08)' : '#1A1A1A',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '13px', color: '#F0F0F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🧭 {c.title}</div>
                <div style={{ fontSize: '10px', color: '#666666', marginTop: '2px' }}>{new Date(c.updated_at || c.created_at).toLocaleString()}</div>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ height: '48px', backgroundColor: '#1A1A1A', borderBottom: '1px solid #242424', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            value={activeCanvas?.title || ''}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled Canvas"
            style={{ backgroundColor: 'transparent', border: 'none', fontSize: '14px', fontWeight: '500', color: '#F0F0F0', flex: 1 }}
          />
          <span style={{ backgroundColor: '#222222', border: '1px solid #333333', borderRadius: '4px', padding: '2px 8px', fontSize: '11px', color: '#999999' }}>{saveStatus}</span>
          <span style={{ fontSize: '11px', color: '#666666' }}>Collaborators: {collaborators.join(', ')}</span>
          <button
            onClick={() => saveCanvas(latestSceneRef.current || { elements: activeCanvas?.elements || [], appState: activeCanvas?.app_state || {} })}
            disabled={!activeCanvas || saving}
            style={{ marginLeft: 'auto', height: '30px', padding: '0 12px', borderRadius: '6px', border: 'none', backgroundColor: '#E8000D', color: '#FFFFFF', fontSize: '13px', fontWeight: '500', cursor: !activeCanvas || saving ? 'not-allowed' : 'pointer', opacity: !activeCanvas || saving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Save size={14} /> Save
          </button>
        </div>

        {!activeCanvas ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666666' }}>Create or select a canvas.</div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <RyCanvas
              canvasId={activeCanvas.id}
              title={activeCanvas.title || ''}
              elements={activeCanvas.elements || []}
              appState={activeCanvas.app_state || {}}
              onTitleChange={handleTitleChange}
              onSave={saveCanvas}
              onSceneChange={(scene) => {
                latestSceneRef.current = scene;
              }}
            />
          </div>
        )}
      </section>
    </div>
  );
}
