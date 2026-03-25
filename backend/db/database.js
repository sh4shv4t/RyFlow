// Initializes better-sqlite3 connection and runs schema migrations
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Allow overriding DB location while keeping a sensible default for desktop builds.
const DB_PATH = process.env.RYFLOW_DB_PATH || path.join(__dirname, '..', '..', 'ryflow.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db;

// Adds required columns and tables for forward-compatible schema upgrades.
function runMigrations(database) {
  const statements = [
    'ALTER TABLE nodes ADD COLUMN metadata TEXT;',
    'ALTER TABLE tasks ADD COLUMN updated_at DATETIME;',
    'ALTER TABLE documents ADD COLUMN is_daily_note INTEGER DEFAULT 0;',
    'ALTER TABLE documents ADD COLUMN daily_note_date TEXT;',
    'UPDATE tasks SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP);',
    `
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
  `,
    `
    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      title TEXT,
      content TEXT,
      version_number INTEGER NOT NULL,
      created_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );
  `,
    `
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#64748b',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
  `,
    `
    CREATE TABLE IF NOT EXISTS node_tags (
      node_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (node_id, tag_id),
      FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );
  `,
    `
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
  `,
    `
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
  `,
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_document_versions_doc_version ON document_versions(document_id, version_number);',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_workspace_name ON tags(workspace_id, name);',
    'CREATE INDEX IF NOT EXISTS idx_documents_workspace_updated ON documents(workspace_id, updated_at);',
    'CREATE INDEX IF NOT EXISTS idx_documents_daily_lookup ON documents(workspace_id, is_daily_note, daily_note_date);',
    'CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status_updated ON tasks(workspace_id, status, updated_at);',
    'CREATE INDEX IF NOT EXISTS idx_nodes_workspace_type_created ON nodes(workspace_id, type, created_at);',
    'CREATE INDEX IF NOT EXISTS idx_nodes_source_type ON nodes(source_id, type);',
    'CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);',
    'CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);',
    'CREATE INDEX IF NOT EXISTS idx_ai_chats_workspace_updated ON ai_chats(workspace_id, updated_at);',
    'CREATE INDEX IF NOT EXISTS idx_code_workspace_updated ON code_files(workspace_id, updated_at);',
    'CREATE INDEX IF NOT EXISTS idx_canvas_workspace_updated ON canvases(workspace_id, updated_at);',
    'CREATE INDEX IF NOT EXISTS idx_document_versions_doc_created ON document_versions(document_id, created_at);',
    'CREATE INDEX IF NOT EXISTS idx_node_tags_tag_node ON node_tags(tag_id, node_id);',
    'CREATE INDEX IF NOT EXISTS idx_embedding_jobs_status_next ON embedding_jobs(status, next_run_at);'
  ];

  statements.forEach((sql) => {
    try {
      database.exec(sql);
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase();
      if (!msg.includes('duplicate column name')) {
        throw err;
      }
    }
  });
}

// Initialize the database connection and create tables if needed
function initDatabase() {
  // Ensure parent directory exists when DB path is configured externally.
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
  runMigrations(db);

  console.log('[DB] SQLite database initialized at', DB_PATH);
  return db;
}

// Returns the active database instance
function getDb() {
  if (!db) {
    return initDatabase();
  }
  return db;
}

// Closes the database connection gracefully
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('[DB] Database connection closed');
  }
}

module.exports = { initDatabase, getDb, closeDatabase };
