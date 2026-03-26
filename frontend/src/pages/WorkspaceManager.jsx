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
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl text-amd-white font-bold">Workspace Manager</h1>
          <p className="text-sm text-amd-white/45">Create, switch, export/import, and join LAN workspaces.</p>
        </div>
        <button onClick={loadData} className="px-3 py-2 rounded-lg bg-white/10 text-amd-white/70 flex items-center gap-2"><RefreshCw size={14} /> Refresh</button>
      </div>

      <section className="glass-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-amd-white">Your Local Workspaces</h2>
          <button onClick={() => setCreateOpen((v) => !v)} className="px-2 py-1 rounded bg-amd-red/20 text-amd-red text-xs flex items-center gap-1"><PlusCircle size={12} /> Create New Workspace</button>
        </div>

        {createOpen && (
          <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-2">
            <input value={createForm.name} onChange={(e) => setCreateForm((s) => ({ ...s, name: e.target.value }))} placeholder="Workspace name" className="bg-amd-gray/40 border border-white/10 rounded px-3 py-2 text-sm text-amd-white" />
            <input value={createForm.description} onChange={(e) => setCreateForm((s) => ({ ...s, description: e.target.value }))} placeholder="Description (optional)" className="bg-amd-gray/40 border border-white/10 rounded px-3 py-2 text-sm text-amd-white" />
            <input value={createForm.owner_name} onChange={(e) => setCreateForm((s) => ({ ...s, owner_name: e.target.value }))} placeholder="Your name" className="bg-amd-gray/40 border border-white/10 rounded px-3 py-2 text-sm text-amd-white" />
            <button onClick={createWorkspace} disabled={creating} className="md:col-span-3 px-3 py-2 rounded bg-amd-red text-white text-sm disabled:opacity-50">{creating ? 'Creating...' : 'Create and Open'}</button>
            {createdCode && <div className="md:col-span-3 text-xs bg-amd-orange/20 text-amd-orange rounded p-2">Your join code: {createdCode}. Share this code with teammates to let them join.</div>}
          </div>
        )}

        {loading ? <div className="text-sm text-amd-white/50">Loading workspaces...</div> : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {workspaces.map((ws) => (
              <div key={ws.id} className="rounded-xl border border-white/10 p-3 bg-white/5">
                <div className="text-base font-semibold text-amd-white truncate">{ws.name}</div>
                <div className="text-xs text-amd-white/45">Owner: {ws.owner_name || 'Unknown'}</div>
                <div className="text-xs text-amd-white/45">Last accessed: {timeAgo(ws.last_accessed)}</div>
                <div className="text-xs text-amd-orange mt-1">Code: {ws.join_code}</div>
                {ws.orphaned ? <div className="text-[11px] text-amd-orange mt-1">Local DB file missing</div> : null}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => openWorkspace(ws.id)} className="px-2 py-1 rounded bg-amd-red/20 text-amd-red text-xs">Open</button>
                  <button onClick={() => exportWorkspace(ws.id)} className="px-2 py-1 rounded bg-white/10 text-amd-white/70 text-xs flex items-center justify-center gap-1"><Download size={12} /> .ryflow</button>
                  <button onClick={() => exportWorkspaceJson(ws.id)} className="px-2 py-1 rounded bg-white/10 text-amd-white/70 text-xs">Export JSON</button>
                  <button onClick={() => deleteWorkspace(ws.id)} className="px-2 py-1 rounded bg-amd-orange/20 text-amd-orange text-xs">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="glass-card p-4">
        <h2 className="font-heading text-amd-white mb-3">Join a Workspace on This Network</h2>
        {peerWorkspaceCards.length === 0 ? (
          <div className="text-sm text-amd-white/45">No workspaces found on this network. Make sure teammates have RyFlow open on the same WiFi.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {peerWorkspaceCards.map((peer) => (
              <div key={`${peer.host}:${peer.port}`} className="rounded-lg border border-white/10 p-3 bg-white/5">
                <div className="text-sm text-amd-white font-semibold">{peer.workspace.name}</div>
                <div className="text-xs text-amd-white/45">Owner: {peer.workspace.owner_name || 'Unknown'}</div>
                <div className="text-xs text-amd-white/45">Host: {peer.name} ({peer.host}:{peer.port})</div>
                <button onClick={() => joinRemote({ host_ip: peer.host, host_port: peer.port, join_code: manualJoin.join_code })} disabled={joining || !manualJoin.join_code} className="mt-2 px-2 py-1 rounded bg-amd-red/20 text-amd-red text-xs">Join</button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input value={manualJoin.host_ip} onChange={(e) => setManualJoin((s) => ({ ...s, host_ip: e.target.value }))} placeholder="Host IP" className="bg-amd-gray/40 border border-white/10 rounded px-3 py-2 text-sm text-amd-white" />
          <input value={manualJoin.host_port} onChange={(e) => setManualJoin((s) => ({ ...s, host_port: e.target.value }))} placeholder="Port" className="bg-amd-gray/40 border border-white/10 rounded px-3 py-2 text-sm text-amd-white" />
          <input value={manualJoin.join_code} onChange={(e) => setManualJoin((s) => ({ ...s, join_code: e.target.value.toUpperCase().slice(0, 6) }))} placeholder="Join code" className="bg-amd-gray/40 border border-white/10 rounded px-3 py-2 text-sm text-amd-white uppercase" />
          <button onClick={() => joinRemote(manualJoin)} disabled={joining} className="px-3 py-2 rounded bg-amd-red text-white text-sm disabled:opacity-50 flex items-center justify-center gap-1"><Link2 size={14} /> {joining ? 'Connecting...' : 'Connect'}</button>
        </div>
      </section>

      <section className="glass-card p-4">
        <h2 className="font-heading text-amd-white mb-3">Import a Workspace</h2>
        <label className="block border border-dashed border-white/20 rounded-xl p-5 text-center cursor-pointer hover:bg-white/5">
          <div className="text-sm text-amd-white/70 flex items-center justify-center gap-2"><Upload size={16} /> Drag and drop or browse .ryflow/.json</div>
          <input type="file" accept=".ryflow,.json" className="hidden" onChange={(e) => importWorkspace(e.target.files?.[0])} />
        </label>
        {importing ? <div className="mt-2 text-xs text-amd-white/45">Importing workspace...</div> : null}
        {importSummary && (
          <div className="mt-3 rounded-lg bg-amd-orange/15 border border-amd-orange/30 p-3 text-sm text-amd-white">
            <div>Imported: {importSummary.name}</div>
            <div>Original owner: {importSummary.original_owner}</div>
            <div>Items: {importSummary.node_count} knowledge nodes</div>
            <div>New join code: {importSummary.join_code}</div>
            <button onClick={reloadToAppRoot} className="mt-2 px-2 py-1 rounded bg-amd-red/20 text-amd-red text-xs">Open Workspace</button>
          </div>
        )}
      </section>
    </div>
  );
}
