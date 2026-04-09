import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useStore from '../store/useStore';
import { apiFetch } from '../utils/apiClient';
import RyCanvas from '../components/canvas/RyCanvas';
import {
  Plus, ChevronDown, Trash2, PenTool
} from 'lucide-react';

export default function CanvasPage() {
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const workspaceId =
    useStore((s) => s.workspaceId) ||
    localStorage.getItem('ryflow_workspace_id');

  const [canvasList, setCanvasList] = useState([]);
  const [activeCanvasId, setActiveCanvasId] =
    useState(routeId || null);
  const [showPicker, setShowPicker] = useState(false);
  const isCreatingRef = useRef(false);

  // Load canvas list on mount.
  useEffect(() => {
    if (!workspaceId) return;
    apiFetch(
      `/api/canvas/list?workspace_id=${workspaceId}`
    )
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setCanvasList(list);
        if (!activeCanvasId && list.length > 0) {
          setActiveCanvasId(list[0].id);
        }
      })
      .catch(() => {});
  }, [workspaceId]);

  // When route changes update active canvas.
  useEffect(() => {
    if (routeId) setActiveCanvasId(routeId);
  }, [routeId]);

  async function createNewCanvas() {
    if (isCreatingRef.current || !workspaceId) return;
    isCreatingRef.current = true;
    const newId = crypto.randomUUID();
    const title = 'Untitled Canvas';
    try {
      const res = await apiFetch('/api/canvas/save', {
        method: 'POST',
        body: JSON.stringify({
          id: newId,
          workspace_id: workspaceId,
          title,
          elements: [],
          app_state: {},
          created_by: null
        })
      });
      if (!res.ok) throw new Error('Create failed');
      const saved = await res.json();
      const entry = {
        id: saved.id || newId,
        title,
        updated_at: new Date().toISOString()
      };
      setCanvasList((prev) => [entry, ...prev]);
      setActiveCanvasId(entry.id);
      navigate(`/canvas/${entry.id}`, { replace: true });
    } catch (err) {
      console.error('[Canvas create]', err);
    } finally {
      isCreatingRef.current = false;
    }
  }

  async function deleteCanvas(canvasId, e) {
    e.stopPropagation();
    const previous = canvasList;
    const remaining = canvasList.filter(
      (c) => c.id !== canvasId
    );
    setCanvasList(remaining);

    if (activeCanvasId === canvasId) {
      if (remaining.length > 0) {
        setActiveCanvasId(remaining[0].id);
        navigate(`/canvas/${remaining[0].id}`,
          { replace: true });
      } else {
        setActiveCanvasId(null);
        navigate('/canvas', { replace: true });
      }
    }

    try {
      const res = await apiFetch(`/api/canvas/${canvasId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Delete failed');
    } catch {
      setCanvasList(previous);
      if (activeCanvasId === canvasId) {
        setActiveCanvasId(canvasId);
        navigate(`/canvas/${canvasId}`, { replace: true });
      }
    }
  }

  function handleCanvasSaved(savedData) {
    setCanvasList((prev) => {
      const exists = prev.some(
        (c) => c.id === savedData.id
      );
      if (exists) {
        return prev.map((c) =>
          c.id === savedData.id
            ? {
                ...c,
                title: savedData.title,
                updated_at: savedData.updated_at ||
                  new Date().toISOString()
              }
            : c
        );
      }
      return [savedData, ...prev];
    });
  }

  const activeCanvas = canvasList.find(
    (c) => c.id === activeCanvasId
  );

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      overflow: 'hidden',
      background: 'var(--bg-base)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 16px',
        height: '48px',
        minHeight: '48px',
        flexShrink: 0,
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)'
      }}>
        <PenTool size={15}
          style={{ color: 'var(--text-tertiary)' }} />

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowPicker((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '4px',
              padding: '4px 10px',
              color: 'var(--text-primary)',
              fontSize: '13px',
              cursor: 'pointer',
              maxWidth: '240px'
            }}
          >
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {activeCanvas?.title || 'No canvas'}
            </span>
            <ChevronDown size={12}
              style={{
                color: 'var(--text-tertiary)',
                flexShrink: 0
              }} />
          </button>

          {showPicker && (
            <div
              onClick={() => setShowPicker(false)}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 99
              }}
            />
          )}
          {showPicker && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              zIndex: 100,
              background: 'var(--bg-overlay)',
              border: '1px solid var(--border-default)',
              borderRadius: '6px',
              minWidth: '240px',
              maxWidth: '320px',
              boxShadow:
                '0 8px 24px rgba(0,0,0,0.4)',
              overflow: 'hidden'
            }}>
              {canvasList.length === 0 ? (
                <p style={{
                  padding: '12px 16px',
                  fontSize: '13px',
                  color: 'var(--text-tertiary)',
                  margin: 0
                }}>
                  No canvases yet
                </p>
              ) : (
                canvasList.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setActiveCanvasId(c.id);
                      navigate(`/canvas/${c.id}`,
                        { replace: true });
                      setShowPicker(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '9px 14px',
                      cursor: 'pointer',
                      background:
                        c.id === activeCanvasId
                          ? 'var(--accent-subtle)'
                          : 'transparent',
                      borderLeft:
                        c.id === activeCanvasId
                          ? '2px solid var(--accent)'
                          : '2px solid transparent'
                    }}
                    onMouseEnter={(e) => {
                      if (c.id !== activeCanvasId) {
                        e.currentTarget.style.background =
                          'var(--bg-elevated)';
                      }
                      const btn = e.currentTarget
                        .querySelector('.cv-del');
                      if (btn) btn.style.opacity = '1';
                    }}
                    onMouseLeave={(e) => {
                      if (c.id !== activeCanvasId) {
                        e.currentTarget.style.background =
                          'transparent';
                      }
                      const btn = e.currentTarget
                        .querySelector('.cv-del');
                      if (btn) btn.style.opacity = '0';
                    }}
                  >
                    <span style={{
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {c.title}
                    </span>
                    <button
                      className="cv-del"
                      onClick={(e) =>
                        deleteCanvas(c.id, e)
                      }
                      style={{
                        opacity: 0,
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--status-error)',
                        padding: '2px',
                        borderRadius: '3px',
                        display: 'flex',
                        alignItems: 'center',
                        flexShrink: 0,
                        transition: 'opacity 150ms'
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
              <div style={{
                borderTop:
                  '1px solid var(--border-subtle)',
                padding: '8px'
              }}>
                <button
                  onClick={() => {
                    setShowPicker(false);
                    createNewCanvas();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 10px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    fontSize: '13px',
                    borderRadius: '4px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      'var(--bg-elevated)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      'transparent';
                  }}
                >
                  <Plus size={13} />
                  New Canvas
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={createNewCanvas}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 12px',
            background: 'var(--accent)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          <Plus size={13} /> New
        </button>

        <span style={{
          fontSize: '11px',
          color: 'var(--text-tertiary)',
          marginLeft: 'auto'
        }}>
          {canvasList.length} canvas
          {canvasList.length !== 1 ? 'es' : ''}
        </span>
      </div>

      <div style={{
        flex: 1,
        overflow: 'hidden',
        position: 'relative',
        minHeight: 0
      }}>
        {!activeCanvasId ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: '16px',
            color: 'var(--text-tertiary)'
          }}>
            <PenTool size={32}
              style={{ opacity: 0.3 }} />
            <p style={{
              fontSize: '14px',
              color: 'var(--text-primary)',
              fontWeight: 500
            }}>
              No canvas open
            </p>
            <button
              onClick={createNewCanvas}
              style={{
                padding: '8px 20px',
                background: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer'
              }}
            >
              Create Canvas
            </button>
          </div>
        ) : (
          <RyCanvas
            key={activeCanvasId}
            canvasId={activeCanvasId}
            workspaceId={workspaceId}
            initialTitle={activeCanvas?.title ||
              'Untitled Canvas'}
            onSaved={handleCanvasSaved}
          />
        )}
      </div>
    </div>
  );
}
