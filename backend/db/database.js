// Initializes better-sqlite3 connection and runs schema migrations
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'ryflow.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db;

// Initialize the database connection and create tables if needed
function initDatabase() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

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
