// TopBar — shows workspace name, AMD status badge, and peer count
import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import useStore from '../../store/useStore';
import { detectAMD } from '../../utils/amdDetect';
import { startPeerPolling, stopPeerPolling } from '../../utils/lanDiscovery';

export default function TopBar() {
  const { aiStatus, setAiStatus, peers, setPeers, workspace, setCommandPaletteOpen } = useStore();
  const [searchHover, setSearchHover] = useState(false);

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
        backgroundColor: '#111111',
        borderBottom: '1px solid #242424',
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
      <div style={{ fontSize: '14px', fontWeight: '500', color: '#F0F0F0', flex: 'none' }}>
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
          backgroundColor: '#1A1A1A',
          border: `1px solid ${searchHover ? '#444444' : '#333333'}`,
          borderRadius: '6px',
          padding: '6px 12px',
          cursor: 'pointer',
          transition: 'border-color 150ms'
        }}
      >
        <Search size={13} color="#666666" />
        <span style={{ fontSize: '12px', color: '#666666' }}>Search workspace...</span>
        <span
          style={{
            fontSize: '10px',
            color: '#666666',
            backgroundColor: '#2A2A2A',
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
        {aiStatus?.gpuDetected || aiStatus?.rocmAvailable ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'rgba(232,0,13,0.08)',
              border: '1px solid rgba(232,0,13,0.2)',
              borderRadius: '4px',
              padding: '2px 8px'
            }}
          >
            <span style={{ fontSize: '11px', fontWeight: '500', color: '#E8000D' }}>⚡ AMD</span>
          </div>
        ) : (
          <div
            style={{
              backgroundColor: '#1A1A1A',
              border: '1px solid #333333',
              borderRadius: '4px',
              padding: '2px 8px'
            }}
          >
            <span style={{ fontSize: '11px', color: '#666666' }}>CPU Mode</span>
          </div>
        )}

        {peers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                backgroundColor: '#3D9970',
                borderRadius: '50%',
                flexShrink: 0
              }}
            />
            <span style={{ fontSize: '12px', color: '#999999' }}>{peers.length} online</span>
          </div>
        )}

        <button
          onClick={() => setCommandPaletteOpen(true)}
          style={{
            fontSize: '11px',
            color: '#666666',
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
