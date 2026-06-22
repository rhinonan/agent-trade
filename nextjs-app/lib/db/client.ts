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
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at DESC);
  `);
}
