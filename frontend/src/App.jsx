// Root App component — handles routing and layout
import React from 'react';
import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
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

export default function App() {
  const { user, workspace, theme, setWorkspace, setRemoteMode } = useStore();
  const [sessionReady, setSessionReady] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(false);

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
  }, [setRemoteMode, setWorkspace]);

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
          backgroundColor: '#111111',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        className={theme === 'light' ? 'light-mode' : ''}
      >
        <div style={{ color: '#999999', fontSize: '13px' }}>Loading workspace session...</div>
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
          backgroundColor: '#111111'
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

  // Settings remains available when user profile is missing in the active session.
  if (!user || !workspace) {
    return <Navigate to="/settings" />;
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        backgroundColor: '#111111'
      }}
      className={theme === 'light' ? 'light-mode' : ''}
    >
      <Sidebar />
      <div
        style={{
          marginLeft: '220px',
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
            backgroundColor: '#111111'
          }}
        >
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
        </main>
      </div>
    </div>
  );
}
