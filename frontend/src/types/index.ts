// Core RyFlow types — use these in new TS files

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  owner_name: string;
  join_code: string;
  is_local: number;
  last_accessed?: string;
  created_at: string;
}

export interface Document {
  id: string;
  workspace_id: string;
  title: string;
  content?: string;
  created_by?: string;
  version_number?: number;
  updated_at: string;
  created_at: string;
}

export interface Task {
  id: string;
  workspace_id: string;
  title: string;
  description?: string;
  assignee?: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'high' | 'medium' | 'low';
  due_date?: string;
  created_at: string;
}

export interface CodeFile {
  id: string;
  workspace_id: string;
  title: string;
  content?: string;
  language: string;
  created_by?: string;
  updated_at: string;
  created_at: string;
}

export interface Canvas {
  id: string;
  workspace_id: string;
  title: string;
  elements?: any[];
  app_state?: Record<string, any>;
  updated_at: string;
  created_at: string;
}

export interface AIChat {
  id: string;
  workspace_id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  message_count: number;
  rag_used: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface GraphNode {
  id: string;
  workspace_id: string;
  type: 'document' | 'task' | 'code' | 'canvas' | 'ai_chat' | 'voice';
  title: string;
  content_summary?: string;
  metadata?: Record<string, any>;
  source_id?: string;
  created_at: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relationship_label?: string;
  weight: number;
  source?: GraphNode | string;
  target?: GraphNode | string;
}

export interface Tag {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface User {
  id: string;
  name: string;
  workspace_id?: string;
  avatar_color?: string;
  language?: string;
}

export interface Peer {
  id: string;
  name: string;
  color: string;
}

export type Theme = 'dark' | 'light';

export type NodeType = 'document' | 'task' | 'code' | 'canvas' | 'ai_chat' | 'voice';

export const NODE_COLORS: Record<NodeType, string> = {
  document: '#E8000D',
  task: '#FF6B00',
  code: '#3B82F6',
  canvas: '#00BCD4',
  ai_chat: '#8B5CF6',
  voice: '#3D9970'
};
