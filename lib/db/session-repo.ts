import type Database from "better-sqlite3";

export interface SessionRow {
  id: string;
  targetCode: string;
  targetName: string | null;
  targetType: string;
  workflowName: string;
  status: string;
  createdAt: number;
  userId?: string;
}

export class SessionRepo {
  constructor(private db: Database.Database) {}

  insert(row: SessionRow): void {
    this.db.prepare(
      `INSERT INTO sessions (id, target_code, target_name, target_type, workflow_name, status, created_at, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      row.id, row.targetCode, row.targetName, row.targetType,
      row.workflowName, row.status, row.createdAt,
      row.userId ?? "anonymous",
    );
  }

  getById(id: string, userId?: string): SessionRow | null {
    let sql = "SELECT * FROM sessions WHERE id = ?";
    const params: any[] = [id];
    if (userId) {
      sql += " AND user_id = ?";
      params.push(userId);
    }
    const row = this.db.prepare(sql).get(...params) as any;
    return row ? mapRow(row) : null;
  }

  listRecent(limit: number = 20, userId?: string): SessionRow[] {
    let sql = "SELECT * FROM sessions";
    const params: any[] = [];
    if (userId) {
      sql += " WHERE user_id = ?";
      params.push(userId);
    }
    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(mapRow);
  }

  updateStatus(id: string, status: string): void {
    this.db.prepare("UPDATE sessions SET status = ? WHERE id = ?").run(status, id);
  }

  updateName(id: string, name: string): void {
    this.db.prepare("UPDATE sessions SET target_name = ? WHERE id = ?").run(name, id);
  }

  deleteById(id: string, userId?: string): boolean {
    let sql = "DELETE FROM sessions WHERE id = ?";
    const params: any[] = [id];
    if (userId) {
      sql += " AND user_id = ?";
      params.push(userId);
    }
    const result = this.db.prepare(sql).run(...params);
    return result.changes > 0;
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
    userId: row.user_id,
  };
}
