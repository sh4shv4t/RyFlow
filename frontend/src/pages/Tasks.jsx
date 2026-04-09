// Tasks page — Kanban board + natural language task creation
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import TaskBoard from '../components/tasks/TaskBoard';
import NLTaskInput from '../components/tasks/NLTaskInput';
import { TaskCardSkeleton } from '../components/shared/Skeleton';
import { waitForMinimumLoading } from '../utils/loadingDelay';

export default function Tasks() {
  const { workspace } = useStore();
  const [tasks, setTasks] = useState([]);
  const [isLoadingTasks, setIsLoadingTasks] =
    useState(true);

  const fetchTasks = useCallback(async () => {
    if (!workspace) {
      setTasks([]);
      setIsLoadingTasks(false);
      return;
    }
    const startedAt = Date.now();
    setIsLoadingTasks(true);
    try {
      const res = await axios.get('/api/tasks', {
        params: { workspace_id: workspace.id }
      });
      setTasks(res.data.tasks || []);
    } catch (err) {
      toast.error('Failed to load tasks');
    } finally {
      await waitForMinimumLoading(startedAt);
      setIsLoadingTasks(false);
    }
  }, [workspace]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Merges newly created tasks into page-level task state immediately.
  const handleTasksCreated = useCallback((newTasks = []) => {
    setTasks((prev) => {
      const existingIds = new Set(prev.map((t) => t.id));
      const genuinelyNew = (newTasks || []).filter((t) => !existingIds.has(t.id));
      return [...genuinelyNew, ...prev];
    });
  }, []);

  // Status counts
  const counts = tasks.reduce(
    (acc, t) => {
      const s = (t.status === 'in-progress' ? 'in_progress' : t.status) || 'todo';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    { todo: 0, in_progress: 0, done: 0 }
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: '#111111',
        padding: '32px 40px'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexShrink: 0,
          marginBottom: '20px'
        }}
      >
        <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#F0F0F0' }}>Tasks</h1>
        <span
          style={{
            backgroundColor: '#1A1A1A',
            border: '1px solid #333333',
            borderRadius: '10px',
            padding: '1px 8px',
            fontSize: '11px',
            color: '#999999'
          }}
        >
          {tasks.length}
        </span>
        <div style={{ marginLeft: 'auto' }}>
          <button
            onClick={() => { setIsLoadingTasks(true); fetchTasks(); }}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              border: '1px solid #333333',
              backgroundColor: '#1A1A1A',
              color: '#999999',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <RefreshCw size={14} className={isLoadingTasks ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <NLTaskInput onTasksCreated={handleTasksCreated} />

      <div style={{ flex: 1, overflow: 'auto', paddingBottom: '16px' }}>
        {isLoadingTasks ? (
          <div style={{
            display: 'flex', gap: 20,
            padding: '0 40px'
          }}>
            {['Todo', 'In Progress', 'Done'].map(col => (
              <div key={col} style={{ width: 280 }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom:
                    '1px solid var(--border-subtle)'
                }}>
                  <div className="skeleton" style={{
                    width: 60, height: 11, borderRadius: 3
                  }} />
                  <div className="skeleton" style={{
                    width: 22, height: 18, borderRadius: 10
                  }} />
                </div>
                {[1,2,3].map(i => (
                  <TaskCardSkeleton key={i} />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <TaskBoard
            tasks={tasks}
            onChange={(updatedTasks) => setTasks(updatedTasks)}
            onRefresh={fetchTasks}
          />
        )}
      </div>
    </motion.div>
  );
}
