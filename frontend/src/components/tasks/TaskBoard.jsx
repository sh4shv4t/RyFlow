// TaskBoard — Kanban board with optimistic updates and animated new tasks.
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Edit3, Calendar, User, GripVertical } from 'lucide-react';
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

// Normalizes status values between UI and backend variants.
function normalizeStatus(status) {
  return status === 'in-progress' ? 'in_progress' : (status || 'todo');
}

export default function TaskBoard({ tasks: externalTasks = [], onChange, onRefresh }) {
  const { workspace } = useStore();
  const [localTasks, setLocalTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState(null);
  const [draggedTask, setDraggedTask] = useState(null);
  const [newTaskIds, setNewTaskIds] = useState(new Set());

  // Fetches initial tasks for the current workspace.
  const fetchTasks = useCallback(async () => {
    if (!workspace) return;
    try {
      const res = await axios.get('/api/tasks', {
        params: { workspace_id: workspace.id }
      });
      const fetched = (res.data.tasks || []).map((task) => ({ ...task, status: normalizeStatus(task.status) }));
      setLocalTasks(fetched);
      onChange && onChange(fetched);
    } catch {
      toast.error('Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [workspace, onChange]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Merges new tasks from parent state into local board state.
  useEffect(() => {
    if (!Array.isArray(externalTasks)) return;
    setLocalTasks((prev) => {
      const existingIds = new Set(prev.map((t) => t.id));
      const normalizedIncoming = externalTasks.map((task) => ({ ...task, status: normalizeStatus(task.status) }));
      const genuinelyNew = normalizedIncoming.filter((task) => !existingIds.has(task.id));
      if (genuinelyNew.length > 0) {
        setNewTaskIds((ids) => new Set([...ids, ...genuinelyNew.map((t) => t.id)]));
        setTimeout(() => {
          setNewTaskIds((ids) => {
            const next = new Set(ids);
            genuinelyNew.forEach((task) => next.delete(task.id));
            return next;
          });
        }, 2000);
      }
      const mergedMap = new Map(prev.map((task) => [task.id, task]));
      normalizedIncoming.forEach((task) => mergedMap.set(task.id, { ...mergedMap.get(task.id), ...task }));
      return Array.from(mergedMap.values());
    });
  }, [externalTasks]);

  // Optimistically updates task status then syncs in background.
  const updateTaskStatus = useCallback(async (taskId, newStatus) => {
    const previous = [...localTasks];
    const normalized = normalizeStatus(newStatus);
    setLocalTasks((prev) => prev.map((task) => task.id === taskId ? { ...task, status: normalized } : task));
    try {
      await axios.patch(`/api/tasks/${taskId}`, { status: normalized });
    } catch {
      setLocalTasks(previous);
      toast.error('Failed to move task. Reverted.');
    }
  }, [localTasks]);

  // Optimistically deletes a task card then syncs in background.
  const deleteTask = useCallback(async (taskId) => {
    const previous = [...localTasks];
    setLocalTasks((prev) => prev.filter((task) => task.id !== taskId));
    try {
      await axios.delete(`/api/tasks/${taskId}`);
      onChange && onChange(previous.filter((task) => task.id !== taskId));
    } catch {
      setLocalTasks(previous);
      toast.error('Failed to delete task. Reverted.');
    }
  }, [localTasks, onChange]);

  // Creates a new blank task in todo column.
  const createTask = useCallback(async () => {
    if (!workspace) return;
    try {
      const res = await axios.post('/api/tasks', {
        workspace_id: workspace.id,
        title: 'New Task',
        status: 'todo',
        priority: 'medium'
      });
      const created = { ...res.data, status: normalizeStatus(res.data.status) };
      setLocalTasks((prev) => [created, ...prev]);
      setNewTaskIds((ids) => new Set([...ids, created.id]));
      setTimeout(() => {
        setNewTaskIds((ids) => {
          const next = new Set(ids);
          next.delete(created.id);
          return next;
        });
      }, 2000);
      setEditingTask(created.id);
      onChange && onChange([created, ...localTasks]);
      toast.success('Task created');
    } catch {
      toast.error('Failed to create task');
    }
  }, [workspace, onChange, localTasks]);

  // Optimistically patches a task locally and syncs with backend.
  const updateTask = useCallback(async (taskId, updates) => {
    const previous = [...localTasks];
    const normalizedUpdates = {
      ...updates,
      ...(updates.status ? { status: normalizeStatus(updates.status) } : {})
    };
    setLocalTasks((prev) => prev.map((task) => task.id === taskId ? { ...task, ...normalizedUpdates } : task));
    try {
      await axios.patch(`/api/tasks/${taskId}`, normalizedUpdates);
    } catch {
      setLocalTasks(previous);
      toast.error('Failed to update task. Reverted.');
    }
  }, [localTasks]);

  // Handles drop target status updates.
  const handleDrop = useCallback((status) => {
    const normalized = normalizeStatus(status);
    if (draggedTask && normalizeStatus(draggedTask.status) !== normalized) {
      updateTaskStatus(draggedTask.id, normalized);
    }
    setDraggedTask(null);
  }, [draggedTask, updateTaskStatus]);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-4 h-full">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass-card p-4">
            <div className="skeleton-loader h-6 w-24 mb-4" />
            {[1, 2, 3].map((j) => (
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
        const columnTasks = localTasks.filter((task) => normalizeStatus(task.status) === col.id);
        return (
          <div
            key={col.id}
            className={`glass-card p-4 flex flex-col ${draggedTask ? 'border-dashed border-2 border-white/10' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(col.id)}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                <h3 className="font-heading font-semibold text-sm text-amd-white">{col.label}</h3>
                <span className="text-xs text-amd-white/40 bg-white/5 px-2 py-0.5 rounded-full">{columnTasks.length}</span>
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

            <div className="flex-1 overflow-auto space-y-2">
              <AnimatePresence>
                {columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isNew={newTaskIds.has(task.id)}
                    editing={editingTask === task.id}
                    onEdit={() => setEditingTask(task.id === editingTask ? null : task.id)}
                    onUpdate={updateTask}
                    onDelete={deleteTask}
                    onDragStart={setDraggedTask}
                    onDragEnd={() => setDraggedTask(null)}
                  />
                ))}
              </AnimatePresence>
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

// Task card with inline editing and new-item animation.
function TaskCard({ task, isNew, editing, onEdit, onUpdate, onDelete, onDragStart, onDragEnd }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');

  useEffect(() => {
    setTitle(task.title || '');
    setDescription(task.description || '');
  }, [task.title, task.description]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3 }}
      exit={{ opacity: 0, scale: 0.95 }}
      draggable
      onDragStart={() => onDragStart(task)}
      onDragEnd={onDragEnd}
      className={`glass-card glass-card-hover p-3 cursor-grab active:cursor-grabbing border ${
        isNew ? 'border-amd-red' : 'border-transparent'
      } transition-colors duration-700`}
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

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
          style={{
            backgroundColor: `${PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium}20`,
            color: PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium
          }}
        >
          {task.priority || 'medium'}
        </span>

        {task.assignee && (
          <span className="flex items-center gap-1 text-[10px] text-amd-white/40">
            <User size={10} /> {task.assignee}
          </span>
        )}

        {task.due_date && (
          <span className="flex items-center gap-1 text-[10px] text-amd-white/40">
            <Calendar size={10} /> {task.due_date}
          </span>
        )}
      </div>

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
                value={task.priority || 'medium'}
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
