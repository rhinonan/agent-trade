import type Database from "better-sqlite3";

export function migrate(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_roles (
      id TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      type TEXT NOT NULL CHECK(type IN ('agent', 'workflow')),
      name TEXT NOT NULL,
      yaml_content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (user_id, type, id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
  `);
}
