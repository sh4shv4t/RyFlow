// Document history panel for version listing, preview, and restore.
import React, { useEffect, useState } from 'react';
import axios from 'axios';

export default function HistoryPanel({ docId, onRestored }) {
  const [versions, setVersions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState('');

  const loadVersions = async () => {
    if (!docId) return;
    const res = await axios.get(`/api/docs/${docId}/versions`);
    setVersions(res.data.versions || []);
  };

  useEffect(() => {
    loadVersions().catch(() => {
      setVersions([]);
      setSelected(null);
      setPreview('');
    });
  }, [docId]);

  const openVersion = async (versionId) => {
    setSelected(versionId);
    const res = await axios.get(`/api/docs/${docId}/versions/${versionId}`);
    setPreview(String(res.data.content || ''));
  };

  const restoreVersion = async () => {
    if (!selected || !docId) return;
    await axios.post(`/api/docs/${docId}/versions/${selected}/restore`, {});
    await loadVersions();
    onRestored && onRestored();
  };

  return (
    <div className="w-[380px] border-l border-white/10 bg-amd-gray/30 p-3 flex flex-col">
      <div className="text-sm font-semibold text-amd-white mb-2">Version History</div>
      <div className="space-y-1 overflow-auto max-h-56 pr-1">
        {versions.map((v) => (
          <button
            key={v.id}
            onClick={() => openVersion(v.id)}
            className={`w-full text-left rounded p-2 text-xs border ${selected === v.id ? 'border-amd-red/40 bg-amd-red/10' : 'border-white/10 hover:bg-white/5'}`}
          >
            <div className="text-amd-white">Version {v.version_number}</div>
            <div className="text-amd-white/45">{new Date(v.created_at).toLocaleString()}</div>
          </button>
        ))}
      </div>

      <div className="mt-3 text-xs text-amd-white/50">Preview</div>
      <pre className="mt-1 flex-1 overflow-auto text-xs text-amd-white/70 bg-black/20 rounded p-2 whitespace-pre-wrap">
        {preview ? preview.slice(0, 3000) : 'Select a version to preview content.'}
      </pre>

      <button
        onClick={restoreVersion}
        disabled={!selected}
        className="mt-3 px-3 py-2 rounded bg-amd-orange/20 text-amd-orange text-sm disabled:opacity-50"
      >
        Restore Selected Version
      </button>
    </div>
  );
}
