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
        background: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
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
          color: 'var(--text-primary)',
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
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-elevated)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-tertiary)';
          }}
          aria-label="Minimize"
          title="Minimize"
        >
          <Minus size={15} />
        </button>

        <button
          onClick={() => window.electronAPI.maximize()}
          style={buttonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-elevated)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-tertiary)';
          }}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          <Square size={13} />
        </button>

        <button
          onClick={() => window.electronAPI.close()}
          style={buttonStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#E8000D';
            e.currentTarget.style.color = '#FFFFFF';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-tertiary)';
          }}
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
  color: 'var(--text-tertiary)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  transition: 'all 0.15s ease'
};
