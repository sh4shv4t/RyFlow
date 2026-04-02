import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useStore from '../store/useStore';
import { apiFetch } from '../utils/apiClient';
import RichEditor from '../components/editor/RichEditor';

export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const workspaceId = useStore((s) => s.workspaceId);

  const [doc, setDoc] = useState(null);
  const [status, setStatus] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!id) {
      setStatus('error');
      setErrorMsg('No document ID in URL');
      return;
    }

    const wsId = workspaceId || localStorage.getItem('ryflow_workspace_id');

    if (!wsId) {
      setStatus('error');
      setErrorMsg('No active workspace');
      return;
    }

    setStatus('loading');

    apiFetch(`/api/docs/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!data || !data.id) {
          throw new Error('Document not found');
        }
        setDoc(data);
        setStatus('ready');
      })
      .catch((err) => {
        console.error('[Editor] fetch failed:', err);
        setErrorMsg(err.message || 'Failed to load');
        setStatus('error');
      });
  }, [id, workspaceId]);

  if (status === 'loading') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: 'var(--bg-base)',
          color: 'var(--text-tertiary)',
          fontSize: '13px'
        }}
      >
        Loading document...
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: 'var(--bg-base)',
          gap: '12px'
        }}
      >
        <p
          style={{
            color: 'var(--text-primary)',
            fontSize: '14px',
            fontWeight: 500
          }}
        >
          Could not open document
        </p>
        <p
          style={{
            color: 'var(--text-tertiary)',
            fontSize: '12px'
          }}
        >
          {errorMsg}
        </p>
        <button
          onClick={() => navigate('/documents')}
          style={{
            padding: '6px 14px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: '4px',
            color: 'var(--text-primary)',
            fontSize: '13px',
            cursor: 'pointer'
          }}
        >
          Back to Documents
        </button>
      </div>
    );
  }

  return (
    <RichEditor
      doc={doc}
      workspaceId={workspaceId || localStorage.getItem('ryflow_workspace_id')}
      onDocUpdate={(updatedDoc) => setDoc(updatedDoc)}
    />
  );
}
