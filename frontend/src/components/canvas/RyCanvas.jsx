// Excalidraw-based canvas component with save/export/describe controls
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { Eraser, ImageDown, Save, Sparkles, X, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { apiFetch } from '../../utils/apiClient';
import LZString from 'lz-string';

// Creates initial Excalidraw data with RyFlow watermark text.
function initialCanvasData(title) {
  return {
    elements: [
      {
        id: 'ryflow-watermark',
        type: 'text',
        x: 40,
        y: 30,
        width: 220,
        height: 20,
        angle: 0,
        strokeColor: '#E8000D',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 1,
        strokeStyle: 'solid',
        roughness: 1,
        opacity: 35,
        groupIds: [],
        seed: 1,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        text: `RyFlow Canvas • ${title || 'Untitled'}`,
        fontSize: 18,
        fontFamily: 3,
        textAlign: 'left',
        verticalAlign: 'top',
        baseline: 16,
        containerId: null,
        originalText: `RyFlow Canvas • ${title || 'Untitled'}`,
        lineHeight: 1.25
      }
    ],
    appState: {
      viewBackgroundColor: '#1A1A1A',
      theme: 'dark'
    }
  };
}

// Renders an Excalidraw canvas with save/export/describe actions.
export default function RyCanvas({ canvasId, title, elements, appState, onTitleChange, onSave }) {
  const excalidrawRef = useRef(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const { workspace, selectedModel, setAiActive } = useStore();

  const draftKey = useMemo(() => `ryflow_canvas_draft_${canvasId || 'new'}`, [canvasId]);

  // Restores compressed local draft if available.
  const initialDraft = useMemo(() => {
    try {
      const compressed = localStorage.getItem(draftKey);
      if (!compressed) return null;
      const json = LZString.decompress(compressed) || compressed;
      return JSON.parse(json);
    } catch {
      return null;
    }
  }, [draftKey]);

  // Persists local draft in localStorage whenever canvas content changes.
  const handleCanvasChange = useCallback((nextElements, nextAppState) => {
    const draft = {
      elements: nextElements || [],
      appState: nextAppState || {}
    };
    localStorage.setItem(draftKey, LZString.compress(JSON.stringify(draft)));
  }, [draftKey]);

  // Saves current canvas state through page-level callback.
  const handleSave = useCallback(async () => {
    const api = excalidrawRef.current;
    if (!api || !onSave) return;
    const snapshot = api.getSceneElements();
    const state = api.getAppState();
    await onSave({ elements: snapshot, appState: state });
  }, [onSave]);

  // Exports current canvas scene to PNG and triggers browser download.
  const handleExportPng = useCallback(async () => {
    const api = excalidrawRef.current;
    if (!api) return;
    const blob = await exportToBlob({
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles(),
      mimeType: 'image/png'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'canvas'}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, [title]);

  // Sends a canvas structural summary to local LLM and streams back explanation text.
  const handleDescribeCanvas = useCallback(async () => {
    const api = excalidrawRef.current;
    if (!api) return;

    try {
      const sceneElements = api.getSceneElements();
      const prompt = `Describe what is drawn in this diagram in detail. Identify shapes, connections, labels, and what concept this diagram represents.\n\nCanvas elements JSON:\n${JSON.stringify(sceneElements)}`;

      setAiOpen(true);
      setAiText('');
      setAiLoading(true);
      setAiActive(true);

      const response = await apiFetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspace?.id || null,
          model: selectedModel,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!response.ok || !response.body) throw new Error('Unable to open AI stream');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let full = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.text) {
              full += parsed.text;
              setAiText(full);
            }
          } catch {
            // Ignore malformed stream frames.
          }
        }
      }
    } catch (err) {
      toast.error(`Canvas description failed: ${err.message}`);
    } finally {
      setAiLoading(false);
      setAiActive(false);
    }
  }, [selectedModel, setAiActive, workspace?.id]);

  // Clears canvas content after a user confirmation.
  const handleClear = useCallback(() => {
    if (!window.confirm('Clear this canvas? This cannot be undone.')) return;
    const api = excalidrawRef.current;
    if (!api) return;
    api.updateScene({ elements: [] });
  }, []);

  return (
    <div className="h-full flex gap-4">
      <div className="flex-1 glass-card overflow-hidden flex flex-col">
        <div className="p-3 border-b border-white/10 bg-amd-gray/40 flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => onTitleChange?.(e.target.value)}
            placeholder="Canvas title"
            className="flex-1 bg-amd-gray/60 border border-white/10 rounded px-3 py-2 text-sm text-amd-white outline-none"
          />
          <button onClick={handleSave} className="px-3 py-2 rounded bg-amd-red text-white text-sm flex items-center gap-1">
            <Save size={14} /> Save
          </button>
          <button onClick={handleExportPng} className="px-3 py-2 rounded bg-white/10 text-amd-white text-sm flex items-center gap-1 hover:bg-white/20">
            <ImageDown size={14} /> Export PNG
          </button>
          <button onClick={handleDescribeCanvas} className="px-3 py-2 rounded bg-amd-red/15 text-amd-red text-sm flex items-center gap-1 hover:bg-amd-red/25">
            <Sparkles size={14} /> Describe Canvas
          </button>
          <button onClick={handleClear} className="px-3 py-2 rounded bg-amd-orange/15 text-amd-orange text-sm flex items-center gap-1 hover:bg-amd-orange/25">
            <Eraser size={14} /> Clear
          </button>
          <div className={`ml-2 text-xs flex items-center gap-1 px-2 py-1 rounded-full border ${aiLoading ? 'amd-pulse border-amd-red/40 text-amd-red' : 'border-amd-red/20 text-amd-red/70'}`}>
            <Zap size={12} /> ⚡ AMD Accelerated
          </div>
        </div>

        <div className="flex-1">
          <Excalidraw
            ref={excalidrawRef}
            theme="dark"
            UIOptions={{
              canvasActions: { theme: true }
            }}
            initialData={{
              ...(initialCanvasData(title)),
              elements: Array.isArray(elements) ? elements : (Array.isArray(initialDraft?.elements) ? initialDraft.elements : initialCanvasData(title).elements),
              appState: appState || initialDraft?.appState || initialCanvasData(title).appState
            }}
            onChange={handleCanvasChange}
          />
        </div>
      </div>

      <AnimatePresence>
        {aiOpen && (
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            className="w-[340px] glass-card p-4 overflow-auto"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-heading text-sm text-amd-white">Canvas Analysis</h3>
              <button onClick={() => setAiOpen(false)} className="text-amd-white/50 hover:text-amd-white">
                <X size={14} />
              </button>
            </div>
            <div className="text-xs text-amd-red/70 mb-2">{aiLoading ? 'Analyzing diagram...' : 'AI summary'}</div>
            <div className="text-xs text-amd-white/80 whitespace-pre-wrap">{aiText || 'No output yet.'}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
