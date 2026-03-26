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
import Tasks from './pages/Tasks';
import Graph from './pages/Graph';
import AIStudio from './pages/AIStudio';
import Settings from './pages/Settings';
import CodeEditorPage from './pages/CodeEditorPage';
import CanvasPage from './pages/CanvasPage';
import Tags from './pages/Tags';
import WorkspaceManager from './pages/WorkspaceManager';
import useStore from './store/useStore';

export default function App() {
  const { user, workspace, theme, setWorkspace, setRemoteMode } = useStore();
  const [sessionReady, setSessionReady] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const isOnboarded = localStorage.getItem('ryflow_onboarded') === 'true';

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
      <div className={`h-screen w-screen flex items-center justify-center bg-amd-charcoal ${theme === 'light' ? 'light-mode' : ''}`}>
        <div className="text-amd-white/60 text-sm">Loading workspace session...</div>
      </div>
    );
  }

  // Routes to workspace manager when no active session exists.
  if (!hasActiveSession) {
    return (
      <div className={`min-h-screen bg-amd-charcoal p-6 ${theme === 'light' ? 'light-mode' : ''}`}>
        <Routes>
          <Route path="/workspaces" element={<WorkspaceManager />} />
          <Route path="*" element={<Navigate to="/workspaces" />} />
        </Routes>
      </div>
    );
  }

  // Preserves existing onboarding gate once a workspace session is active.
  if (!isOnboarded || !user || !workspace) {
    return <Navigate to="/settings" />;
  }

  return (
    <div className={`flex h-screen w-screen overflow-hidden bg-amd-charcoal ${theme === 'light' ? 'light-mode' : ''}`}>
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <CommandPalette />
        <main className="flex-1 overflow-auto p-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/editor" element={<Editor />} />
            <Route path="/editor/:id" element={<Editor />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/graph" element={<Graph />} />
            <Route path="/ai" element={<AIStudio />} />
            <Route path="/code" element={<CodeEditorPage />} />
            <Route path="/code/:id" element={<CodeEditorPage />} />
            <Route path="/canvas" element={<CanvasPage />} />
            <Route path="/canvas/:id" element={<CanvasPage />} />
            <Route path="/tags" element={<Tags />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/workspaces" element={<WorkspaceManager />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
