// API client helpers for remote join-code injection and graceful remote disconnect handling.
import axios from 'axios';
import toast from 'react-hot-toast';

// Resolves API base URL for browser vs Electron/file protocol.
export const API_BASE = (window.location.protocol === 'file:' || window.electronAPI?.isElectron)
  ? 'http://localhost:3001'
  : '';

let disconnectHandled = false;

// Returns true when frontend session is connected to a remote workspace.
function isRemoteMode() {
  return localStorage.getItem('ryflow_is_remote') === 'true';
}

// Returns stored remote join code used by host authorization middleware.
function getRemoteJoinCode() {
  return localStorage.getItem('ryflow_remote_join_code') || '';
}

// Clears local storage keys that represent active remote session state.
function clearRemoteSession() {
  localStorage.removeItem('ryflow_remote_join_code');
  localStorage.removeItem('ryflow_remote_host');
  localStorage.removeItem('ryflow_remote_port');
  localStorage.setItem('ryflow_is_remote', 'false');
}

// Handles remote host disconnect by notifying user and redirecting to workspace manager.
function handleRemoteDisconnect() {
  if (disconnectHandled) return;
  disconnectHandled = true;
  toast('⚠️ Lost connection to remote workspace. Switching to local workspaces.', { icon: '⚠️' });
  clearRemoteSession();
  setTimeout(() => {
    window.location.href = '/workspaces';
  }, 2000);
}

// Wraps fetch with automatic join-code headers and remote disconnect handling.
export async function apiFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (isRemoteMode() && getRemoteJoinCode()) {
    headers['x-join-code'] = getRemoteJoinCode();
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers
    });

    if (isRemoteMode() && response.status === 502) {
      handleRemoteDisconnect();
    }

    return response;
  } catch (err) {
    if (isRemoteMode()) {
      handleRemoteDisconnect();
    }
    throw err;
  }
}

// Configures axios defaults and interceptors for remote auth and disconnect behavior.
export function configureApiClient() {
  axios.defaults.baseURL = API_BASE;

  axios.interceptors.request.use((config) => {
    if (isRemoteMode() && getRemoteJoinCode()) {
      config.headers = config.headers || {};
      config.headers['x-join-code'] = getRemoteJoinCode();
    }
    return config;
  });

  axios.interceptors.response.use(
    (response) => {
      if (isRemoteMode() && response.status === 502) {
        handleRemoteDisconnect();
      }
      return response;
    },
    (error) => {
      const status = error?.response?.status;
      if (isRemoteMode() && (!error.response || status === 502)) {
        handleRemoteDisconnect();
      }
      return Promise.reject(error);
    }
  );
}
