import type Database from "better-sqlite3";

export interface SessionRow {
  id: string;
  targetCode: string;
  targetName: string | null;
  targetType: string;
  workflowName: string;
  status: string;
  createdAt: number;
}

export class SessionRepo {
  constructor(private db: Database.Database) {}

  insert(row: SessionRow): void {
    this.db.prepare(
      `INSERT INTO sessions (id, target_code, target_name, target_type, workflow_name, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(row.id, row.targetCode, row.targetName, row.targetType, row.workflowName, row.status, row.createdAt);
  }

  getById(id: string): SessionRow | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;
    return row ? mapRow(row) : null;
  }

  listRecent(limit: number = 20): SessionRow[] {
    const rows = this.db.prepare(
      "SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?"
    ).all(limit) as any[];
    return rows.map(mapRow);
  }

  updateStatus(id: string, status: string): void {
    this.db.prepare("UPDATE sessions SET status = ? WHERE id = ?").run(status, id);
  }

  updateName(id: string, name: string): void {
    this.db.prepare("UPDATE sessions SET target_name = ? WHERE id = ?").run(name, id);
  }

  deleteById(id: string): void {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }
}

function mapRow(row: any): SessionRow {
  return {
    id: row.id,
    targetCode: row.target_code,
    targetName: row.target_name,
    targetType: row.target_type,
    workflowName: row.workflow_name,
    status: row.status,
    createdAt: row.created_at,
  };
}
