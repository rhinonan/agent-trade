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
}

export class AnalysisRepo {
  constructor(private db: Database.Database) {}

  create(record: AnalysisRecord): AnalysisRecord {
    const stmt = this.db.prepare(
      `INSERT INTO analyses (id, target_code, target_name, target_type, workflow_name, status, context, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(record.id, record.targetCode, record.targetName, record.targetType,
      record.workflowName, record.status, record.context, record.createdAt);
    return record;
  }

  getById(id: string): AnalysisRecord | undefined {
    const row = this.db.prepare(
      `SELECT id, target_code, target_name, target_type, workflow_name, status, context, created_at, updated_at
       FROM analyses WHERE id = ?`
    ).get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id, targetCode: row.target_code, targetName: row.target_name,
      targetType: row.target_type, workflowName: row.workflow_name,
      status: row.status, context: row.context,
      createdAt: row.created_at, updatedAt: row.updated_at,
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

  listRecent(limit = 20): AnalysisRecord[] {
    const rows = this.db.prepare(
      `SELECT id, target_code, target_name, target_type, workflow_name, status, context, created_at, updated_at
       FROM analyses ORDER BY created_at DESC LIMIT ?`
    ).all(limit) as any[];
    return rows.map((row: any) => ({
      id: row.id, targetCode: row.target_code, targetName: row.target_name,
      targetType: row.target_type, workflowName: row.workflow_name,
      status: row.status, context: row.context,
      createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  }
}
