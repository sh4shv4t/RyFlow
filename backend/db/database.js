// Per-workspace SQLite connection manager for portable workspace databases.
const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Stores workspace database files on disk.
const DATA_DIR = process.env.RYFLOW_DATA_DIR || path.join(os.homedir(), '.ryflow', 'workspaces');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let activeDb = null;
let activeWorkspaceId = null;

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
