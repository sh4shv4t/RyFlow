// Tasks page — Kanban board + natural language task creation
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';
import TaskBoard from '../components/tasks/TaskBoard';
import NLTaskInput from '../components/tasks/NLTaskInput';

export default function Tasks() {
  const { workspace } = useStore();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!workspace) return;
    try {
      const res = await axios.get('/api/tasks', {
        params: { workspace_id: workspace.id }
      });
      setTasks(res.data.tasks || []);
    } catch (err) {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Status counts
  const counts = tasks.reduce(
    (acc, t) => {
      const s = t.status || 'todo';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    { todo: 0, 'in-progress': 0, done: 0 }
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full gap-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold text-amd-white">Tasks</h1>
          <p className="text-sm text-amd-white/40 mt-0.5">
            {tasks.length} total &middot; {counts.todo} to-do &middot; {counts['in-progress']} in progress &middot; {counts.done} done
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchTasks(); }}
          className="p-2 rounded-lg text-amd-white/40 hover:text-amd-white hover:bg-white/5 transition-all"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* NL input */}
      <NLTaskInput onTasksCreated={fetchTasks} />

      {/* Board */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="grid grid-cols-3 gap-4 h-full">
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton-loader rounded-xl h-64" />
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
