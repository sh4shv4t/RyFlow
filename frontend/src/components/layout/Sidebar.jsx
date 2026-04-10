// Sidebar navigation — minimalist dark sidebar with icon links
import React, { useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, FileText, CheckSquare, Settings, Code2, PenTool,
  Sparkles, CalendarDays, Layers, ChevronDown, Network, Tag
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import { apiFetch } from '../../utils/apiClient';
import { SidebarWorkspaceSkeleton } from '../shared/Skeleton';
import ryflowSquareLogo from '../../../../assets/RyFlow_squarelogo.png';

const navSections = [
  {
    label: 'WORKSPACE',
    items: [
      { to: '/', icon: Home, label: 'Home' },
      { to: '/documents', icon: FileText, label: 'Documents' },
      { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
      { to: '/code', icon: Code2, label: 'Code' },
      { to: '/canvas', icon: PenTool, label: 'Canvas' }
    ]
  },
  {
    label: 'AI',
    items: [
      { to: '/ai', icon: Sparkles, label: 'AI Studio' },
      { to: '/graph', icon: Network, label: 'Knowledge Graph' }
    ]
  },
  {
    label: 'ORGANIZE',
    items: [
      { action: 'daily-note', icon: CalendarDays, label: "Today's Note" },
      { to: '/tags', icon: Tag, label: 'Tags' },
      { to: '/workspaces', icon: Layers, label: 'Workspaces' }
    ]
  }
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { workspace, remoteMode, setRemoteMode, user } = useStore();
  const [workspaceHover, setWorkspaceHover] = useState(false);
  const [hoveredNav, setHoveredNav] = useState('');
  const [settingsHover, setSettingsHover] = useState(false);
  const isElectron = Boolean(window?.electronAPI?.isElectron);

  const userInitial = useMemo(() => {
    return (user?.name || '?').charAt(0).toUpperCase();
  }, [user?.name]);

  const isItemActive = (to) => {
    const path = location.pathname;
    if (to === '/') return path === '/';
    if (to === '/documents') return path === '/documents' || path.startsWith('/editor/');
    if (to === '/code') return path === '/code' || path.startsWith('/code/');
    if (to === '/canvas') return path === '/canvas' || path.startsWith('/canvas/');
    if (to === '/tags') return path === '/tags';
    return path === to;
  };

  // Opens or creates today's daily note and navigates directly to the resolved document id.
  const handleTodaysNote = async (e) => {
    e.preventDefault();

    const workspaceId =
      useStore.getState().workspaceId ||
      localStorage.getItem('ryflow_workspace_id');

    if (!workspaceId) {
      toast('No active workspace', { icon: '⚠️' });
      return;
    }

    try {
      const res = await apiFetch(`/api/docs/daily?workspace_id=${workspaceId}`);

      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }

      const doc = await res.json();

      if (!doc?.id) {
        throw new Error('No document id returned');
      }

      navigate(`/editor/${doc.id}`);
    } catch (err) {
      console.error('[DailyNote]', err.message);
      toast.error('Could not open daily note');
    }
  };

  // Disconnects remote session and falls back to best available local workspace.
  const disconnectRemote = async () => {
    try {
      await axios.post('/api/workspaces/disconnect-remote');
      localStorage.removeItem('ryflow_remote_join_code');
      localStorage.removeItem('ryflow_remote_host');
      localStorage.removeItem('ryflow_remote_port');
      setRemoteMode(false);
      window.location.reload();
    } catch {
      toast.error('Unable to disconnect remote session');
    }
  };

  return (
    <aside
      style={{
        width: '220px',
        minWidth: '220px',
        height: isElectron ? 'calc(100vh - 40px)' : '100vh',
        backgroundColor: 'var(--bg-surface)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: isElectron ? '40px' : 0,
        zIndex: 40,
        borderRight: '1px solid var(--border-subtle)'
      }}
    >
      <div style={{ padding: '16px 12px 8px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '6px'
          }}
        >
          <img
            src={ryflowSquareLogo}
            alt="RyFlow logo"
            style={{
              width: '26px',
              height: '26px',
              borderRadius: '5px',
              objectFit: 'cover',
              flexShrink: 0
            }}
          />
          <span
            style={{
              fontSize: '15px',
              fontWeight: '600',
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em'
            }}
          >
            RyFlow
          </span>
        </div>

        <button
          onClick={() => { window.location.href = '/workspaces'; }}
          onMouseEnter={() => setWorkspaceHover(true)}
          onMouseLeave={() => setWorkspaceHover(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 6px',
            marginLeft: '2px',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'background 150ms ease',
            backgroundColor: workspaceHover ? 'var(--bg-elevated)' : 'transparent',
            border: 'none'
          }}
        >
          {workspace?.name ? (
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-secondary)',
                maxWidth: '140px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {workspace.name}
            </span>
          ) : (
            <SidebarWorkspaceSkeleton />
          )}
          <ChevronDown size={10} color="var(--text-tertiary)" />
        </button>
      </div>

      <nav
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 8px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: '1px'
        }}
      >
        {navSections.map((section) => (
          <div key={section.label} className="fade-in">
            <p
              style={{
                fontSize: '10px',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-tertiary)',
                padding: '0 8px',
                margin: '14px 0 3px'
              }}
            >
              {section.label}
            </p>

            {section.items.map((item) => {
              const active = item.to
                ? isItemActive(item.to)
                : (item.action === 'daily-note' && location.pathname.startsWith('/editor'));
              const hover = hoveredNav === item.to;
              const Icon = item.icon;
              const isHighlighted = active || hover;

              if (item.action === 'daily-note') {
                return (
                  <button
                    key={item.label}
                    className={active ? 'active-nav-item' : ''}
                    onClick={handleTodaysNote}
                    onMouseEnter={() => setHoveredNav(item.label)}
                    onMouseLeave={() => setHoveredNav('')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      height: '32px',
                      padding: active ? '0 8px 0 6px' : '0 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease',
                      width: '100%',
                      border: 'none',
                      background: active ? 'var(--accent-subtle)' : (hoveredNav === item.label ? 'var(--bg-elevated)' : 'transparent'),
                      borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                      textDecoration: 'none'
                    }}
                  >
                    <Icon
                      size={15}
                      color={isHighlighted ? 'var(--text-primary)' : 'var(--text-tertiary)'}
                      style={{ flexShrink: 0 }}
                    />
                    <span
                      style={{
                        fontSize: '13px',
                        color: isHighlighted ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontWeight: active ? '500' : '400'
                      }}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              }

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={active ? 'active-nav-item' : ''}
                  onMouseEnter={() => setHoveredNav(item.to)}
                  onMouseLeave={() => setHoveredNav('')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    height: '32px',
                    padding: active ? '0 8px 0 6px' : '0 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease',
                    width: '100%',
                    border: 'none',
                    background: active ? 'var(--accent-subtle)' : (hover ? 'var(--bg-elevated)' : 'transparent'),
                    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                    textDecoration: 'none'
                  }}
                >
                  <Icon
                    size={15}
                    color={isHighlighted ? 'var(--text-primary)' : 'var(--text-tertiary)'}
                    style={{ flexShrink: 0 }}
                  />
                  <span
                    style={{
                      fontSize: '13px',
                      color: isHighlighted ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: active ? '500' : '400'
                    }}
                  >
                    {item.label}
                  </span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div
        style={{
          padding: '12px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <div
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '50%',
            backgroundColor: 'var(--bg-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-primary)',
              fontWeight: '600'
            }}
          >
            {userInitial}
          </span>
        </div>

        <span
          style={{
            fontSize: '13px',
            color: 'var(--text-secondary)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {user?.name || 'Teammate'}
        </span>

        <NavLink
          to="/settings"
          onMouseEnter={() => setSettingsHover(true)}
          onMouseLeave={() => setSettingsHover(false)}
          style={{
            padding: '4px',
            borderRadius: '4px',
            cursor: 'pointer',
            background: settingsHover ? 'var(--bg-elevated)' : 'transparent',
            border: 'none',
            display: 'flex',
            alignItems: 'center'
          }}
          title={remoteMode ? 'Connected remotely' : 'Settings'}
          onClick={remoteMode ? disconnectRemote : undefined}
        >
          <Settings size={15} color={settingsHover ? 'var(--text-primary)' : 'var(--text-tertiary)'} />
        </NavLink>
      </div>
    </aside>
  );
}
