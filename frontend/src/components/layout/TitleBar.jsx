import React, { useEffect, useState } from 'react';
import { Minus, Square, X } from 'lucide-react';

const isElectron = Boolean(window?.electronAPI?.isElectron);

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isElectron) return undefined;

    window.electronAPI.isMaximized().then(setIsMaximized).catch(() => {});
    const unsubscribe = window.electronAPI.onMaximizeChanged(setIsMaximized);

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  if (!isElectron) return null;

  return (
    <div
      style={{
        height: '40px',
        background: '#1A1A1A',
        borderBottom: '1px solid #2A2A2A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        WebkitAppRegion: 'drag',
        userSelect: 'none',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999
      }}
    >
      <div
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#F0F0F0',
          letterSpacing: '0.3px'
        }}
      >
        RyFlow
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          WebkitAppRegion: 'no-drag'
        }}
      >
        <button
          onClick={() => window.electronAPI.minimize()}
          style={buttonStyle}
          aria-label="Minimize"
          title="Minimize"
        >
          <Minus size={15} />
        </button>

        <button
          onClick={() => window.electronAPI.maximize()}
          style={buttonStyle}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          <Square size={13} />
        </button>

        <button
          onClick={() => window.electronAPI.close()}
          style={{ ...buttonStyle, color: '#E35D5D' }}
          aria-label="Close"
          title="Close"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

const buttonStyle = {
  width: '28px',
  height: '24px',
  border: 'none',
  borderRadius: '5px',
  background: 'transparent',
  color: '#CFCFCF',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'all 0.15s ease'
};
