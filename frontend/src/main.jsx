// React app entry point — mounts the root App component
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: 'toast-custom',
          duration: 4000,
          style: {
            background: '#2C2C2C',
            color: '#F5F5F0',
            border: '1px solid rgba(245, 245, 240, 0.1)',
          },
          success: {
            iconTheme: { primary: '#00C853', secondary: '#F5F5F0' },
          },
          error: {
            iconTheme: { primary: '#E8000D', secondary: '#F5F5F0' },
          },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
