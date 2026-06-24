import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTables } from "../client.js";
import { ChatRepo } from "../chat-repo.js";

describe("ChatRepo", () => {
  let db: Database.Database;
  let repo: ChatRepo;

  beforeEach(() => {
    db = new Database(":memory:");
    createTables(db);
    repo = new ChatRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it("inserts and retrieves messages for a session", () => {
    const msg = {
      id: "msg-1", sessionId: "s1", role: "agent" as const,
      senderId: "tech-bull", senderName: "牛方", content: "看多",
      metadata: null, timestamp: 1000,
    };
    repo.insert(msg);
    const msgs = repo.getBySession("s1");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe("看多");
  });

  it("returns messages since a given timestamp", () => {
    repo.insert({ id: "m1", sessionId: "s1", role: "agent", senderId: "a", senderName: "A", content: "old", metadata: null, timestamp: 1000 });
    repo.insert({ id: "m2", sessionId: "s1", role: "agent", senderId: "b", senderName: "B", content: "new", metadata: null, timestamp: 2000 });
    const recent = repo.getSince("s1", 1500);
    expect(recent).toHaveLength(1);
    expect(recent[0].content).toBe("new");
  });

  it("deletes messages by session id", () => {
    repo.insert({ id: "m1", sessionId: "s1", role: "agent", senderId: "a", senderName: "A", content: "x", metadata: null, timestamp: 1000 });
    repo.deleteBySession("s1");
    expect(repo.getBySession("s1")).toHaveLength(0);
  });
});
