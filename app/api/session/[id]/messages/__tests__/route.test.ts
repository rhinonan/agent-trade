import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

// ── Hoisted: create an in-memory DB for the mocked getDb ──────────────
const { getMemDb } = vi.hoisted(() => {
  const Database = require("better-sqlite3") as any;
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_session
      ON chat_messages(session_id, timestamp);
  `);
  return { getMemDb: () => db };
});

vi.mock("@/lib/db/client.js", () => ({
  getDb: () => getMemDb(),
}));

// ── Imports (resolved after the mock is installed) ────────────────────
import { GET } from "../route.js";
import { ChatRepo } from "@/lib/db/chat-repo.js";

describe("GET /api/session/[id]/messages", () => {
  let repo: ChatRepo;

  beforeEach(() => {
    const db = getMemDb();
    // Clear all data to ensure test isolation
    db.exec("DELETE FROM chat_messages");
    repo = new ChatRepo(db);
  });

  it("returns empty messages for session with no messages", async () => {
    const req = new Request("http://localhost/api/session/empty/messages");
    const res = await GET(req as any, {
      params: Promise.resolve({ id: "empty" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toEqual([]);
    expect(body.hasMore).toBe(false);
    expect(body.nextCursor).toBeNull();
  });

  it("returns messages for a session ordered by timestamp", async () => {
    const sessionId = "history-test-1";
    const t = Date.now();

    repo.insert({
      id: "msg-1", sessionId, role: "user", senderId: "user",
      senderName: "散户", content: "Hello", metadata: null, timestamp: t,
    });
    repo.insert({
      id: "msg-2", sessionId, role: "agent", senderId: "bot",
      senderName: "Bot", content: "Hi there", metadata: null, timestamp: t + 1000,
    });

    const req = new Request(`http://localhost/api/session/${sessionId}/messages`);
    const res = await GET(req as any, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].id).toBe("msg-1");
    expect(body.messages[1].id).toBe("msg-2");
    expect(body.hasMore).toBe(false);
  });

  it("respects limit parameter", async () => {
    const sessionId = "history-test-2";
    const t = Date.now();

    for (let i = 0; i < 10; i++) {
      repo.insert({
        id: `msg-limit-${i}`, sessionId, role: "user", senderId: "user",
        senderName: "散户", content: `Message ${i}`, metadata: null,
        timestamp: t + i * 100,
      });
    }

    const req = new Request(
      `http://localhost/api/session/${sessionId}/messages?limit=3`,
    );
    const res = await GET(req as any, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toHaveLength(3);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toBe("msg-limit-2");
  });

  it("caps limit at 100", async () => {
    const sessionId = "history-test-3";
    const t = Date.now();

    // Insert 150 messages
    for (let i = 0; i < 150; i++) {
      repo.insert({
        id: `msg-cap-${i}`, sessionId, role: "user", senderId: "user",
        senderName: "散户", content: `Message ${i}`, metadata: null,
        timestamp: t + i,
      });
    }

    const req = new Request(
      `http://localhost/api/session/${sessionId}/messages?limit=200`,
    );
    const res = await GET(req as any, {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // limit capped at 100, so with limit+1=101, but only 100 are returned
    expect(body.messages.length).toBeLessThanOrEqual(100);
    expect(body.hasMore).toBe(true);
  });

  it("supports cursor-based pagination", async () => {
    const sessionId = "history-test-4";
    const t = Date.now();

    for (let i = 0; i < 10; i++) {
      repo.insert({
        id: `msg-pg-${i}`, sessionId, role: "user", senderId: "user",
        senderName: "散户", content: `Message ${i}`, metadata: null,
        timestamp: t + i * 100,
      });
    }

    // Get first 3
    const req1 = new Request(
      `http://localhost/api/session/${sessionId}/messages?limit=3`,
    );
    const res1 = await GET(req1 as any, {
      params: Promise.resolve({ id: sessionId }),
    });
    const body1 = await res1.json();
    expect(body1.messages).toHaveLength(3);
    expect(body1.hasMore).toBe(true);
    const cursor = body1.nextCursor;

    // Get next page using cursor
    const req2 = new Request(
      `http://localhost/api/session/${sessionId}/messages?limit=3&cursor=${cursor}`,
    );
    const res2 = await GET(req2 as any, {
      params: Promise.resolve({ id: sessionId }),
    });
    const body2 = await res2.json();
    expect(body2.messages).toHaveLength(3);
    expect(body2.messages[0].id).toBe("msg-pg-3");
  });

  it("returns messages only for the requested session", async () => {
    const sessionA = "session-a";
    const sessionB = "session-b";
    const t = Date.now();

    repo.insert({
      id: "a-1", sessionId: sessionA, role: "user", senderId: "user",
      senderName: "散户", content: "From A", metadata: null, timestamp: t,
    });
    repo.insert({
      id: "b-1", sessionId: sessionB, role: "user", senderId: "user",
      senderName: "散户", content: "From B", metadata: null, timestamp: t,
    });

    const req = new Request(`http://localhost/api/session/${sessionA}/messages`);
    const res = await GET(req as any, {
      params: Promise.resolve({ id: sessionA }),
    });
    const body = await res.json();
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].id).toBe("a-1");
  });
});
