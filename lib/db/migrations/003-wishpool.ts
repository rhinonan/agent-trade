import type Database from "better-sqlite3";

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wishes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      pinned INTEGER NOT NULL DEFAULT 0,
      author_id TEXT NOT NULL DEFAULT 'anonymous',
      author_name TEXT NOT NULL DEFAULT '匿名用户',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_wishes_status ON wishes(status);
    CREATE INDEX IF NOT EXISTS idx_wishes_pinned ON wishes(pinned);
    CREATE INDEX IF NOT EXISTS idx_wishes_created ON wishes(created_at DESC);

    CREATE TABLE IF NOT EXISTS wish_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      UNIQUE(wish_id, tag)
    );
    CREATE INDEX IF NOT EXISTS idx_wish_tags_tag ON wish_tags(tag);

    CREATE TABLE IF NOT EXISTS wish_reactions (
      wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      emoji TEXT NOT NULL,
      PRIMARY KEY (wish_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS wish_comments (
      id TEXT PRIMARY KEY,
      wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
      parent_id TEXT,
      author_id TEXT NOT NULL DEFAULT 'anonymous',
      author_name TEXT NOT NULL DEFAULT '匿名用户',
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wish_comments_wish ON wish_comments(wish_id, created_at);
  `);
}
