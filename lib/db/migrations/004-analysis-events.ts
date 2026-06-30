import type Database from "better-sqlite3";

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT    NOT NULL,
      seq         INTEGER NOT NULL,
      event_type  TEXT    NOT NULL,
      payload     TEXT    NOT NULL,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES analyses(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_events_session
      ON analysis_events(session_id, seq);
  `);
}
