// React app entry point — mounts the root App component
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import App from './App';
import './index.css';
import 'tippy.js/dist/tippy.css';
import { configureApiClient } from './utils/apiClient';

// Use an explicit backend origin when running from Electron/file protocol.
if (window.location.protocol === 'file:' || window.electronAPI?.isElectron) {
  axios.defaults.baseURL = 'http://localhost:3001';
}

// Configures API auth/disconnect interceptors once at startup.
configureApiClient();

// Apply theme immediately to avoid flash.
const savedTheme =
  localStorage.getItem('ryflow_theme') || 'dark';
document.documentElement.setAttribute(
  'data-theme', savedTheme
);
document.documentElement.style.background =
  savedTheme === 'light' ? '#F7F6F2' : '#111111';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="bottom-right"
        gutter={8}
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--bg-overlay)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
            borderRadius: '6px',
            fontSize: '13px',
            padding: '10px 14px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            fontFamily: 'Inter, sans-serif'
          },
          success: {
            iconTheme: {
              primary: 'var(--status-success)',
              secondary: 'var(--bg-overlay)'
            },
            style: {
              borderLeft: '3px solid var(--status-success)'
            }
          },
          error: {
            iconTheme: {
              primary: 'var(--status-error)',
              secondary: 'var(--bg-overlay)'
            },
            style: {
              borderLeft: '3px solid var(--status-error)'
            }
          }
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
