// Hook for WebRTC peer connections via Socket.io signaling
import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import useStore from '../store/useStore';

const SOCKET_URL = 'http://localhost:3001';

export default function usePeer() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [presenceList, setPresenceList] = useState([]);
  const socketRef = useRef(null);
  const { user, workspace } = useStore();

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
    });

    sock.on('disconnect', () => {
      setConnected(false);
    });

    socketRef.current = sock;
    setSocket(sock);

    return () => {
      sock.disconnect();
    };
  }, [user, workspace]);

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
    sendDocUpdate,
    sendCursorUpdate,
    onDocUpdate,
    onCursorUpdate
  };
}
