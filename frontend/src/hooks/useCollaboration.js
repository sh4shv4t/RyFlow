import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import useStore from '../store/useStore';

function buildSignalingUrls() {
  if (typeof window === 'undefined') return ['ws://127.0.0.1:3001/yjs'];

  const urls = [];
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.location.hostname || '127.0.0.1';
  const isViteDev = window.location.port === '5173';
  const port = isViteDev ? '3001' : (window.location.port || '3001');

  urls.push(`${protocol}://${host}:${port}/yjs`);

  const remoteHost = localStorage.getItem('ryflow_remote_host');
  const remotePort = localStorage.getItem('ryflow_remote_port');
  if (remoteHost && remotePort) {
    urls.push(`${protocol}://${remoteHost}:${remotePort}/yjs`);
  }

  if (window.location.protocol === 'file:') {
    urls.push('ws://127.0.0.1:3001/yjs');
  }

  return Array.from(new Set(urls));
}

function normalizeUserColor(user) {
  return user?.avatar_color || user?.avatarColor || '#E8000D';
}

export default function useCollaboration({ workspaceId, docId }) {
  const user = useStore((s) => s.user);
  const roomName = useMemo(() => {
    if (!workspaceId || !docId) return null;
    return `workspace-${workspaceId}-doc-${docId}`;
  }, [workspaceId, docId]);

  const [state, setState] = useState({
    ydoc: null,
    provider: null,
    awareness: null,
    connected: false
  });

  useEffect(() => {
    if (!roomName) {
      setState({ ydoc: null, provider: null, awareness: null, connected: false });
      return undefined;
    }

    const ydoc = new Y.Doc();
    const provider = new WebrtcProvider(roomName, ydoc, {
      signaling: buildSignalingUrls(),
      maxConns: 20,
      filterBcConns: false
    });

    const awareness = provider.awareness;
    const applyAwareness = () => {
      awareness.setLocalStateField('user', {
        name: user?.name || 'Teammate',
        color: normalizeUserColor(user)
      });
    };

    applyAwareness();

    const handleStatus = ({ connected }) => {
      setState((prev) => ({ ...prev, connected: Boolean(connected) }));
    };

    provider.on('status', handleStatus);

    setState({
      ydoc,
      provider,
      awareness,
      connected: Boolean(provider.connected)
    });

    return () => {
      provider.off('status', handleStatus);
      provider.destroy();
      ydoc.destroy();
      setState({ ydoc: null, provider: null, awareness: null, connected: false });
    };
  }, [roomName, user?.name, user?.avatar_color, user?.avatarColor]);

  return {
    ...state,
    roomName
  };
}
