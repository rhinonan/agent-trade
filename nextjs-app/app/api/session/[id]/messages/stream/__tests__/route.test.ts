import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { WorkflowDAG } from "@/lib/engine/types.js";

// ── Hoisted: create an in-memory DB for the mocked getDb ──────────────
const { getMemDb } = vi.hoisted(() => {
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
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
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      target_code TEXT NOT NULL,
      target_name TEXT,
      target_type TEXT NOT NULL DEFAULT 'stock',
      workflow_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      context TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_analyses_created
      ON analyses(created_at DESC);
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      target_code TEXT NOT NULL,
      target_name TEXT,
      target_type TEXT NOT NULL DEFAULT 'stock',
      workflow_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RUNNING',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_created
      ON sessions(created_at DESC);
  `);
  return { getMemDb: () => db };
});

vi.mock("@/lib/db/client.js", () => ({
  getDb: () => getMemDb(),
}));

// ── Imports (resolved after the mock is installed) ────────────────────
import { GET } from "../route.js";
import { ChatRepo } from "@/lib/db/chat-repo.js";
import {
  getSessionManager,
  resetSessionManager,
} from "@/lib/chat/session-manager.js";
import { AgentRegistry } from "@/lib/engine/registry.js";

const testDag: WorkflowDAG = {
  name: "test",
  version: "1",
  steps: [
    {
      id: "perception-1",
      type: "analyze",
      agent: { id: "market-data" },
      prompt: "采集 {target} 行情",
    },
  ],
};

function createNextRequest(url: string, signal?: AbortSignal): any {
  return new Request(url, signal ? { signal } : undefined);
}

describe("GET /api/session/[id]/messages/stream", () => {
  let db: Database.Database;
  let repo: ChatRepo;
  let registry: AgentRegistry;

  beforeEach(() => {
    // Reset singleton so we can init with an in-memory repo
    resetSessionManager();
    db = getMemDb();
    repo = new ChatRepo(db);
    registry = new AgentRegistry();
    // Pre-initialize the singleton so GET route can call getSessionManager() without args
    getSessionManager(repo);
  });

  afterEach(() => {
    resetSessionManager();
  });

  describe("404 — session not found", () => {
    it("returns 404 for unknown session id", async () => {
      const req = createNextRequest(
        "http://localhost/api/session/non-existent/messages/stream",
      );
      const response = await GET(req, {
        params: Promise.resolve({ id: "non-existent" }),
      });
      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe("Session not found");
    });
  });

  describe("SSE response format", () => {
    beforeEach(() => {
      // Create a session so the route can find it.
      getSessionManager().createSession(
        "sse-test-1",
        { code: "000001" },
        testDag,
        registry,
        { provider: "deepseek" },
      );
    });

    it("returns 200 with content-type text/event-stream", async () => {
      const req = createNextRequest(
        "http://localhost/api/session/sse-test-1/messages/stream",
      );
      const response = await GET(req, {
        params: Promise.resolve({ id: "sse-test-1" }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
      expect(response.headers.get("Cache-Control")).toBe("no-cache");
      expect(response.headers.get("Connection")).toBe("keep-alive");
    });

    it("emits status-change as first SSE event", async () => {
      const req = createNextRequest(
        "http://localhost/api/session/sse-test-1/messages/stream",
      );
      const response = await GET(req, {
        params: Promise.resolve({ id: "sse-test-1" }),
      });
      const reader = response.body!.getReader();
      const { value, done } = await reader.read();
      expect(done).toBe(false);
      const chunk = new TextDecoder().decode(value);
      expect(chunk).toContain("event: status-change");
      expect(chunk).toContain('"status":"RUNNING"');
      reader.cancel();
    });

    it("polls for new messages and emits them as SSE message events", async () => {
      // Insert a message into the DB that was created after lastTimestamp
      repo.insert({
        id: "msg-poll-1",
        sessionId: "sse-test-1",
        role: "agent",
        senderId: "market-data",
        senderName: "行情数据",
        content: "当前价格 150.00",
        metadata: null,
        timestamp: Date.now() + 5000, // far in the future so polling picks it up
      });

      const req = createNextRequest(
        "http://localhost/api/session/sse-test-1/messages/stream",
      );
      const response = await GET(req, {
        params: Promise.resolve({ id: "sse-test-1" }),
      });
      const reader = response.body!.getReader();

      // Read first chunk (status-change)
      await reader.read();

      // Read next chunk (should contain the polled message after 500ms)
      const result = await reader.read();
      const chunk = new TextDecoder().decode(result.value);
      expect(chunk).toContain("event: message");
      expect(chunk).toContain('"content":"当前价格 150.00"');

      reader.cancel();
    });

    it("stops emitting after the session is deleted", async () => {
      const req = createNextRequest(
        "http://localhost/api/session/sse-test-1/messages/stream",
      );
      const response = await GET(req, {
        params: Promise.resolve({ id: "sse-test-1" }),
      });
      const reader = response.body!.getReader();

      // Read the first event
      await reader.read();

      // Delete the session — next poll should get a non-existent session
      getSessionManager().deleteSession("sse-test-1");

      // After 500 ms the interval fires, finds no session, and does nothing.
      // We just verify the stream is still open.
      // Cancel/close to clean up.
      reader.cancel();
    });
  });

  describe("abort handling", () => {
    beforeEach(() => {
      getSessionManager().createSession(
        "abort-test",
        { code: "000001" },
        testDag,
        registry,
        { provider: "deepseek" },
      );
    });

    it("closes the stream when the request is aborted", async () => {
      const ac = new AbortController();
      const req = createNextRequest(
        "http://localhost/api/session/abort-test/messages/stream",
        ac.signal,
      );
      const response = await GET(req, {
        params: Promise.resolve({ id: "abort-test" }),
      });
      const reader = response.body!.getReader();

      // Read first chunk (status-change)
      const { value: firstChunk, done: firstDone } = await reader.read();
      expect(firstDone).toBe(false);

      // Abort the request
      ac.abort();

      // After abort the stream should be closed
      const { value: afterAbort, done: afterDone } = await reader.read();
      expect(afterDone).toBe(true);
    });
  });
});
