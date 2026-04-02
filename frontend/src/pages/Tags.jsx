// Tags page — manage workspace tags and browse items by selected tag.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'doc', label: 'Documents' },
  { value: 'task', label: 'Tasks' },
  { value: 'code', label: 'Code' },
  { value: 'canvas', label: 'Canvases' },
  { value: 'ai_chat', label: 'AI Chats' },
  { value: 'voice', label: 'Voice Notes' }
];

function targetPathForItem(item) {
  if (item.type === 'doc') return item.source_id ? `/editor/${item.source_id}` : '/documents';
  if (item.type === 'task') return '/tasks';
  if (item.type === 'code') return item.source_id ? `/code/${item.source_id}` : '/code';
  if (item.type === 'canvas') return item.source_id ? `/canvas/${item.source_id}` : '/canvas';
  if (item.type === 'ai_chat') return '/ai';
  if (item.type === 'voice') return '/ai';
  return '/';
}

export default function Tags() {
  const navigate = useNavigate();
  const { workspace } = useStore();
  const [tags, setTags] = useState([]);
  const [items, setItems] = useState([]);
  const [activeTagId, setActiveTagId] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#64748b');

  const fetchTags = useCallback(async () => {
    if (!workspace?.id) return;
    try {
      const res = await axios.get('/api/tags', { params: { workspace_id: workspace.id } });
      const next = Array.isArray(res.data) ? res.data : (res.data?.tags || []);
      setTags(next);
      if (!activeTagId && next.length) {
        setActiveTagId(next[0].id);
      }
    } catch {
      toast.error('Failed to load tags');
    }
  }, [activeTagId, workspace?.id]);

  const fetchFilteredItems = useCallback(async () => {
    if (!workspace?.id || !activeTagId) {
      setItems([]);
      return;
    }
    try {
      const res = await axios.get('/api/tags/filter', {
        params: {
          workspace_id: workspace.id,
          tag_id: activeTagId,
          type: typeFilter || undefined
        }
      });
      setItems(res.data.items || []);
    } catch {
      toast.error('Failed to load tagged items');
    }
  }, [activeTagId, typeFilter, workspace?.id]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  useEffect(() => {
    fetchFilteredItems();
  }, [fetchFilteredItems]);

  const activeTag = useMemo(() => tags.find((t) => t.id === activeTagId) || null, [activeTagId, tags]);

  const createTag = useCallback(async () => {
    const name = newTagName.trim();
    if (!workspace?.id || !name) return;
    try {
      const res = await axios.post('/api/tags', {
        workspace_id: workspace.id,
        name,
        color: newTagColor
      });
      const created = res.data;
      setTags((prev) => [...prev, created].sort((a, b) => String(a.name).localeCompare(String(b.name))));
      setActiveTagId(created.id);
      setNewTagName('');
      toast.success('Tag created');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to create tag');
    }
  }, [newTagColor, newTagName, workspace?.id]);

  const deleteTag = useCallback(async (tagId) => {
    const ok = window.confirm('Delete this tag?');
    if (!ok) return;
    try {
      await axios.delete(`/api/tags/${tagId}`);
      const next = tags.filter((t) => t.id !== tagId);
      setTags(next);
      setActiveTagId(next[0]?.id || '');
      toast.success('Tag deleted');
    } catch {
      toast.error('Failed to delete tag');
    }
  }, [tags]);

  return (
    <div style={{ display: 'flex', height: '100%', backgroundColor: '#111111' }}>
      <aside style={{ width: '280px', minWidth: '280px', borderRight: '1px solid #242424', padding: '14px', overflowY: 'auto' }}>
        <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', marginBottom: '10px' }}>Tags</p>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
          <input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createTag()}
            placeholder="New tag"
            style={{ flex: 1, height: '30px', borderRadius: '4px', border: '1px solid #333333', backgroundColor: '#1A1A1A', padding: '0 8px', fontSize: '12px', color: '#F0F0F0' }}
          />
          <input
            type="color"
            value={newTagColor}
            onChange={(e) => setNewTagColor(e.target.value)}
            style={{ width: '32px', height: '30px', borderRadius: '4px', border: '1px solid #333333', backgroundColor: '#1A1A1A', padding: '2px' }}
          />
          <button onClick={createTag} style={{ height: '30px', borderRadius: '4px', border: '1px solid rgba(232,0,13,0.3)', backgroundColor: 'rgba(232,0,13,0.1)', color: '#E8000D', fontSize: '12px', padding: '0 10px', cursor: 'pointer' }}>
            Add
          </button>
        </div>

        <div style={{ display: 'grid', gap: '6px' }}>
          {tags.map((tag) => (
            <div key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={() => setActiveTagId(tag.id)}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  height: '30px',
                  borderRadius: '4px',
                  border: activeTagId === tag.id ? '1px solid rgba(232,0,13,0.3)' : '1px solid #333333',
                  backgroundColor: activeTagId === tag.id ? 'rgba(232,0,13,0.08)' : '#1A1A1A',
                  color: '#F0F0F0',
                  fontSize: '12px',
                  padding: '0 8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: tag.color || '#64748b' }} />
                <span>{tag.name}</span>
              </button>
              <button onClick={() => deleteTag(tag.id)} style={{ width: '26px', height: '26px', borderRadius: '4px', border: '1px solid #333333', backgroundColor: '#1A1A1A', color: '#666666', cursor: 'pointer' }}>
                x
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ height: '48px', borderBottom: '1px solid #242424', display: 'flex', alignItems: 'center', gap: '10px', padding: '0 16px', backgroundColor: '#1A1A1A' }}>
          <h2 style={{ fontSize: '14px', fontWeight: '600', color: '#F0F0F0', margin: 0 }}>
            {activeTag ? `#${activeTag.name}` : 'Tagged Items'}
          </h2>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: activeTag?.color || '#64748b' }} />
          <span style={{ fontSize: '11px', color: '#666666' }}>{items.length} items</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ marginLeft: 'auto', height: '28px', borderRadius: '4px', border: '1px solid #333333', backgroundColor: '#111111', color: '#999999', fontSize: '12px', padding: '0 8px' }}
          >
            {TYPE_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
          {!activeTagId ? (
            <p style={{ fontSize: '13px', color: '#666666' }}>Create or select a tag to browse filtered items.</p>
          ) : items.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#666666' }}>No items for this tag and type filter.</p>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => navigate(targetPathForItem(item))}
                  style={{ textAlign: 'left', borderRadius: '6px', border: '1px solid #333333', backgroundColor: '#1A1A1A', padding: '10px', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#666666' }}>{item.type}</span>
                    <span style={{ fontSize: '10px', color: '#666666' }}>{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#F0F0F0', marginBottom: '4px' }}>{item.title || 'Untitled'}</div>
                  <div style={{ fontSize: '12px', color: '#999999', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.content_summary || 'No summary available'}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
