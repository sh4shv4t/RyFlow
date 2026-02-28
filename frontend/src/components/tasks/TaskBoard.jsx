// TaskBoard — Kanban board with drag-and-drop columns (Todo, In Progress, Done)
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Trash2, Edit3, Calendar, User, AlertCircle,
  ChevronUp, ChevronDown, GripVertical
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';

const COLUMNS = [
  { id: 'todo', label: 'Todo', color: '#F5F5F0' },
  { id: 'in_progress', label: 'In Progress', color: '#FF6B00' },
  { id: 'done', label: 'Done', color: '#00C853' },
];

const PRIORITY_COLORS = {
  high: '#E8000D',
  medium: '#FF6B00',
  low: '#666',
};

export default function TaskBoard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState(null);
  const [draggedTask, setDraggedTask] = useState(null);
  const { workspace } = useStore();

  // Fetches all tasks for the current workspace
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

  // Updates a task's status (for drag-and-drop column changes)
  const updateTaskStatus = useCallback(async (taskId, newStatus) => {
    try {
      await axios.patch(`/api/tasks/${taskId}`, { status: newStatus });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
      toast.success('Task updated');
    } catch (err) {
      toast.error('Failed to update task');
    }
  }, []);

  // Deletes a task
  const deleteTask = useCallback(async (taskId) => {
    try {
      await axios.delete(`/api/tasks/${taskId}`);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      toast.success('Task deleted');
    } catch (err) {
      toast.error('Failed to delete task');
    }
  }, []);

  // Creates a new blank task
  const createTask = useCallback(async () => {
    if (!workspace) return;
    try {
      const res = await axios.post('/api/tasks', {
        workspace_id: workspace.id,
        title: 'New Task',
        status: 'todo',
        priority: 'medium'
      });
      setTasks(prev => [res.data, ...prev]);
      setEditingTask(res.data.id);
      toast.success('Task created');
    } catch (err) {
      toast.error('Failed to create task');
    }
  }, [workspace]);

  // Updates a task's fields inline
  const updateTask = useCallback(async (taskId, updates) => {
    try {
      await axios.patch(`/api/tasks/${taskId}`, updates);
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t));
    } catch (err) {
      toast.error('Failed to update task');
    }
  }, []);

  // Simple drag and drop handlers
  const handleDragStart = (task) => setDraggedTask(task);
  const handleDragEnd = () => setDraggedTask(null);
  const handleDrop = (status) => {
    if (draggedTask && draggedTask.status !== status) {
      updateTaskStatus(draggedTask.id, status);
    }
    setDraggedTask(null);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-4 h-full">
        {[1, 2, 3].map(i => (
          <div key={i} className="glass-card p-4">
            <div className="skeleton-loader h-6 w-24 mb-4" />
            {[1, 2, 3].map(j => (
              <div key={j} className="skeleton-loader-red h-24 w-full mb-3 rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4 h-full">
      {COLUMNS.map((col) => {
        const columnTasks = tasks.filter(t => t.status === col.id);
        return (
          <div
            key={col.id}
            className={`glass-card p-4 flex flex-col ${
              draggedTask ? 'border-dashed border-2 border-white/10' : ''
            }`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(col.id)}
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                <h3 className="font-heading font-semibold text-sm text-amd-white">{col.label}</h3>
                <span className="text-xs text-amd-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                  {columnTasks.length}
                </span>
              </div>
              {col.id === 'todo' && (
                <button
                  onClick={createTask}
                  className="p-1 rounded hover:bg-white/5 text-amd-white/40 hover:text-amd-white"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>

            {/* Task cards */}
            <div className="flex-1 overflow-auto space-y-2">
              <AnimatePresence>
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    editing={editingTask === task.id}
                    onEdit={() => setEditingTask(task.id === editingTask ? null : task.id)}
                    onUpdate={updateTask}
                    onDelete={deleteTask}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </AnimatePresence>

              {/* Empty state */}
              {columnTasks.length === 0 && (
                <div className="text-center py-8 text-amd-white/20 text-xs">
                  {col.id === 'todo' ? 'Add a task to get started' : 'Drag tasks here'}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Individual task card component with inline editing
function TaskCard({ task, editing, onEdit, onUpdate, onDelete, onDragStart, onDragEnd }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      draggable
      onDragStart={() => onDragStart(task)}
      onDragEnd={onDragEnd}
      className="glass-card glass-card-hover p-3 cursor-grab active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-1">
          <GripVertical size={14} className="text-amd-white/20 flex-shrink-0" />
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => onUpdate(task.id, { title })}
              onKeyDown={(e) => e.key === 'Enter' && onUpdate(task.id, { title })}
              className="flex-1 bg-transparent border-b border-amd-red/30 text-sm text-amd-white outline-none"
              autoFocus
            />
          ) : (
            <span className="text-sm text-amd-white font-medium">{task.title}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="p-0.5 text-amd-white/30 hover:text-amd-white">
            <Edit3 size={12} />
          </button>
          <button onClick={() => onDelete(task.id)} className="p-0.5 text-amd-white/30 hover:text-amd-red">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Task metadata */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {/* Priority badge */}
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
          style={{
            backgroundColor: PRIORITY_COLORS[task.priority] + '20',
            color: PRIORITY_COLORS[task.priority]
          }}
        >
          {task.priority}
        </span>

        {/* Assignee */}
        {task.assignee && (
          <span className="flex items-center gap-1 text-[10px] text-amd-white/40">
            <User size={10} /> {task.assignee}
          </span>
        )}

        {/* Due date */}
        {task.due_date && (
          <span className="flex items-center gap-1 text-[10px] text-amd-white/40">
            <Calendar size={10} /> {task.due_date}
          </span>
        )}
      </div>

      {/* Expanded editing mode */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-3 space-y-2 overflow-hidden"
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => onUpdate(task.id, { description })}
              placeholder="Add description..."
              className="w-full bg-black/20 rounded p-2 text-xs text-amd-white/70 outline-none resize-none h-16"
            />
            <div className="flex gap-2">
              <select
                value={task.priority}
                onChange={(e) => onUpdate(task.id, { priority: e.target.value })}
                className="text-xs bg-black/20 rounded px-2 py-1 text-amd-white outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <input
                type="text"
                value={task.assignee || ''}
                onChange={(e) => onUpdate(task.id, { assignee: e.target.value })}
                placeholder="Assignee"
                className="text-xs bg-black/20 rounded px-2 py-1 text-amd-white outline-none flex-1"
              />
              <input
                type="date"
                value={task.due_date || ''}
                onChange={(e) => onUpdate(task.id, { due_date: e.target.value })}
                className="text-xs bg-black/20 rounded px-2 py-1 text-amd-white outline-none"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
