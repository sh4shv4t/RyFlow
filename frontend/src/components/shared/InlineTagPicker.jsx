import { useState, useEffect, useRef } from 'react';
import { Tag, Plus, X } from 'lucide-react';
import { apiFetch } from '../../utils/apiClient';

// Props: workspaceId, nodeSourceId, nodeType
// nodeType: 'doc' | 'task' | 'code' | 'canvas'
export default function InlineTagPicker({
  workspaceId,
  nodeSourceId,
  nodeType = 'doc'
}) {
  const [tags, setTags] = useState([]);
  const [assignedTags, setAssignedTags] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const containerRef = useRef(null);

  useEffect(() => {
    if (!workspaceId) return;
    loadTags();
    if (nodeSourceId) loadAssigned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, nodeSourceId, nodeType]);

  async function loadTags() {
    try {
      const res = await apiFetch(
        `/api/tags?workspace_id=${workspaceId}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setTags(Array.isArray(data) ? data : []);
    } catch {}
  }

  async function loadAssigned() {
    try {
      const res = await apiFetch(
        `/api/tags/by-source?workspace_id=` +
        `${workspaceId}&type=${nodeType}` +
        `&source_id=${nodeSourceId}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setAssignedTags(
        Array.isArray(data.tags) ? data.tags : []
      );
    } catch {}
  }

  async function toggleTag(tag) {
    const isAssigned = assignedTags.some(
      (t) => t.id === tag.id
    );

    if (isAssigned) {
      const nextAssigned = assignedTags.filter((t) => t.id !== tag.id);
      setAssignedTags(nextAssigned);
      try {
        await apiFetch(
          `/api/tags/assign/${nodeSourceId}/${tag.id}`,
          { method: 'DELETE' }
        );
      } catch {}
      return;
    }

    const nextAssigned = [...assignedTags, tag];
    setAssignedTags(nextAssigned);
    try {
      await apiFetch('/api/tags/assign', {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: workspaceId,
          type: nodeType,
          source_id: nodeSourceId,
          tag_ids: nextAssigned.map((t) => t.id)
        })
      });
    } catch {}
  }

  async function createAndAssign() {
    if (!newTagName.trim()) return;
    try {
      const res = await apiFetch('/api/tags', {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: workspaceId,
          name: newTagName.trim(),
          color: '#8B5CF6'
        })
      });
      if (!res.ok) return;
      const newTag = await res.json();
      setTags((prev) => [...prev, newTag]);
      setNewTagName('');
      await toggleTag(newTag);
    } catch {}
  }

  return (
    <div ref={containerRef}
      style={{ position: 'relative' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        flexWrap: 'wrap'
      }}>
        {assignedTags.map((tag) => (
          <span key={tag.id} style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            padding: '2px 7px',
            background: `${tag.color}18`,
            border: `1px solid ${tag.color}40`,
            borderRadius: '10px',
            fontSize: '11px',
            color: tag.color,
            fontWeight: 500
          }}>
            {tag.name}
            {nodeSourceId && (
              <button
                onClick={() => toggleTag(tag)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: tag.color,
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={10} />
              </button>
            )}
          </span>
        ))}

        {nodeSourceId && (
          <button
            onClick={() => setShowPicker((v) => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              padding: '2px 7px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '10px',
              fontSize: '11px',
              color: 'var(--text-tertiary)',
              cursor: 'pointer'
            }}
          >
            <Tag size={10} /> Tag
          </button>
        )}
      </div>

      {showPicker && (
        <>
          <div
            onClick={() => setShowPicker(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 199
            }}
          />
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 200,
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border-default)',
            borderRadius: '6px',
            minWidth: '180px',
            maxHeight: '240px',
            overflow: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
          }}>
            <div style={{
              padding: '8px',
              borderBottom:
                '1px solid var(--border-subtle)'
            }}>
              <div style={{
                display: 'flex',
                gap: '4px'
              }}>
                <input
                  autoFocus
                  value={newTagName}
                  onChange={(e) =>
                    setNewTagName(e.target.value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter')
                      createAndAssign();
                    if (e.key === 'Escape')
                      setShowPicker(false);
                    e.stopPropagation();
                  }}
                  placeholder="New tag..."
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    background: 'var(--bg-elevated)',
                    border:
                      '1px solid var(--border-default)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    outline: 'none'
                  }}
                />
                <button
                  onClick={createAndAssign}
                  style={{
                    padding: '4px 8px',
                    background: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>

            {tags.length === 0 ? (
              <p style={{
                padding: '10px 12px',
                fontSize: '12px',
                color: 'var(--text-tertiary)',
                margin: 0
              }}>
                No tags yet
              </p>
            ) : (
              tags.map((tag) => {
                const isOn = assignedTags.some(
                  (t) => t.id === tag.id
                );
                return (
                  <div
                    key={tag.id}
                    onClick={() => toggleTag(tag)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      background: isOn
                        ? `${tag.color}18`
                        : 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      if (!isOn) {
                        e.currentTarget.style
                          .background =
                          'var(--bg-elevated)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isOn) {
                        e.currentTarget.style
                          .background = 'transparent';
                      }
                    }}
                  >
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: tag.color,
                      flexShrink: 0
                    }} />
                    <span style={{
                      fontSize: '12px',
                      color: isOn
                        ? tag.color
                        : 'var(--text-primary)',
                      flex: 1
                    }}>
                      {tag.name}
                    </span>
                    {isOn && (
                      <span style={{
                        fontSize: '10px',
                        color: tag.color
                      }}>
                        ✓
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
