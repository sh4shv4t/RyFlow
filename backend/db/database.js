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
  `
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
