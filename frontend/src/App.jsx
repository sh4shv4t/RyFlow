// Root App component — handles routing and layout
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Home from './pages/Home';
import Workspace from './pages/Workspace';
import Editor from './pages/Editor';
import Tasks from './pages/Tasks';
import Graph from './pages/Graph';
import AIStudio from './pages/AIStudio';
import Settings from './pages/Settings';
import WorkspaceSetup from './components/workspace/WorkspaceSetup';
import useStore from './store/useStore';

export default function App() {
  const { user, workspace, theme } = useStore();

  // Show onboarding if no user/workspace configured
  if (!user || !workspace) {
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
        <main className="flex-1 overflow-auto p-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/editor" element={<Editor />} />
            <Route path="/editor/:id" element={<Editor />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/graph" element={<Graph />} />
            <Route path="/ai" element={<AIStudio />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
