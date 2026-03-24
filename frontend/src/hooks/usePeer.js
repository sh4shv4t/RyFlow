// Hook for WebRTC peer connections via Socket.io signaling
import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import SimplePeer from 'simple-peer';
import * as Y from 'yjs';
import useStore from '../store/useStore';

const SOCKET_URL = 'http://localhost:3001';

export default function usePeer() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [presenceList, setPresenceList] = useState([]);
  const socketRef = useRef(null);
  const peersRef = useRef(new Map());
  const yDocRef = useRef(new Y.Doc());
  const { user, workspace } = useStore();

  const ensurePeer = useCallback((targetId, initiator, sock) => {
    if (!targetId) return null;
    if (peersRef.current.has(targetId)) return peersRef.current.get(targetId);

    const peer = new SimplePeer({ initiator, trickle: true });

    peer.on('signal', (signalData) => {
      // Route SDP and ICE through existing socket signaling channels.
      if (signalData.type === 'offer') {
        sock.emit('signal-offer', { targetId, offer: signalData, from: user?.name || 'Peer' });
      } else if (signalData.type === 'answer') {
        sock.emit('signal-answer', { targetId, answer: signalData });
      } else {
        sock.emit('signal-ice', { targetId, candidate: signalData });
      }
    });

    peer.on('data', (payload) => {
      try {
        const parsed = JSON.parse(payload.toString());
        if (parsed.type === 'y-update' && Array.isArray(parsed.update)) {
          Y.applyUpdate(yDocRef.current, new Uint8Array(parsed.update), 'remote');
        }
      } catch {
        // Ignore malformed transport messages.
      }
    });

    peer.on('close', () => peersRef.current.delete(targetId));
    peer.on('error', () => peersRef.current.delete(targetId));
    peersRef.current.set(targetId, peer);
    return peer;
  }, [user?.name]);

  // Connect to the Socket.io signaling server
  useEffect(() => {
    if (!user || !workspace) return;

    const sock = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });

    sock.on('connect', () => {
      setConnected(true);
      sock.emit('join-workspace', {
        workspaceId: workspace.id,
        userName: user.name,
        userId: user.id,
        avatarColor: user.avatar_color
      });
    });

    sock.on('presence-update', (users) => {
      setPresenceList(users);
      const selfId = sock.id;
      const targets = users
        .map((u) => u.socketId)
        .filter((id) => id && id !== selfId);

      // Remove peers no longer present in this workspace room.
      Array.from(peersRef.current.keys()).forEach((id) => {
        if (!targets.includes(id)) {
          peersRef.current.get(id)?.destroy();
          peersRef.current.delete(id);
        }
      });

      // Connect to newly observed peers using deterministic initiator ordering.
      targets.forEach((targetId) => {
        if (!peersRef.current.has(targetId)) {
          ensurePeer(targetId, String(selfId) < String(targetId), sock);
        }
      });
    });

    sock.on('signal-offer', ({ offer, from }) => {
      const peer = ensurePeer(from, false, sock);
      peer?.signal(offer);
    });

    sock.on('signal-answer', ({ answer, from }) => {
      const peer = ensurePeer(from, false, sock);
      peer?.signal(answer);
    });

    sock.on('signal-ice', ({ candidate, from }) => {
      const peer = ensurePeer(from, false, sock);
      peer?.signal(candidate);
    });

    sock.on('disconnect', () => {
      setConnected(false);
    });

    const onYUpdate = (update, origin) => {
      if (origin === 'remote') return;
      const payload = JSON.stringify({ type: 'y-update', update: Array.from(update) });
      peersRef.current.forEach((peer) => {
        if (peer.connected) {
          peer.send(payload);
        }
      });
    };
    yDocRef.current.on('update', onYUpdate);

    socketRef.current = sock;
    setSocket(sock);

    return () => {
      yDocRef.current.off('update', onYUpdate);
      peersRef.current.forEach((peer) => peer.destroy());
      peersRef.current.clear();
      sock.disconnect();
    };
  }, [user, workspace, ensurePeer]);

  // Sends a document update to all peers in the workspace
  const sendDocUpdate = useCallback((docId, update) => {
    if (socketRef.current && workspace) {
      socketRef.current.emit('doc-update', {
        workspaceId: workspace.id,
        docId,
        update
      });
    }
  }, [workspace]);

  // Sends cursor position to all peers
  const sendCursorUpdate = useCallback((position) => {
    if (socketRef.current && workspace && user) {
      socketRef.current.emit('cursor-update', {
        workspaceId: workspace.id,
        position,
        userName: user.name,
        avatarColor: user.avatar_color
      });
    }
  }, [workspace, user]);

  // Listens for document updates from peers
  const onDocUpdate = useCallback((callback) => {
    if (socketRef.current) {
      socketRef.current.on('doc-update', callback);
      return () => socketRef.current?.off('doc-update', callback);
    }
  }, []);

  // Listens for cursor updates from peers
  const onCursorUpdate = useCallback((callback) => {
    if (socketRef.current) {
      socketRef.current.on('cursor-update', callback);
      return () => socketRef.current?.off('cursor-update', callback);
    }
  }, []);

  return {
    socket: socketRef.current,
    connected,
    presenceList,
    sharedDoc: yDocRef.current,
    sendDocUpdate,
    sendCursorUpdate,
    onDocUpdate,
    onCursorUpdate
  };
}
