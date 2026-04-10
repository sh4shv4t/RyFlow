import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Trash2 } from 'lucide-react';
import useStore from '../store/useStore';
import { apiFetch } from '../utils/apiClient';
import { DocumentRowSkeleton, ListSkeleton } from '../components/shared/Skeleton';
import { waitForMinimumLoading } from '../utils/loadingDelay';

function defaultDocContent() {
  return JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph' }]
  });
}

export default function Documents() {
  const navigate = useNavigate();
  const { workspace, user } = useStore();
  const workspaceId = workspace?.id || localStorage.getItem('ryflow_workspace_id');
  const isDeletingRef = useRef(false);

  const [docs, setDocs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const loadDocs = useCallback(async () => {
    if (!workspaceId) {
      setDocs([]);
      setIsLoading(false);
      return;
    }

    const startedAt = Date.now();
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/docs?workspace_id=${workspaceId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = Array.isArray(data)
        ? data
        : (data?.documents || data?.docs || []);
      setDocs(list);
    } catch (err) {
      console.error('[Documents] fetch failed:', err);
      toast.error('Failed to load documents');
      setDocs([]);
    } finally {
      await waitForMinimumLoading(startedAt);
      setIsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  const createDocument = useCallback(async () => {
    if (!workspaceId || creating) return;

    setCreating(true);
    try {
      const res = await apiFetch('/api/docs', {
        method: 'POST',
        body: JSON.stringify({
          workspace_id: workspaceId,
          created_by: user?.id || null,
          title: 'Untitled',
          content: defaultDocContent()
        })
      });

      const newDoc = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(newDoc?.error || `HTTP ${res.status}`);
      }

      if (!newDoc?.id) {
        throw new Error('Document id missing from response');
      }

      setDocs((prev) => [newDoc, ...prev.filter((d) => d.id !== newDoc.id)]);
      await new Promise((r) => setTimeout(r, 0));
      navigate(`/editor/${newDoc.id}`);
    } catch (err) {
      console.error('[Documents] create failed:', err);
      toast.error(err.message || 'Failed to create document');
    } finally {
      setCreating(false);
    }
  }, [creating, navigate, user?.id, workspaceId]);

  const handleDeleteDoc = useCallback(async (docId) => {
    if (isDeletingRef.current) return;

    const previous = docs;
    setDocs((prev) => prev.filter((d) => d.id !== docId));

    isDeletingRef.current = true;
    try {
      const res = await apiFetch(`/api/docs/${docId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    } catch {
      setDocs(previous);
      await loadDocs();
      toast.error('Failed to delete document');
    } finally {
      isDeletingRef.current = false;
    }
  }, [docs, loadDocs]);

  return (
    <div style={{ height: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          height: '52px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px'
        }}
      >
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            paddingLeft: '12px',
            borderLeft: '3px solid var(--accent)',
            margin: 0
          }}
        >
          Documents
        </h1>
        <button
          onClick={createDocument}
          disabled={!workspaceId || creating}
          style={{
            height: '30px',
            padding: '0 12px',
            borderRadius: '6px',
            border: '1px solid rgba(232,0,13,0.35)',
            background: 'rgba(232,0,13,0.12)',
            color: 'var(--accent)',
            fontSize: '12px',
            cursor: !workspaceId || creating ? 'not-allowed' : 'pointer',
            opacity: !workspaceId || creating ? 0.6 : 1
          }}
        >
          {creating ? 'Creating...' : 'New Document'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!workspaceId ? (
          <div style={{ color: '#999999', fontSize: '13px', padding: '12px' }}>No active workspace selected.</div>
        ) : isLoading ? (
          <ListSkeleton
            rows={8}
            RowComponent={DocumentRowSkeleton}
          />
        ) : docs.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '200px',
              gap: '12px',
              color: 'var(--text-tertiary)'
            }}
          >
            <p style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 500 }}>
              No documents yet
            </p>
            <p style={{ fontSize: '13px' }}>
              Click New Document to get started
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '8px', padding: '12px' }}>
            {docs.map((doc, i) => (
              <div
                key={doc.id}
                className="item-enter"
                style={{
                  position: 'relative',
                  animationDelay: `${Math.min(i * 30, 300)}ms`
                }}
                onMouseEnter={(e) => {
                  const btn = e.currentTarget.querySelector('.doc-delete-btn');
                  if (btn) btn.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                  const btn = e.currentTarget.querySelector('.doc-delete-btn');
                  if (btn) btn.style.opacity = '0';
                }}
              >
              <button
                onClick={() => navigate(`/editor/${doc.id}`)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  borderRadius: '8px',
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  padding: '10px 36px 10px 12px',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                  {doc.title || 'Untitled'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  {new Date(doc.updated_at || doc.created_at).toLocaleString()}
                </div>
              </button>
              <button
                className="doc-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteDoc(doc.id);
                }}
                style={{
                  opacity: 0,
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--error)',
                  padding: '4px',
                  borderRadius: '4px',
                  transition: 'opacity 150ms ease',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Delete document"
              >
                <Trash2 size={14} />
              </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
