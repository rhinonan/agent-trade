import type Database from "better-sqlite3";

export interface RoleRecord {
  id: string;
  userId: string;
  type: "agent" | "workflow";
  name: string;
  yamlContent: string;
  createdAt: number;
  updatedAt: number;
}

export class RoleRepo {
  constructor(private db: Database.Database) {}

  insert(role: Omit<RoleRecord, "createdAt" | "updatedAt">): void {
    const stmt = this.db.prepare(`
      INSERT INTO user_roles (id, user_id, type, name, yaml_content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch())
    `);
    try {
      stmt.run(role.id, role.userId, role.type, role.name, role.yamlContent);
    } catch (err: any) {
      if (err?.message?.includes("UNIQUE")) {
        throw new Error(
          `Role "${role.id}" of type "${role.type}" already exists for user "${role.userId}"`
        );
      }
      throw err;
    }
  }

  listByUser(userId: string, type?: "agent" | "workflow"): RoleRecord[] {
    const sql = type
      ? `SELECT id, user_id as userId, type, name, yaml_content as yamlContent,
                created_at as createdAt, updated_at as updatedAt
         FROM user_roles WHERE user_id = ? AND type = ? ORDER BY created_at DESC`
      : `SELECT id, user_id as userId, type, name, yaml_content as yamlContent,
                created_at as createdAt, updated_at as updatedAt
         FROM user_roles WHERE user_id = ? ORDER BY created_at DESC`;

    const params = type ? [userId, type] : [userId];
    return this.db.prepare(sql).all(...params) as RoleRecord[];
  }

  getById(id: string, userId: string, type: "agent" | "workflow"): RoleRecord | undefined {
    return this.db.prepare(`
      SELECT id, user_id as userId, type, name, yaml_content as yamlContent,
             created_at as createdAt, updated_at as updatedAt
      FROM user_roles WHERE id = ? AND user_id = ? AND type = ?
    `).get(id, userId, type) as RoleRecord | undefined;
  }

  delete(id: string, userId: string, type: "agent" | "workflow"): void {
    this.db.prepare(
      `DELETE FROM user_roles WHERE id = ? AND user_id = ? AND type = ?`
    ).run(id, userId, type);
  }

  /** Test helper — not used in production */
  deleteAll(userId: string): void {
    this.db.prepare(`DELETE FROM user_roles WHERE user_id = ?`).run(userId);
  }
}
