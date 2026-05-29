// TaskBoard — Kanban board with optimistic updates, animated new tasks, and LAN sync.
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Edit3, GripVertical } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import useStore from '../../store/useStore';
import useWorkspaceSocket from '../../hooks/useWorkspaceSocket';
import { formatDueDate } from '../../utils/time';
import { getContentSummary, getItemTitle } from '../../utils/content';

const COLUMNS = [
  { id: 'todo', label: 'Todo' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' }
];

// Normalizes status values between UI and backend variants.
function normalizeStatus(status) {
  return status === 'in-progress' ? 'in_progress' : (status || 'todo');
}

export default function TaskBoard({ tasks: externalTasks = [], onChange, onRefresh }) {
  const { workspace, user, remoteMode } = useStore();
  const socketRef = useWorkspaceSocket(remoteMode ? workspace?.id : null, user);
  const [localTasks, setLocalTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState(null);
  const [draggedTask, setDraggedTask] = useState(null);
  const [newTaskIds, setNewTaskIds] = useState(new Set());

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !remoteMode) return undefined;

    function onRemoteTaskCreated(task) {
      setLocalTasks((prev) => {
        if (prev.some((t) => t.id === task.id)) return prev;
        const normalized = { ...task, status: normalizeStatus(task.status) };
        setNewTaskIds((ids) => new Set([...ids, normalized.id]));
        setTimeout(() => {
          setNewTaskIds((ids) => {
            const next = new Set(ids);
            next.delete(normalized.id);
            return next;
          });
        }, 2000);
        return [normalized, ...prev];
      });
    }

    function onRemoteTaskUpdated(task) {
      setLocalTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, ...task, status: normalizeStatus(task.status ?? t.status) } : t))
      );
    }

    function onRemoteTaskDeleted({ taskId }) {
      setLocalTasks((prev) => prev.filter((t) => t.id !== taskId));
    }

    socket.on('task-created', onRemoteTaskCreated);
    socket.on('task-updated', onRemoteTaskUpdated);
    socket.on('task-deleted', onRemoteTaskDeleted);

    return () => {
      socket.off('task-created', onRemoteTaskCreated);
      socket.off('task-updated', onRemoteTaskUpdated);
      socket.off('task-deleted', onRemoteTaskDeleted);
    };
  }, [socketRef, remoteMode]);

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
      socketRef.current?.emit('task-updated', { workspaceId: workspace?.id, task: { id: taskId, status: normalized } });
      onRefresh && onRefresh();
    } catch {
      setLocalTasks(previous);
      toast.error('Failed to move task. Reverted.');
    }
  }, [localTasks, onRefresh, socketRef, workspace?.id]);

  // Optimistically deletes a task card then syncs in background.
  const deleteTask = useCallback(async (taskId) => {
    const previous = [...localTasks];
    const next = previous.filter((task) => task.id !== taskId);
    setLocalTasks(next);
    try {
      await axios.delete(`/api/tasks/${taskId}`);
      socketRef.current?.emit('task-deleted', { workspaceId: workspace?.id, taskId });
      onChange && onChange(next);
    } catch {
      setLocalTasks(previous);
      toast.error('Failed to delete task. Reverted.');
    }
  }, [localTasks, onChange, socketRef, workspace?.id]);

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
      const next = [created, ...localTasks];
      setLocalTasks(next);
      setNewTaskIds((ids) => new Set([...ids, created.id]));
      setTimeout(() => {
        setNewTaskIds((ids) => {
          const mutable = new Set(ids);
          mutable.delete(created.id);
          return mutable;
        });
      }, 2000);
      setEditingTask(created.id);
      socketRef.current?.emit('task-created', { workspaceId: workspace.id, task: created });
      onChange && onChange(next);
      toast.success('Task created');
    } catch {
      toast.error('Failed to create task');
    }
  }, [workspace, onChange, localTasks, socketRef]);

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
      socketRef.current?.emit('task-updated', { workspaceId: workspace?.id, task: { id: taskId, ...normalizedUpdates } });
    } catch {
      setLocalTasks(previous);
      toast.error('Failed to update task. Reverted.');
    }
  }, [localTasks, socketRef, workspace?.id]);

  // Handles drop target status updates.
  const handleDrop = useCallback((status) => {
    const normalized = normalizeStatus(status);
    if (draggedTask && normalizeStatus(draggedTask.status) !== normalized) {
      updateTaskStatus(draggedTask.id, normalized);
    }
    setDraggedTask(null);
  }, [draggedTask, updateTaskStatus]);

  if (loading) return null;

  return (
    <div style={{ display: 'flex', gap: '20px', flex: 1, overflow: 'auto', paddingBottom: '16px' }}>
      {COLUMNS.map((col) => {
        const columnTasks = localTasks.filter((task) => normalizeStatus(task.status) === col.id);
        return (
          <div
            key={col.id}
            style={{ width: '280px', minWidth: '280px', display: 'flex', flexDirection: 'column' }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(col.id)}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '10px',
                paddingBottom: '8px',
                borderBottom: '1px solid var(--border-subtle)'
              }}
            >
              <p
                style={{
                  fontSize: '11px',
                  fontWeight: '500',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-secondary)',
                  flex: 1
                }}
              >
                {col.label}
              </p>
              <span
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderRadius: '10px',
                  padding: '1px 7px',
                  fontSize: '11px',
                  color: 'var(--text-tertiary)'
                }}
              >
                {columnTasks.length}
              </span>
              {col.id === 'todo' && (
                <button
                  onClick={createTask}
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '4px',
                    border: '1px solid var(--border-default)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Plus size={12} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, overflowY: 'auto' }}>
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
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', padding: '8px 0' }}>
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
      className="card-hover"
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3 }}
      exit={{ opacity: 0, scale: 0.95 }}
      draggable
      onDragStart={() => onDragStart(task)}
      onDragEnd={onDragEnd}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-default)';
        e.currentTarget.style.backgroundColor = 'var(--bg-elevated)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isNew ? 'var(--border-default)' : 'var(--border-subtle)';
        e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
      }}
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: `1px solid ${isNew ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        borderRadius: '6px',
        padding: '12px 14px',
        cursor: 'grab',
        transition: 'border-color 150ms ease'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
          <GripVertical size={12} color="var(--text-tertiary)" style={{ flexShrink: 0 }} />
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => onUpdate(task.id, { title })}
              onKeyDown={(e) => e.key === 'Enter' && onUpdate(task.id, { title })}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                outline: 'none'
              }}
              autoFocus
            />
          ) : (
            <span
              style={{
                fontSize: '13px',
                fontWeight: '500',
                color: 'var(--text-primary)',
                lineHeight: '1.4',
                marginBottom: '10px',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}
            >
              {getItemTitle(task)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button onClick={onEdit} style={{ padding: '2px', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
            <Edit3 size={12} />
          </button>
          <button onClick={() => onDelete(task.id)} style={{ padding: '2px', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {!editing && description ? (
        <p
          style={{
            marginTop: '-2px',
            marginBottom: '10px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            lineHeight: '1.45',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}
        >
          {getContentSummary({ description }, 140)}
        </p>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div
          style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            backgroundColor: 'var(--bg-overlay)',
            border: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '9px',
            color: 'var(--text-secondary)',
            fontWeight: '600',
            flexShrink: 0
          }}
        >
          {(task.assignee || 'U').charAt(0).toUpperCase()}
        </div>

        <span
          style={{
            fontSize: '10px',
            fontWeight: '500',
            textTransform: 'uppercase',
            padding: '1px 6px',
            borderRadius: '3px',
            backgroundColor: task.priority === 'high'
              ? 'rgba(192,57,43,0.15)'
              : task.priority === 'medium'
              ? 'rgba(184,92,0,0.15)'
              : 'var(--bg-overlay)',
            color: task.priority === 'high'
              ? '#C0392B'
              : task.priority === 'medium'
              ? '#B85C00'
              : 'var(--text-tertiary)'
          }}
        >
          {task.priority || 'low'}
        </span>

        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: 'auto' }}>{formatDueDate(task.due_date)}</span>
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ marginTop: '10px', overflow: 'hidden' }}
          >
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => onUpdate(task.id, { description })}
              placeholder="Add description..."
              style={{
                width: '100%',
                height: '60px',
                resize: 'none',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '4px',
                padding: '8px',
                fontSize: '12px',
                color: 'var(--text-primary)',
                marginBottom: '8px'
              }}
            />
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              <select
                value={task.priority || 'medium'}
                onChange={(e) => onUpdate(task.id, { priority: e.target.value })}
                style={{
                  fontSize: '11px',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  color: 'var(--text-secondary)',
                  padding: '4px 6px'
                }}
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
                style={{
                  flex: 1,
                  fontSize: '11px',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  color: 'var(--text-secondary)',
                  padding: '4px 6px'
                }}
              />
              <input
                type="date"
                value={task.due_date || ''}
                onChange={(e) => onUpdate(task.id, { due_date: e.target.value })}
                style={{
                  fontSize: '11px',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  color: 'var(--text-secondary)',
                  padding: '4px 6px'
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
