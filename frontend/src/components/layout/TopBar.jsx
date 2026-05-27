// TopBar — shows workspace name, AMD status badge, and peer count
import React, { useEffect, useState } from 'react';
import { Search, Sun, Moon } from 'lucide-react';
import useStore from '../../store/useStore';
import { detectAMD } from '../../utils/amdDetect';
import { startPeerPolling, stopPeerPolling } from '../../utils/lanDiscovery';
import { OllamaStatusBadge } from './AMDbadge';

export default function TopBar() {
  const { aiStatus, aiActive, setAiStatus, peers, setPeers, workspace, setCommandPaletteOpen } = useStore();
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const [searchHover, setSearchHover] = useState(false);

  useEffect(() => {
    if (window?.electronAPI?.setTitleBarTheme) {
      window.electronAPI.setTitleBarTheme(theme);
    }
  }, [theme]);

  // Fetch AMD/system status once and rely on shared status cache.
  useEffect(() => {
    const fetchStatus = async () => {
      const status = await detectAMD();
      if (status) setAiStatus(status);
    };
    fetchStatus();
  }, [setAiStatus, workspace?.id]);

  // Start peer polling
  useEffect(() => {
    startPeerPolling(setPeers);
    return () => stopPeerPolling();
  }, [setPeers]);

  return (
    <header
      style={{
        height: '48px',
        backgroundColor: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 24px',
        gap: '12px',
        position: 'sticky',
        top: 0,
        zIndex: 30,
        flexShrink: 0
      }}
    >
      <div style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text-primary)', flex: 'none' }}>
        <span>
          {workspace?.name || 'RyFlow'}
        </span>
      </div>

      <button
        onClick={() => setCommandPaletteOpen(true)}
        onMouseEnter={() => setSearchHover(true)}
        onMouseLeave={() => setSearchHover(false)}
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: 'var(--bg-surface)',
          border: `1px solid ${searchHover ? 'var(--border-strong)' : 'var(--border-default)'}`,
          borderRadius: '6px',
          padding: '6px 12px',
          cursor: 'pointer',
          transition: 'border-color 150ms'
        }}
      >
        <Search size={13} color="var(--text-tertiary)" />
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Search workspace...</span>
        <span
          style={{
            fontSize: '10px',
            color: 'var(--text-tertiary)',
            backgroundColor: 'var(--bg-overlay)',
            padding: '1px 5px',
            borderRadius: '3px',
            fontFamily: 'monospace',
            marginLeft: '8px'
          }}
        >
          ⌘K
        </span>
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
        <OllamaStatusBadge />

        {aiStatus?.gpuDetected || aiStatus?.rocmAvailable ? (
          <div
            className={aiActive ? 'amd-active' : ''}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'var(--accent-subtle)',
              border: '1px solid var(--accent-border)',
              borderRadius: '4px',
              padding: '2px 8px'
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: '500', color: 'var(--accent)' }}>⚡ AMD</span>
          </div>
        ) : (
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              borderRadius: '4px',
              padding: '2px 8px'
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>CPU Mode</span>
          </div>
        )}

        <button
          onClick={() =>
            setTheme(theme === 'dark' ? 'light' : 'dark')
          }
          title={theme === 'dark'
            ? 'Switch to light mode'
            : 'Switch to dark mode'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 20,
            padding: '3px',
            cursor: 'pointer',
            flexShrink: 0,
            position: 'relative',
            width: 52,
            height: 26,
            transition: 'border-color 150ms ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor =
              'var(--border-strong)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor =
              'var(--border-default)';
          }}
        >
          <span style={{
            position: 'absolute',
            left: 7,
            display: 'flex',
            alignItems: 'center',
            color: theme === 'dark'
              ? 'var(--text-tertiary)'
              : 'var(--accent)',
            transition: 'color 200ms ease'
          }}>
            <Sun size={12} strokeWidth={2} />
          </span>
          <span style={{
            position: 'absolute',
            right: 7,
            display: 'flex',
            alignItems: 'center',
            color: theme === 'dark'
              ? 'var(--text-secondary)'
              : 'var(--text-tertiary)',
            transition: 'color 200ms ease'
          }}>
            <Moon size={11} strokeWidth={2} />
          </span>

          <span style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'var(--accent)',
            position: 'absolute',
            top: 2,
            left: theme === 'dark' ? 'calc(100% - 22px)' : 2,
            transition: 'left 200ms ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {theme === 'dark'
              ? <Moon size={10} color="white" strokeWidth={2} />
              : <Sun size={10} color="white" strokeWidth={2} />
            }
          </span>
        </button>

        {peers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                backgroundColor: 'var(--status-success)',
                borderRadius: '50%',
                flexShrink: 0
              }}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{peers.length} online</span>
          </div>
        )}

        <button
          onClick={() => setCommandPaletteOpen(true)}
          style={{
            fontSize: '11px',
            color: 'var(--text-tertiary)',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          Search
        </button>
      </div>
    </header>
  );
}
