// Manages a socket.io connection to the workspace room for real-time collaboration events.
import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { API_BASE } from '../utils/apiClient';

let sharedSocket = null;
let sharedSocketRefCount = 0;

function getOrCreateSocket() {
  if (!sharedSocket || sharedSocket.disconnected) {
    const url = API_BASE || window.location.origin;
    sharedSocket = io(url, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      withCredentials: false
    });
  }
  return sharedSocket;
}

/**
 * Joins the workspace socket room and returns a ref to the shared socket.
 *
 * @param {string|null} workspaceId
 * @param {object|null} user
 */
export default function useWorkspaceSocket(workspaceId, user) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!workspaceId) return undefined;

    const socket = getOrCreateSocket();
    socketRef.current = socket;
    sharedSocketRefCount++;

    function joinRoom() {
      socket.emit('join-workspace', {
        workspaceId,
        userName: user?.name || 'Teammate',
        userId: user?.id,
        avatarColor: user?.avatar_color || '#E8000D'
      });
    }

    if (socket.connected) joinRoom();
    socket.on('connect', joinRoom);

    return () => {
      socket.off('connect', joinRoom);
      sharedSocketRefCount--;
      if (sharedSocketRefCount <= 0) {
        sharedSocketRefCount = 0;
        socket.disconnect();
        sharedSocket = null;
      }
    };
  }, [workspaceId, user?.id, user?.name, user?.avatar_color]);

  return socketRef;
}
