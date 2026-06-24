import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTables } from "@/lib/db/client.js";
import { SessionRepo } from "@/lib/db/session-repo.js";
import { ChatRepo } from "@/lib/db/chat-repo.js";

describe("GET /api/sessions", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    createTables(db);
    const repo = new SessionRepo(db);
    repo.insert({ id: "s1", targetCode: "600519", targetName: "茅台", targetType: "stock", workflowName: "bull-bear", status: "STOPPED", createdAt: 1000 });
    repo.insert({ id: "s2", targetCode: "000858", targetName: "五粮液", targetType: "stock", workflowName: "layered", status: "RUNNING", createdAt: 2000 });
  });

  afterEach(() => {
    db.close();
  });

  it("lists recent sessions with default limit", async () => {
    const repo = new SessionRepo(db);
    const sessions = repo.listRecent(5);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe("s2");
  });
});

describe("GET /api/session/[id]", () => {
  let db: Database.Database;
  let sessionRepo: SessionRepo;
  let chatRepo: ChatRepo;

  beforeEach(() => {
    db = new Database(":memory:");
    createTables(db);
    sessionRepo = new SessionRepo(db);
    chatRepo = new ChatRepo(db);

    sessionRepo.insert({ id: "s1", targetCode: "600519", targetName: "茅台", targetType: "stock", workflowName: "bull-bear", status: "STOPPED", createdAt: 1000 });
  });

  afterEach(() => {
    db.close();
  });

  it("returns session by id", () => {
    const session = sessionRepo.getById("s1");
    expect(session).not.toBeNull();
    expect(session!.id).toBe("s1");
    expect(session!.targetCode).toBe("600519");
  });

  it("returns null for unknown id", () => {
    const session = sessionRepo.getById("nonexistent");
    expect(session).toBeNull();
  });

  it("returns messages for a session", () => {
    chatRepo.insert({
      id: "m1",
      sessionId: "s1",
      role: "agent",
      senderId: "a1",
      senderName: "Agent 1",
      content: "Analysis result",
      metadata: { type: "analysis" },
      timestamp: 1001,
    });
    const messages = chatRepo.getBySession("s1");
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("Analysis result");
  });
});
