// Tags management page for creating and deleting workspace tags.
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Tag, Trash2 } from 'lucide-react';
import useStore from '../store/useStore';

export default function Tags() {
  const { workspace } = useStore();
  const [tags, setTags] = useState([]);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#64748b');

  const fetchTags = useCallback(async () => {
    if (!workspace?.id) return;
    try {
      const res = await axios.get('/api/tags', { params: { workspace_id: workspace.id } });
      setTags(res.data.tags || []);
    } catch {
      setTags([]);
    }
  }, [workspace?.id]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const createTag = async () => {
    if (!workspace?.id || !name.trim()) return;
    await axios.post('/api/tags', { workspace_id: workspace.id, name: name.trim(), color });
    setName('');
    fetchTags();
  };

  const removeTag = async (id) => {
    await axios.delete(`/api/tags/${id}`);
    fetchTags();
  };

  return (
    <div className="h-full space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-amd-white">Tags</h1>
        <p className="text-sm text-amd-white/45">Organize documents, tasks, code files, and canvases with shared tags.</p>
      </div>

      <div className="glass-card p-4 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createTag()}
          placeholder="Tag name"
          className="flex-1 bg-amd-gray/40 border border-white/10 rounded px-3 py-2 text-sm text-amd-white outline-none"
        />
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 rounded bg-transparent border border-white/10" />
        <button onClick={createTag} className="px-3 py-2 rounded bg-amd-red text-white text-sm">Create</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {tags.map((tag) => (
          <div key={tag.id} className="glass-card p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Tag size={14} style={{ color: tag.color || '#64748b' }} />
              <span className="text-sm text-amd-white truncate">{tag.name}</span>
            </div>
            <button onClick={() => removeTag(tag.id)} className="p-1 text-amd-white/35 hover:text-amd-red"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
