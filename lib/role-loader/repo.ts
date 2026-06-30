import type Database from "better-sqlite3";

/**
 * 用户角色数据库操作 — SQLite CRUD 封装。
 *
 * 管理 user_roles 表，存储用户上传的自定义 agent/workflow YAML。
 * 被 RoleLoader.loadFromDB() 调用，用于加载用户特定的角色配置。
 */

/** 角色数据库记录 */
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

  /** 插入新的用户角色。如果 (id, userId, type) 组合已存在则抛出 UNIQUE 约束错误。 */
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

  /** 列出指定用户的所有角色，可选择按类型（agent/workflow）过滤。按创建时间降序排列。 */
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

  /** 按复合键 (id + userId + type) 查找单个角色记录。未找到返回 undefined。 */
  getById(id: string, userId: string, type: "agent" | "workflow"): RoleRecord | undefined {
    return this.db.prepare(`
      SELECT id, user_id as userId, type, name, yaml_content as yamlContent,
             created_at as createdAt, updated_at as updatedAt
      FROM user_roles WHERE id = ? AND user_id = ? AND type = ?
    `).get(id, userId, type) as RoleRecord | undefined;
  }

  /** 删除指定用户的单个角色。不影响其他用户或其他角色。 */
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
