import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let _db: Database.Database | null = null;

export function getDb(dbPath = "./data/agenttrade.db"): Database.Database {
  if (!_db) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _db = new Database(dbPath);
    _db.pragma("journal_mode = WAL");
    runMigrations(_db);
    createTables(_db);
  }
  return _db;
}

export function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      target_code TEXT NOT NULL,
      target_name TEXT,
      target_type TEXT NOT NULL DEFAULT 'stock',
      workflow_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      context TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      user_id TEXT NOT NULL DEFAULT 'anonymous'
    );
    CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, timestamp);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      target_code TEXT NOT NULL,
      target_name TEXT,
      target_type TEXT NOT NULL DEFAULT 'stock',
      workflow_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RUNNING',
      created_at INTEGER NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'anonymous'
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  `);
}

function runMigrations(db: Database.Database): void {
  // Migration 002: user_id columns — idempotent via try/catch
  // These ALTER TABLEs are no-ops on new databases (column created above),
  // but add the column on databases created before this migration.
  try {
    db.exec(`ALTER TABLE analyses ADD COLUMN user_id TEXT NOT NULL DEFAULT 'anonymous'`);
  } catch {
    // Column already exists — safe to ignore
  }
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'anonymous'`);
  } catch {
    // Column already exists — safe to ignore
  }
}
