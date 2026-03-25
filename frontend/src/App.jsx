// Root App component — handles routing and layout
import React from 'react';
import { useEffect } from 'react';
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
import WorkspaceSetup from './components/workspace/WorkspaceSetup';
import useStore from './store/useStore';

export default function App() {
  const { user, workspace, theme } = useStore();
  const isOnboarded = localStorage.getItem('ryflow_onboarded') === 'true';

  useEffect(() => {
    if (!workspace?.id) return;
    axios.get('/api/docs/daily', {
      params: {
        workspace_id: workspace.id,
        date: new Date().toISOString().slice(0, 10)
      }
    }).catch(() => {});
  }, [workspace?.id]);

  // Show onboarding only on first launch or when core profile data is missing.
  if (!isOnboarded || !user || !workspace) {
    return (
      <div className={theme === 'light' ? 'light-mode' : ''}>
        <WorkspaceSetup />
      </div>
    );
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
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
