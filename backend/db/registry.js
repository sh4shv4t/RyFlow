// Registry database tracks known workspaces and active local/remote session.
const Database = require('better-sqlite3');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Stores registry metadata outside per-workspace databases.
const REGISTRY_DIR = process.env.RYFLOW_DATA_DIR || path.join(os.homedir(), '.ryflow');

if (!fs.existsSync(REGISTRY_DIR)) {
  fs.mkdirSync(REGISTRY_DIR, { recursive: true });
}

const registry = new Database(path.join(REGISTRY_DIR, 'registry.db'));
registry.pragma('journal_mode = WAL');
registry.pragma('foreign_keys = ON');

registry.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    owner_name TEXT,
    join_code TEXT UNIQUE NOT NULL,
    is_local INTEGER DEFAULT 1,
    host_ip TEXT,
    host_port INTEGER,
    last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS active_session (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    workspace_id TEXT,
    is_remote INTEGER DEFAULT 0,
    remote_host TEXT,
    remote_port INTEGER
  );
`);

// Ensures singleton row exists for active session tracking.
registry.prepare(`
  INSERT OR IGNORE INTO active_session (id, workspace_id, is_remote, remote_host, remote_port)
  VALUES (1, NULL, 0, NULL, NULL)
`).run();

module.exports = registry;
