import { useState, useEffect, useRef, useCallback } from 'react';
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { Save, Download, Sparkles } from 'lucide-react';
import { apiFetch } from '../../utils/apiClient';

function parseCanvasElements(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseCanvasAppState(value) {
  const ensureCompatibleAppState = (candidate) => {
    const safe = (candidate && typeof candidate === 'object' && !Array.isArray(candidate))
      ? { ...candidate }
      : {};

    if (!safe.collaborators || typeof safe.collaborators.forEach !== 'function') {
      safe.collaborators = new Map();
    }

    return safe;
  };

  if (value && typeof value === 'object' && !Array.isArray(value)) return ensureCompatibleAppState(value);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return ensureCompatibleAppState(parsed);
    } catch {
      return ensureCompatibleAppState({});
    }
  }
  return ensureCompatibleAppState({});
}

export default function RyCanvas({
  canvasId,
  workspaceId,
  initialTitle,
  onSaved
}) {
  const [title, setTitle] = useState(
    initialTitle || 'Untitled Canvas'
  );
  const [saveStatus, setSaveStatus] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [initialData, setInitialData] = useState(null);
  const [aiDescription, setAiDescription] =
    useState('');
  const [showAiPanel, setShowAiPanel] =
    useState(false);
  const [isDescribing, setIsDescribing] =
    useState(false);

  const elementsRef = useRef([]);
  const appStateRef = useRef({});
  const saveTimerRef = useRef(null);
  const isSavingRef = useRef(false);
  const excalidrawApiRef = useRef(null);
  const titleRef = useRef(title);
  const isInitializedRef = useRef(false);

  // Keep titleRef in sync.
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  // Load existing canvas on mount.
  useEffect(() => {
    if (!canvasId) {
      setInitialData(null);
      setIsLoading(false);
      return;
    }
    setInitialData(null);
    setIsLoading(true);
    apiFetch(`/api/canvas/${canvasId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          if (data.title) setTitle(data.title);
          const elements = parseCanvasElements(data.elements);
          const appState = parseCanvasAppState(data.app_state ?? data.appState);
          elementsRef.current = elements;
          appStateRef.current = appState;
          setInitialData({ elements, appState });
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [canvasId]);

  useEffect(() => {
    if (initialData && initialData.elements) {
      elementsRef.current = initialData.elements || [];
      isInitializedRef.current = initialData.elements.length > 0;
    }
  }, [initialData]);

  useEffect(() => {
    isInitializedRef.current = false;
  }, [canvasId]);

  const performSave = useCallback(async () => {
    const currentElements = elementsRef.current;
    console.log('[Canvas performSave]',
      'elementsRef count:',
      Array.isArray(currentElements)
        ? currentElements.length : 'NOT ARRAY',
      'value:', currentElements
    );

    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setSaveStatus('Saving...');

    try {
      const elementsJson = JSON.stringify(
        currentElements || []
      );
      console.log('[Canvas sending to backend]',
        'elementsJson length:', elementsJson.length,
        'first 100 chars:', elementsJson.substring(0, 100)
      );

      const res = await apiFetch('/api/canvas/save', {
        method: 'POST',
        body: JSON.stringify({
          id: canvasId,
          workspace_id: workspaceId,
          title: titleRef.current,
          elements: elementsJson,
          app_state: appStateRef.current || {},
          created_by: null
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Save failed');
      }

      const saved = await res.json();
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(''), 2000);

      if (onSaved) {
        onSaved({
          id: canvasId,
          title: titleRef.current,
          updated_at: new Date().toISOString(),
          ...saved
        });
      }
    } catch (err) {
      console.error('[Canvas save]', err);
      setSaveStatus('Save failed');
      setTimeout(() => setSaveStatus(''), 3000);
    } finally {
      isSavingRef.current = false;
    }
  }, [canvasId, workspaceId, onSaved]);

  const debouncedSave = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      performSave();
    }, 2500);
  }, [performSave]);

  // Cleanup timer on unmount.
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current);
    };
  }, []);

  function handleChange(elements, appState) {
    console.log('[Canvas onChange]',
      'elements received:', elements?.length,
      'type:', typeof elements,
      'isArray:', Array.isArray(elements)
    );

    // Don't overwrite loaded elements with initial
    // empty state from Excalidraw on mount
    if (!isInitializedRef.current) {
      if (!elements || elements.length === 0) {
        // Skip the first empty onChange from Excalidraw
        // It fires before initialData is applied
        return;
      }
      isInitializedRef.current = true;
    }

    elementsRef.current = elements || [];
    appStateRef.current = appState || {};
    debouncedSave();
  }

  async function handleExport() {
    if (!excalidrawApiRef.current) return;
    try {
      const blob = await exportToBlob({
        elements: elementsRef.current,
        appState: {
          ...appStateRef.current,
          exportWithDarkMode: true
        },
        files: excalidrawApiRef.current.getFiles()
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${titleRef.current}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[Canvas export]', err);
    }
  }

  async function handleDescribe() {
    if (isDescribing) return;
    if (!excalidrawApiRef.current) return;

    const elements = elementsRef.current;
    if (!elements || elements.length === 0) {
      setAiDescription(
        'Canvas is empty. Draw something first.'
      );
      setShowAiPanel(true);
      return;
    }

    setIsDescribing(true);
    setShowAiPanel(true);
    setAiDescription('Describing canvas...');

    try {
      const blob = await exportToBlob({
        elements,
        appState: {
          ...appStateRef.current,
          exportWithDarkMode: false,
          exportBackground: true
        },
        files: excalidrawApiRef.current.getFiles(),
        mimeType: 'image/png'
      });

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = String(reader.result || '').split(',')[1];
        try {
          const res = await apiFetch(
            '/api/ai/ocr-fallback',
            {
              method: 'POST',
              body: JSON.stringify({
                imageBase64: base64,
                mimeType: 'image/png',
                prompt:
                  'Describe what is drawn in this' +
                  ' diagram in detail. Identify shapes,' +
                  ' connections, labels, and what concept' +
                  ' this diagram represents.'
              })
            }
          );
          if (!res.ok) throw new Error('AI failed');
          const data = await res.json();
          setAiDescription(
            data.text || data.content ||
            'Could not describe this canvas.'
          );
        } catch (err) {
          setAiDescription(
            'Could not describe canvas: ' + err.message
          );
        } finally {
          setIsDescribing(false);
        }
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      setAiDescription(
        'Export failed: ' + err.message
      );
      setIsDescribing(false);
    }
  }

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-tertiary)',
        fontSize: '13px'
      }}>
        Loading canvas...
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      overflow: 'hidden'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '0 16px',
        height: '44px',
        minHeight: '44px',
        flexShrink: 0,
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        position: 'relative',
        zIndex: 50
      }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => performSave()}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--text-primary)',
            flex: 1,
            minWidth: 0,
            maxWidth: '300px'
          }}
        />

        {saveStatus && (
          <span style={{
            fontSize: '11px',
            color: saveStatus === 'Saved'
              ? 'var(--status-success)'
              : saveStatus === 'Save failed'
              ? 'var(--status-error)'
              : 'var(--text-tertiary)',
            flexShrink: 0
          }}>
            {saveStatus}
          </span>
        )}

        <button
          onClick={handleDescribe}
          disabled={isDescribing}
          title="Describe canvas with AI"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            background: showAiPanel
              ? 'rgba(139,92,246,0.12)'
              : 'var(--bg-elevated)',
            border: showAiPanel
              ? '1px solid rgba(139,92,246,0.3)'
              : '1px solid var(--border-subtle)',
            borderRadius: '4px',
            color: showAiPanel
              ? '#8B5CF6' : 'var(--text-secondary)',
            fontSize: '12px',
            cursor: 'pointer',
            flexShrink: 0
          }}
        >
          <Sparkles size={13} />
          {isDescribing ? 'Describing...' : 'Describe'}
        </button>

        <button
          onClick={async () => {
            // Cancel any pending debounced save
            clearTimeout(saveTimerRef.current);
            // Immediately save current state
            await performSave();
          }}
          title="Save canvas"
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
            cursor: 'pointer',
            flexShrink: 0
          }}
        >
          <Save size={13} /> Save
        </button>

        <button
          onClick={handleExport}
          title="Export as PNG"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 10px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            color: 'var(--text-secondary)',
            fontSize: '12px',
            cursor: 'pointer',
            flexShrink: 0
          }}
        >
          <Download size={13} />
        </button>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        minHeight: 0
      }}>
        <div style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          minHeight: 0,
          minWidth: 0
        }}>
          <Excalidraw
            key={canvasId}
            excalidrawAPI={(api) => {
              excalidrawApiRef.current = api;
            }}
            initialData={initialData || {
              elements: [],
              appState: {
                theme: 'dark',
                collaborators: new Map()
              }
            }}
            onChange={handleChange}
            theme="dark"
            UIOptions={{
              canvasActions: {
                saveToActiveFile: false,
                loadScene: false,
                export: false,
                saveAsImage: false
              }
            }}
          />
        </div>

        {showAiPanel && (
          <div style={{
            width: '280px',
            flexShrink: 0,
            borderLeft:
              '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 14px',
              borderBottom:
                '1px solid var(--border-subtle)',
              flexShrink: 0
            }}>
              <span style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-primary)'
              }}>
                Canvas Description
              </span>
              <button
                onClick={() => setShowAiPanel(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  fontSize: '16px',
                  lineHeight: 1,
                  padding: '2px 4px'
                }}
              >
                ×
              </button>
            </div>
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px'
            }}>
              <p style={{
                fontSize: '13px',
                color: 'var(--text-primary)',
                lineHeight: 1.7,
                margin: 0,
                whiteSpace: 'pre-wrap'
              }}>
                {aiDescription || '...'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
