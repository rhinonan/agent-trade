import type Database from "better-sqlite3";
import type { ChatMessage } from "../chat/types.js";

export class ChatRepo {
  constructor(private db: Database.Database) {}

  insert(msg: ChatMessage): void {
    this.db.prepare(
      `INSERT INTO chat_messages (id, session_id, role, sender_id, sender_name, content, metadata, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(msg.id, msg.sessionId, msg.role, msg.senderId, msg.senderName,
      msg.content, msg.metadata ? JSON.stringify(msg.metadata) : null, msg.timestamp);
  }

  getBySession(sessionId: string, opts?: { limit?: number; before?: number }): ChatMessage[] {
    let sql = "SELECT * FROM chat_messages WHERE session_id = ?";
    const params: unknown[] = [sessionId];
    if (opts?.before !== undefined) { sql += " AND timestamp < ?"; params.push(opts.before); }
    sql += " ORDER BY timestamp ASC";
    if (opts?.limit !== undefined) { sql += " LIMIT ?"; params.push(opts.limit); }
    return (this.db.prepare(sql).all(...params) as any[]).map(rowToMessage);
  }

  getSince(sessionId: string, since: number): ChatMessage[] {
    return (this.db.prepare(
      "SELECT * FROM chat_messages WHERE session_id = ? AND timestamp > ? ORDER BY timestamp ASC"
    ).all(sessionId, since) as any[]).map(rowToMessage);
  }

  deleteBySession(sessionId: string): void {
    this.db.prepare("DELETE FROM chat_messages WHERE session_id = ?").run(sessionId);
  }
}

function rowToMessage(row: any): ChatMessage {
  return {
    id: row.id, sessionId: row.session_id, role: row.role,
    senderId: row.sender_id, senderName: row.sender_name,
    content: row.content,
    metadata: row.metadata ? JSON.parse(row.metadata) : null,
    timestamp: row.timestamp,
  };
}
