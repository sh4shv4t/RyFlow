-- RyFlow Database Schema
-- All tables for the offline-first AI collaboration workspace

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  owner_name TEXT,
  join_code TEXT,
  is_local INTEGER DEFAULT 0,
  host_ip TEXT,
  host_port INTEGER,
  last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace_id TEXT,
  avatar_color TEXT,
  language TEXT DEFAULT 'en',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Enforce workspace ownership for user records.
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  version_number INTEGER DEFAULT 0,
  is_daily_note INTEGER DEFAULT 0,
  daily_note_date TEXT,
  created_by TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Keep documents tied to workspace/user lifecycle.
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  title TEXT,
  content TEXT,
  version_number INTEGER NOT NULL,
  saved_by TEXT,
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (saved_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  assignee TEXT,
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  due_date TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Keep task assignments and workspace links consistent.
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content_summary TEXT,
  metadata TEXT,
  -- embedding stored as BLOB (Float32Array binary buffer)
  -- was previously TEXT (JSON array string)
  embedding BLOB,
  source_id TEXT,
  degree_centrality INTEGER DEFAULT 0,
  updated_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Ensure nodes are cleaned when a workspace is deleted.
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relationship_label TEXT,
  edge_type TEXT DEFAULT 'default',
  weight REAL DEFAULT 1.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Keep edge references valid as nodes are removed.
  FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS voice_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  transcript TEXT,
  audio_path TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Ensure voice logs follow workspace lifecycle.
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sustainability_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  hours_used REAL,
  date TEXT,
  ai_tip TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Preserve log integrity for user-linked sustainability entries.
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS code_files (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  language TEXT DEFAULT 'javascript',
  created_by TEXT,
  version_number INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Keep code files scoped to workspace and optional creator lifecycle.
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS canvases (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  elements TEXT,
  app_state TEXT,
  thumbnail TEXT,
  created_by TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Keep canvases scoped to workspace and optional creator lifecycle.
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS ai_chats (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  messages TEXT NOT NULL,
  model TEXT DEFAULT 'phi3:mini',
  message_count INTEGER DEFAULT 0,
  rag_used INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#64748b',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS node_tags (
  node_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (node_id, tag_id),
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by TEXT,
  shared INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS embedding_jobs (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  payload TEXT,
  status TEXT DEFAULT 'pending',
  retries INTEGER DEFAULT 0,
  error TEXT,
  next_run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS doc_comments (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  selected_text TEXT,
  position_from INTEGER,
  position_to INTEGER,
  parent_id TEXT,
  resolved INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES doc_comments(id) ON DELETE CASCADE
);

-- FTS5 full-text search for hybrid BM25 + vector retrieval (B3)
-- Standalone FTS5 table (not external-content) because nodes.id is TEXT UUID,
-- not an INTEGER rowid, so external-content mode is incompatible.
CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  node_id UNINDEXED,
  title,
  content,
  tokenize = 'porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(node_id, title, content) VALUES (new.id, new.title, new.content_summary);
END;

CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE node_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
  DELETE FROM nodes_fts WHERE node_id = old.id;
  INSERT INTO nodes_fts(node_id, title, content) VALUES (new.id, new.title, new.content_summary);
END;

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_versions_doc_version ON document_versions(document_id, version_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_workspace_name ON tags(workspace_id, name);
CREATE INDEX IF NOT EXISTS idx_documents_workspace_updated ON documents(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_documents_daily_lookup ON documents(workspace_id, is_daily_note, daily_note_date);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status_updated ON tasks(workspace_id, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_nodes_workspace_type_created ON nodes(workspace_id, type, created_at);
CREATE INDEX IF NOT EXISTS idx_nodes_source_type ON nodes(source_id, type);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_ai_chats_workspace_updated ON ai_chats(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_code_workspace_updated ON code_files(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_canvas_workspace_updated ON canvases(workspace_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_document_versions_doc_created ON document_versions(document_id, created_at);
CREATE INDEX IF NOT EXISTS idx_node_tags_tag_node ON node_tags(tag_id, node_id);
CREATE INDEX IF NOT EXISTS idx_embedding_jobs_status_next ON embedding_jobs(status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_comments_document ON doc_comments(document_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON doc_comments(parent_id);
