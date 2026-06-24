import type Database from "better-sqlite3";

export interface AnalysisRecord {
  id: string;
  targetCode: string;
  targetName: string | null;
  targetType: string;
  workflowName: string;
  status: "running" | "complete" | "error";
  context: string;
  createdAt: number;
  updatedAt?: number;
  userId?: string;
}

export class AnalysisRepo {
  constructor(private db: Database.Database) {}

  create(record: AnalysisRecord): AnalysisRecord {
    const stmt = this.db.prepare(
      `INSERT INTO analyses (id, target_code, target_name, target_type, workflow_name, status, context, created_at, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      record.id, record.targetCode, record.targetName, record.targetType,
      record.workflowName, record.status, record.context, record.createdAt,
      record.userId ?? "anonymous",
    );
    return record;
  }

  getById(id: string, userId?: string): AnalysisRecord | undefined {
    let sql = `SELECT id, target_code, target_name, target_type, workflow_name, status, context, created_at, updated_at, user_id
               FROM analyses WHERE id = ?`;
    const params: any[] = [id];
    if (userId) {
      sql += ` AND user_id = ?`;
      params.push(userId);
    }
    const row = this.db.prepare(sql).get(...params) as any;
    if (!row) return undefined;
    return {
      id: row.id, targetCode: row.target_code, targetName: row.target_name,
      targetType: row.target_type, workflowName: row.workflow_name,
      status: row.status, context: row.context,
      createdAt: row.created_at, updatedAt: row.updated_at,
      userId: row.user_id,
    };
  }

  update(id: string, patch: { status?: string; context?: string }): void {
    const updates: string[] = [];
    const values: any[] = [];
    if (patch.status !== undefined) { updates.push("status = ?"); values.push(patch.status); }
    if (patch.context !== undefined) { updates.push("context = ?"); values.push(patch.context); }
    updates.push("updated_at = unixepoch()");
    values.push(id);
    this.db.prepare(`UPDATE analyses SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }

  listRecent(limit = 20, userId?: string): AnalysisRecord[] {
    let sql = `SELECT id, target_code, target_name, target_type, workflow_name, status, context, created_at, updated_at, user_id
               FROM analyses`;
    const params: any[] = [];
    if (userId) {
      sql += ` WHERE user_id = ?`;
      params.push(userId);
    }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((row: any) => ({
      id: row.id, targetCode: row.target_code, targetName: row.target_name,
      targetType: row.target_type, workflowName: row.workflow_name,
      status: row.status, context: row.context,
      createdAt: row.created_at, updatedAt: row.updated_at,
      userId: row.user_id,
    }));
  }
}
