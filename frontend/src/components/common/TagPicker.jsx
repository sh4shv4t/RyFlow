// Reusable tag picker with inline create and multi-select support.
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import useStore from '../../store/useStore';

const COLOR_OPTIONS = ['#64748b', '#E8000D', '#FF6B00', '#00C853', '#64B5F6', '#9B59B6', '#F59E0B'];

export default function TagPicker({ value = [], onChange, compact = false }) {
  const { workspace } = useStore();
  const [tags, setTags] = useState([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(COLOR_OPTIONS[0]);

  useEffect(() => {
    if (!workspace?.id) return;
    axios.get('/api/tags', { params: { workspace_id: workspace.id } })
      .then((res) => setTags(res.data.tags || []))
      .catch(() => setTags([]));
  }, [workspace?.id]);

  const selectedIds = useMemo(() => new Set((value || []).map((t) => t.id || t)), [value]);

  const toggleTag = (tag) => {
    const hasTag = selectedIds.has(tag.id);
    const next = hasTag
      ? (value || []).filter((item) => (item.id || item) !== tag.id)
      : [...(value || []), tag];
    onChange && onChange(next);
  };

  const createTag = async () => {
    const name = newTagName.trim();
    if (!name || !workspace?.id) return;
    try {
      const res = await axios.post('/api/tags', {
        workspace_id: workspace.id,
        name,
        color: newTagColor
      });
      const created = res.data;
      setTags((prev) => [...prev.filter((t) => t.id !== created.id), created]);
      setNewTagName('');
      onChange && onChange([...(value || []), created]);
    } catch {
      // Ignore and keep picker usable.
    }
  };

  return (
    <div className={`rounded-xl border border-white/10 ${compact ? 'p-2' : 'p-3'} bg-amd-gray/30`}>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((tag) => {
          const active = selectedIds.has(tag.id);
          return (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag)}
              className={`text-xs px-2 py-1 rounded-full border transition-colors ${active ? 'text-white border-transparent' : 'text-amd-white/60 border-white/15'}`}
              style={{ backgroundColor: active ? (tag.color || '#64748b') : 'transparent' }}
            >
              {tag.name}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createTag()}
          placeholder="Create tag"
          className="flex-1 bg-black/20 border border-white/10 rounded px-2 py-1.5 text-xs text-amd-white outline-none"
        />
        <select
          value={newTagColor}
          onChange={(e) => setNewTagColor(e.target.value)}
          className="bg-black/20 border border-white/10 rounded px-2 py-1.5 text-xs text-amd-white"
        >
          {COLOR_OPTIONS.map((color) => <option key={color} value={color}>{color}</option>)}
        </select>
        <button onClick={createTag} className="px-2 py-1.5 rounded bg-amd-red/20 text-amd-red text-xs">Add</button>
      </div>
    </div>
  );
}
