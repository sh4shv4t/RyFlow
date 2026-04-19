// Per-workspace SQLite connection manager for portable workspace databases.
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Stores workspace database files on disk.
const DATA_DIR =
  process.env.RYFLOW_DATA_DIR ||
  path.join(require('os').homedir(),
    '.ryflow', 'workspaces');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let activeDb = null;
let activeWorkspaceId = null;

function addColumnIfMissing(db, table, column, definition) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes(column)) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
      console.log(`[DB] Added column ${table}.${column}`);
    }
  } catch (err) {
    console.error(`[DB] Could not add ${table}.${column}:`, err.message);
  }
}

// Returns the currently active workspace database connection.
function getDb() {
  if (!activeDb) {
    throw new Error('No active workspace. Call switchWorkspace() first.');
  }
  return activeDb;
}

// Returns the current active workspace id.
function getActiveWorkspaceId() {
  return activeWorkspaceId;
}

// Returns filesystem path for a workspace database file.
function getWorkspaceDbPath(workspaceId) {
  return path.join(DATA_DIR, `workspace_${workspaceId}.db`);
}

// Lists local workspace ids that have a database file.
function listLocalWorkspaceDbs() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR)
    .filter((f) => f.startsWith('workspace_') && f.endsWith('.db'))
    .map((f) => f.replace('workspace_', '').replace('.db', ''));
}

// Runs schema initialization SQL against a workspace database.
function initializeSchema(db) {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);

  // Compatibility migrations for older workspace databases.
  addColumnIfMissing(db, 'workspaces', 'description', 'TEXT');
  addColumnIfMissing(db, 'workspaces', 'owner_name', 'TEXT');
  addColumnIfMissing(db, 'workspaces', 'join_code', 'TEXT');
  addColumnIfMissing(db, 'workspaces', 'is_local', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'workspaces', 'host_ip', 'TEXT');
  addColumnIfMissing(db, 'workspaces', 'host_port', 'INTEGER');
  addColumnIfMissing(db, 'workspaces', 'last_accessed', 'DATETIME');
  try {
    db.prepare("UPDATE workspaces SET last_accessed = COALESCE(last_accessed, CURRENT_TIMESTAMP)").run();
  } catch (err) {
    console.error('[DB] Could not normalize workspaces.last_accessed:', err.message);
  }

  addColumnIfMissing(db, 'documents', 'version_number', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'documents', 'is_daily_note', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'documents', 'daily_note_date', 'TEXT');

  addColumnIfMissing(db, 'code_files', 'content', 'TEXT');
  addColumnIfMissing(db, 'code_files', 'language', "TEXT DEFAULT 'javascript'");
  addColumnIfMissing(db, 'code_files', 'created_by', 'TEXT');
  addColumnIfMissing(db, 'code_files', 'version_number', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'code_files', 'updated_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
  addColumnIfMissing(db, 'code_files', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

  addColumnIfMissing(db, 'nodes', 'metadata', 'TEXT');
  addColumnIfMissing(db, 'nodes', 'source_id', 'TEXT');
  addColumnIfMissing(db, 'nodes', 'degree_centrality', 'INTEGER DEFAULT 0');
  // updated_at intentionally has no DEFAULT (SQLite ALTER TABLE limitation with functions).
  // Backfilled from created_at immediately below.
  addColumnIfMissing(db, 'nodes', 'updated_at', 'DATETIME');

  addColumnIfMissing(db, 'edges', 'edge_type', "TEXT DEFAULT 'default'");
  addColumnIfMissing(db, 'edges', 'edge_weight', 'REAL');

  addColumnIfMissing(db, 'nodes', 'content_summary', 'TEXT');

  addColumnIfMissing(db, 'ai_chats', 'rag_used', 'INTEGER DEFAULT 0');
  addColumnIfMissing(db, 'ai_chats', 'message_count', 'INTEGER DEFAULT 0');

  addColumnIfMissing(db, 'document_versions', 'saved_by', 'TEXT');

  // One-time backfill: compute degree centrality for all existing nodes.
  try {
    db.prepare(
      `UPDATE nodes SET degree_centrality =
         (SELECT COUNT(*) FROM edges WHERE source_id = nodes.id OR target_id = nodes.id)
       WHERE degree_centrality = 0`
    ).run();
  } catch (err) {
    console.error('[DB] Could not backfill degree_centrality:', err.message);
  }

  // One-time backfill: set updated_at from created_at where null.
  try {
    db.prepare("UPDATE nodes SET updated_at = created_at WHERE updated_at IS NULL").run();
  } catch (err) {
    console.error('[DB] Could not backfill nodes.updated_at:', err.message);
  }

  // One-time FTS5 bootstrap: populate nodes_fts for pre-existing nodes.
  try {
    db.prepare(
      `INSERT INTO nodes_fts(node_id, title, content)
       SELECT id, title, content_summary FROM nodes
       WHERE NOT EXISTS (SELECT 1 FROM nodes_fts WHERE node_id = nodes.id)`
    ).run();
  } catch (err) {
    console.error('[DB] Could not bootstrap nodes_fts:', err.message);
  }
}

// Switches active connection to a workspace database, creating it if needed.
function switchWorkspace(workspaceId) {
  if (!workspaceId) throw new Error('workspaceId is required');

  if (activeDb) {
    try {
      activeDb.close();
    } catch {
      // Ignore close errors during workspace handoff.
    }
  }

  const dbPath = getWorkspaceDbPath(workspaceId);
  activeDb = new Database(dbPath);
  activeWorkspaceId = workspaceId;

  activeDb.pragma('journal_mode = WAL');
  activeDb.pragma('foreign_keys = ON');
  initializeSchema(activeDb);
  return activeDb;
}

// Closes active workspace connection and clears active state.
function clearActiveWorkspace() {
  if (activeDb) {
    try {
      activeDb.close();
    } catch {
      // Ignore close errors on cleanup.
    }
  }
  activeDb = null;
  activeWorkspaceId = null;
}

module.exports = {
  getDb,
  switchWorkspace,
  getWorkspaceDbPath,
  listLocalWorkspaceDbs,
  getActiveWorkspaceId,
  clearActiveWorkspace,
  initializeSchema,
  DATA_DIR
};
