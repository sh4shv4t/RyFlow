// Workspace manager page for create/switch/export/import and LAN remote joining.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { PlusCircle, RefreshCw, Upload, Download, Link2 } from 'lucide-react';

// Formats datetime as relative text for workspace cards.
function timeAgo(value) {
  if (!value) return 'unknown';
  const ms = Date.now() - new Date(value).getTime();
  const mins = Math.max(1, Math.floor(ms / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Triggers a full app reload after backend has finalized workspace switch.
function reloadToAppRoot() {
  setTimeout(() => {
    window.location.href = '/';
  }, 500);
}

export default function WorkspaceManager() {
  const [workspaces, setWorkspaces] = useState([]);
  const [peers, setPeers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '', owner_name: '' });
  const [createdCode, setCreatedCode] = useState('');
  const [manualJoin, setManualJoin] = useState({ host_ip: '', host_port: '3001', join_code: '' });
  const [joining, setJoining] = useState(false);
  const [importSummary, setImportSummary] = useState(null);

  // Loads local workspace registry and discovered peers.
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [wsRes, peersRes] = await Promise.all([
        axios.get('/api/workspaces'),
        axios.get('/api/peers')
      ]);
      setWorkspaces(wsRes.data.workspaces || []);
      setPeers(peersRes.data.peers || []);
    } catch {
      toast.error('Failed to load workspace manager data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Creates a new local workspace and switches to it.
  const createWorkspace = async () => {
    if (!createForm.name.trim() || !createForm.owner_name.trim()) return;
    setCreating(true);
    try {
      const res = await axios.post('/api/workspaces/create', createForm);
      const code = res.data.join_code || '';
      setCreatedCode(code);
      localStorage.setItem('ryflow_is_remote', 'false');
      localStorage.removeItem('ryflow_remote_join_code');
      localStorage.removeItem('ryflow_remote_host');
      localStorage.removeItem('ryflow_remote_port');
      toast.success(`Workspace created. Join code: ${code}`);
      reloadToAppRoot();
    } catch {
      toast.error('Failed to create workspace');
    } finally {
      setCreating(false);
    }
  };

  // Switches current session to selected workspace and reloads app state.
  const openWorkspace = async (workspaceId) => {
    try {
      await axios.post('/api/workspaces/switch', { workspace_id: workspaceId });
      localStorage.setItem('ryflow_is_remote', 'false');
      localStorage.removeItem('ryflow_remote_join_code');
      localStorage.removeItem('ryflow_remote_host');
      localStorage.removeItem('ryflow_remote_port');
      reloadToAppRoot();
    } catch {
      toast.error('Failed to switch workspace');
    }
  };

  // Deletes a local/remote workspace entry from registry with confirmation.
  const deleteWorkspace = async (workspaceId) => {
    if (!window.confirm('Delete this workspace from this device?')) return;
    try {
      await axios.delete(`/api/workspaces/${workspaceId}`);
      await loadData();
    } catch {
      toast.error('Failed to delete workspace');
    }
  };

  // Downloads portable .ryflow export archive for a workspace.
  const exportWorkspace = async (workspaceId) => {
    try {
      const res = await axios.post(`/api/workspaces/${workspaceId}/export`, {}, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workspace_${workspaceId}.ryflow`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    }
  };

  // Downloads JSON workspace snapshot for manual inspection/backups.
  const exportWorkspaceJson = async (workspaceId) => {
    try {
      const res = await axios.get(`/api/workspaces/${workspaceId}/export`, { params: { format: 'json' } });
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workspace_${workspaceId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('JSON export failed');
    }
  };

  // Connects to remote LAN workspace using join code and persists remote session metadata.
  const joinRemote = async (params) => {
    setJoining(true);
    try {
      const normalizedCode = String(params.join_code || '').toUpperCase();
      const res = await axios.post('/api/workspaces/join-remote', {
        host_ip: params.host_ip,
        host_port: Number(params.host_port || 3001),
        join_code: normalizedCode
      });
      localStorage.setItem('ryflow_remote_join_code', normalizedCode);
      localStorage.setItem('ryflow_is_remote', 'true');
      localStorage.setItem('ryflow_remote_host', String(params.host_ip));
      localStorage.setItem('ryflow_remote_port', String(params.host_port || 3001));
      toast.success(`Connected to ${res.data.workspace.workspace_name || 'remote workspace'}`);
      reloadToAppRoot();
    } catch (err) {
      const message = err?.response?.data?.error || 'Failed to join remote workspace';
      toast.error(message);
    } finally {
      setJoining(false);
    }
  };

  // Uploads and imports .ryflow or JSON backup file into a new local workspace.
  const importWorkspace = async (file) => {
    if (!file) return;
    setImporting(true);
    setImportSummary(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await axios.post('/api/workspaces/import', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportSummary(res.data.workspace);
      toast.success('Workspace imported');
      await loadData();
    } catch {
      toast.error('Import failed');
    } finally {
      setImporting(false);
    }
  };

  // Builds peer list entries that actually advertise an available workspace.
  const peerWorkspaceCards = useMemo(
    () => peers.filter((p) => p.workspace && p.workspace.id),
    [peers]
  );

  return (
    <div style={{ backgroundColor: '#111111', height: '100%', overflowY: 'auto', padding: '40px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#F0F0F0' }}>Workspaces</h1>
          <button onClick={loadData} style={{ marginLeft: 'auto', height: '30px', borderRadius: '6px', border: '1px solid #333333', backgroundColor: '#1A1A1A', color: '#999999', fontSize: '12px', padding: '0 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><RefreshCw size={12} /> Refresh</button>
        </div>

        <button
          onClick={() => setCreateOpen((v) => !v)}
          style={{ border: '1px dashed #333333', borderRadius: '6px', padding: '10px 16px', fontSize: '13px', color: '#666666', cursor: 'pointer', width: '100%', textAlign: 'center', backgroundColor: 'transparent', marginBottom: '12px' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#444444'; e.currentTarget.style.color = '#999999'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#333333'; e.currentTarget.style.color = '#666666'; }}
        >
          {createOpen ? 'Close new workspace form' : 'Create new workspace'}
        </button>

        {createOpen && (
          <div style={{ marginBottom: '16px', display: 'grid', gap: '8px' }}>
            <input value={createForm.name} onChange={(e) => setCreateForm((s) => ({ ...s, name: e.target.value }))} placeholder="Workspace name" style={{ height: '34px', backgroundColor: '#1A1A1A', border: '1px solid #333333', borderRadius: '6px', padding: '0 10px', fontSize: '13px', color: '#F0F0F0' }} />
            <input value={createForm.description} onChange={(e) => setCreateForm((s) => ({ ...s, description: e.target.value }))} placeholder="Description (optional)" style={{ height: '34px', backgroundColor: '#1A1A1A', border: '1px solid #333333', borderRadius: '6px', padding: '0 10px', fontSize: '13px', color: '#F0F0F0' }} />
            <input value={createForm.owner_name} onChange={(e) => setCreateForm((s) => ({ ...s, owner_name: e.target.value }))} placeholder="Owner name" style={{ height: '34px', backgroundColor: '#1A1A1A', border: '1px solid #333333', borderRadius: '6px', padding: '0 10px', fontSize: '13px', color: '#F0F0F0' }} />
            <button onClick={createWorkspace} disabled={creating} style={{ height: '34px', borderRadius: '6px', border: 'none', backgroundColor: '#E8000D', color: '#FFFFFF', fontSize: '13px', fontWeight: '500', cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.6 : 1 }}>
              {creating ? 'Creating...' : 'Create and Open'}
            </button>
            {createdCode && <div style={{ fontSize: '12px', color: '#999999' }}>Join code: {createdCode}</div>}
          </div>
        )}

        <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', marginBottom: '8px' }}>Workspace List</p>
        {loading ? <div style={{ fontSize: '13px', color: '#666666', padding: '8px 0' }}>Loading workspaces...</div> : (
          <div>
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#1A1A1A'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 16px', borderBottom: '1px solid #242424', transition: 'background 150ms ease' }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: '#F0F0F0' }}>{ws.name}</div>
                  <div style={{ fontSize: '12px', color: '#999999' }}>Owner: {ws.owner_name || 'Unknown'} · Last active {timeAgo(ws.last_accessed)}</div>
                </div>
                <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: '#666666', backgroundColor: '#222222', padding: '2px 6px', borderRadius: '3px' }}>{ws.join_code}</span>
                <button onClick={() => exportWorkspace(ws.id)} style={{ width: '26px', height: '26px', borderRadius: '4px', border: '1px solid #333333', backgroundColor: 'transparent', color: '#666666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Export"><Download size={13} /></button>
                <button onClick={() => deleteWorkspace(ws.id)} style={{ width: '26px', height: '26px', borderRadius: '4px', border: '1px solid #333333', backgroundColor: 'transparent', color: '#666666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Delete"><PlusCircle size={13} style={{ transform: 'rotate(45deg)' }} /></button>
                <button onClick={() => openWorkspace(ws.id)} style={{ height: '28px', borderRadius: '6px', border: '1px solid rgba(232,0,13,0.3)', backgroundColor: 'rgba(232,0,13,0.1)', color: '#E8000D', fontSize: '12px', padding: '0 10px', cursor: 'pointer' }}>Open</button>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', marginTop: '24px', marginBottom: '8px' }}>Join Workspace</p>
        <div style={{ display: 'grid', gap: '8px', marginBottom: '16px' }}>
          <input value={manualJoin.host_ip} onChange={(e) => setManualJoin((s) => ({ ...s, host_ip: e.target.value }))} placeholder="Host IP" style={{ height: '34px', backgroundColor: '#1A1A1A', border: '1px solid #333333', borderRadius: '6px', padding: '0 10px', fontSize: '13px', color: '#F0F0F0' }} />
          <input value={manualJoin.host_port} onChange={(e) => setManualJoin((s) => ({ ...s, host_port: e.target.value }))} placeholder="Port" style={{ height: '34px', backgroundColor: '#1A1A1A', border: '1px solid #333333', borderRadius: '6px', padding: '0 10px', fontSize: '13px', color: '#F0F0F0' }} />
          <input value={manualJoin.join_code} onChange={(e) => setManualJoin((s) => ({ ...s, join_code: e.target.value.toUpperCase().slice(0, 6) }))} placeholder="Join code" style={{ height: '34px', backgroundColor: '#1A1A1A', border: '1px solid #333333', borderRadius: '6px', padding: '0 10px', fontSize: '13px', color: '#F0F0F0' }} />
          <button onClick={() => joinRemote(manualJoin)} disabled={joining} style={{ height: '34px', borderRadius: '6px', border: 'none', backgroundColor: '#E8000D', color: '#FFFFFF', fontSize: '13px', fontWeight: '500', cursor: joining ? 'not-allowed' : 'pointer', opacity: joining ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><Link2 size={13} /> {joining ? 'Connecting...' : 'Connect'}</button>
        </div>

        {peerWorkspaceCards.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            {peerWorkspaceCards.map((peer) => (
              <div key={`${peer.host}:${peer.port}`} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderBottom: '1px solid #242424' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', color: '#F0F0F0' }}>{peer.workspace.name}</div>
                  <div style={{ fontSize: '11px', color: '#666666' }}>{peer.host}:{peer.port}</div>
                </div>
                <button onClick={() => joinRemote({ host_ip: peer.host, host_port: peer.port, join_code: manualJoin.join_code })} style={{ height: '28px', borderRadius: '6px', border: '1px solid #333333', backgroundColor: '#1A1A1A', color: '#999999', fontSize: '12px', padding: '0 8px', cursor: 'pointer' }}>Join</button>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#666666', marginBottom: '8px' }}>Import</p>
        <label
          style={{ border: '2px dashed #333333', borderRadius: '8px', padding: '32px', textAlign: 'center', marginTop: '24px', display: 'block', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#666666'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#333333'; }}
        >
          <Upload size={24} color="#444444" style={{ margin: '0 auto' }} />
          <div style={{ fontSize: '13px', color: '#666666', marginTop: '8px' }}>Drop or browse .ryflow/.json file</div>
          <input type="file" accept=".ryflow,.json" style={{ display: 'none' }} onChange={(e) => importWorkspace(e.target.files?.[0])} />
        </label>

        {importing ? <div style={{ marginTop: '8px', fontSize: '12px', color: '#666666' }}>Importing workspace...</div> : null}
        {importSummary && (
          <div style={{ marginTop: '12px', border: '1px solid #333333', borderRadius: '6px', backgroundColor: '#1A1A1A', padding: '10px 12px' }}>
            <div style={{ fontSize: '12px', color: '#999999' }}>Imported: {importSummary.name}</div>
            <div style={{ fontSize: '12px', color: '#999999' }}>Original owner: {importSummary.original_owner}</div>
            <div style={{ fontSize: '12px', color: '#999999' }}>Items: {importSummary.node_count} nodes</div>
            <div style={{ fontSize: '12px', color: '#999999' }}>Join code: {importSummary.join_code}</div>
            <button onClick={reloadToAppRoot} style={{ marginTop: '8px', height: '30px', borderRadius: '6px', border: '1px solid rgba(232,0,13,0.3)', backgroundColor: 'rgba(232,0,13,0.1)', color: '#E8000D', fontSize: '12px', padding: '0 10px', cursor: 'pointer' }}>Open Workspace</button>
          </div>
        )}
      </div>
    </div>
  );
}
