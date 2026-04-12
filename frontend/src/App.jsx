// Root App component — handles routing and layout
import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import TitleBar from './components/layout/TitleBar';
import CommandPalette from './components/layout/CommandPalette';
import Home from './pages/Home';
import Workspace from './pages/Workspace';
import Editor from './pages/Editor';
import Documents from './pages/Documents';
import Tasks from './pages/Tasks';
import Graph from './pages/Graph';
import AIStudio from './pages/AIStudio';
import Settings from './pages/Settings';
import CodeEditorPage from './pages/CodeEditorPage';
import CanvasPage from './pages/CanvasPage';
import WorkspaceManager from './pages/WorkspaceManager';
import TagsView from './pages/TagsView';
import useStore from './store/useStore';

function PageTransition({ children }) {
  const location = useLocation();
  const ref = useRef(null);

  // Cursor offset diagnosis (pre-fix): PageTransition animated all routes,
  // and Monaco can misread click coordinates when ancestor transforms/animations are active.
  const skipAnimation =
    location.pathname.startsWith('/code') ||
    location.pathname.startsWith('/canvas');

  useEffect(() => {
    if (skipAnimation) return;
    if (ref.current) {
      ref.current.classList.remove('page-enter');
      void ref.current.offsetWidth;
      ref.current.classList.add('page-enter');
    }
  }, [location.pathname, skipAnimation]);

  return (
    <div
      ref={ref}
      className={skipAnimation ? '' : 'page-enter'}
      style={{
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {children}
    </div>
  );
}

export default function App() {
  const { user, workspace, theme, setWorkspace, setRemoteMode, setUser } = useStore();
  const [sessionReady, setSessionReady] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const isElectron = Boolean(window?.electronAPI?.isElectron);

  // Remove first-launch wizard friction by marking setup complete immediately.
  if (localStorage.getItem('ryflow_setup_complete') !== 'true') {
    localStorage.setItem('ryflow_setup_complete', 'true');
  }

  // Restores active local/remote session from backend so app starts in correct mode.
  useEffect(() => {
    let cancelled = false;

    const bootstrapSession = async () => {
      try {
        const { data } = await axios.get('/api/workspaces/active');
        const active = data?.active;
        if (!active?.workspace_id) {
          if (cancelled) return;
          setHasActiveSession(false);
          setUser(null);
          setWorkspace(null);
          setRemoteMode(false);
          return;
        }

        const workspacePayload = {
          id: active.workspace_id,
          name: active.name,
          description: active.description,
          owner_name: active.owner_name,
          join_code: active.join_code
        };

        if (!cancelled) {
          setWorkspace(workspacePayload);
          setRemoteMode(Boolean(active.is_remote));
          const activeUser = active.active_user;
          if (activeUser?.id && activeUser?.name) {
            setUser(activeUser);
          } else {
            // Keep app usable if user row was never persisted for this workspace.
            setUser({
              id: `session-${active.workspace_id}`,
              name: active.owner_name || 'You',
              workspace_id: active.workspace_id,
              avatar_color: '#E8000D',
              language: 'en'
            });
          }
          setHasActiveSession(true);
        }
      } catch {
        if (!cancelled) {
          setHasActiveSession(false);
        }
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    };

    bootstrapSession();
    return () => { cancelled = true; };
  }, [setRemoteMode, setUser, setWorkspace]);

  useEffect(() => {
    if (!workspace?.id) return;
    axios.get('/api/docs/daily', {
      params: {
        workspace_id: workspace.id,
        date: new Date().toISOString().slice(0, 10)
      }
    }).catch(() => {});
  }, [workspace?.id]);

  // Defers UI routing until active session status is fetched.
  if (!sessionReady) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100vh',
          width: '100vw',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-base)',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        className={theme === 'light' ? 'light-mode' : ''}
      >
        <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Loading workspace session...</div>
      </div>
    );
  }

  // Routes to workspace manager when no active session exists.
  if (!hasActiveSession) {
    return (
      <div
        style={{
          display: 'flex',
          height: '100vh',
          width: '100vw',
          overflow: 'hidden',
          backgroundColor: 'var(--bg-base)'
        }}
        className={theme === 'light' ? 'light-mode' : ''}
      >
        <Routes>
          <Route path="/workspaces" element={<WorkspaceManager />} />
          <Route path="*" element={<Navigate to="/workspaces" />} />
        </Routes>
      </div>
    );
  }

  if (!workspace) {
    return <Navigate to="/workspaces" replace />;
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-base)'
      }}
      className={theme === 'light' ? 'light-mode' : ''}
    >
      {isElectron && <TitleBar />}
      <Sidebar />
      <div
        style={{
          marginLeft: '220px',
          marginTop: isElectron ? '40px' : 0,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0
        }}
      >
        <TopBar />
        <CommandPalette />
        <main
          style={{
            flex: 1,
            overflowY: 'auto',
            backgroundColor: 'var(--bg-base)'
          }}
        >
          <PageTransition>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/workspace" element={<Workspace />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/editor" element={<Navigate to="/documents" replace />} />
              <Route path="/editor/:id" element={<Editor />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/graph" element={<Graph />} />
              <Route path="/ai" element={<AIStudio />} />
              <Route path="/code" element={<CodeEditorPage />} />
              <Route path="/code/:id" element={<CodeEditorPage />} />
              <Route path="/canvas" element={<CanvasPage />} />
              <Route path="/canvas/:id" element={<CanvasPage />} />
              <Route path="/tags" element={<TagsView />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/workspaces" element={<WorkspaceManager />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </PageTransition>
        </main>
      </div>
    </div>
  );
}
