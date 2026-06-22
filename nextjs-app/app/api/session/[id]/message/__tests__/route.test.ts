import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";

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
import { POST } from "../route.js";
import { ChatRepo } from "@/lib/db/chat-repo.js";
import {
  getSessionManager,
  resetSessionManager,
} from "@/lib/chat/session-manager.js";
import { AgentRegistry } from "@/lib/engine/registry.js";
import { registerBuiltinAgents } from "@/lib/agents/index.js";

describe("POST /api/session/[id]/message", () => {
  let repo: ChatRepo;
  let registry: AgentRegistry;

  beforeEach(() => {
    resetSessionManager();
    const db = getMemDb();
    repo = new ChatRepo(db);
    registry = new AgentRegistry();
    registerBuiltinAgents(registry);
    getSessionManager(repo);
  });

  afterEach(() => {
    resetSessionManager();
  });

  it("returns 400 when content is missing", async () => {
    const req = new Request("http://localhost/api/session/test-session/message", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req as any, {
      params: Promise.resolve({ id: "test-session" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Content is required");
  });

  it("returns 400 when content is empty", async () => {
    const req = new Request("http://localhost/api/session/test-session/message", {
      method: "POST",
      body: JSON.stringify({ content: "   " }),
    });
    const res = await POST(req as any, {
      params: Promise.resolve({ id: "test-session" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when session does not exist", async () => {
    const req = new Request("http://localhost/api/session/non-existent/message", {
      method: "POST",
      body: JSON.stringify({ content: "Hello" }),
    });
    const res = await POST(req as any, {
      params: Promise.resolve({ id: "non-existent" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Session not found");
  });

  it("returns 200 with messages for valid request", async () => {
    // Create a session first
    getSessionManager().createSession(
      "msg-test-1",
      { code: "000001" },
      { name: "test", version: "1", steps: [] },
      registry,
      { provider: "deepseek" },
    );

    const req = new Request("http://localhost/api/session/msg-test-1/message", {
      method: "POST",
      body: JSON.stringify({ content: "分析一下这只股票" }),
    });
    const res = await POST(req as any, {
      params: Promise.resolve({ id: "msg-test-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toBeInstanceOf(Array);
    expect(body.messages.length).toBe(1);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toBe("分析一下这只股票");
    expect(body.messages[0].senderId).toBe("user");
  });

  it("returns 200 with mentionAgentIds", async () => {
    getSessionManager().createSession(
      "msg-test-2",
      { code: "000001" },
      { name: "test", version: "1", steps: [] },
      registry,
      { provider: "deepseek" },
    );

    const req = new Request("http://localhost/api/session/msg-test-2/message", {
      method: "POST",
      body: JSON.stringify({ content: "你怎么看", mentionAgentIds: [] }),
    });
    const res = await POST(req as any, {
      params: Promise.resolve({ id: "msg-test-2" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toBeInstanceOf(Array);
    expect(body.messages.length).toBe(1);
  });
});
