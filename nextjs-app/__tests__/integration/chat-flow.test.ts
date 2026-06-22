// @vitest-environment node

// Integration tests for the chat flow.
// Skipped by default. Run with INTEGRATION=1 to execute:
//   INTEGRATION=1 npx vitest run __tests__/integration/chat-flow.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import http from "node:http";

// Load .env from repo root (nextjs-app/../.env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
const repoRoot = resolve(__dirname, "../../..");
dotenv.config({ path: resolve(repoRoot, ".env") });

const PORT = 3098;
const BASE = `http://localhost:${PORT}`;
const SERVER_START_TIMEOUT = 60000;

// Unique port and in-memory DB to avoid conflicts with any running instance
process.env.AGENTTRADE_DB = ":memory:";
process.env.PORT = String(PORT);

function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const req = http
        .get(url, (res) => {
          // Any response (even 5xx) means the HTTP server is up
          res.resume();
          resolve();
        })
        .on("error", (err: NodeJS.ErrnoException) => {
          // ECONNREFUSED = server not listening yet, keep waiting
          // ECONNRESET / socket hang up = server is starting (compiling), keep waiting
          if (err.code === "ECONNREFUSED" || err.code === "ECONNRESET") {
            retry();
          } else {
            // Other errors: log and retry (server might be mid-startup)
            console.log(`[health] ${err.code ?? err.message}`);
            retry();
          }
        });
      req.setTimeout(5000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Server did not start within ${timeoutMs}ms`));
        return;
      }
      setTimeout(poll, 1500);
    };

    poll();
  });
}

// Conditionally skip when INTEGRATION env var is not set
const describeIntegration = process.env.INTEGRATION
  ? describe
  : describe.skip;

describeIntegration("chat flow (integration)", () => {
  let serverProcess: ChildProcess | null = null;

  beforeAll(async () => {
    // Start the server as a child process
    serverProcess = spawn("node", ["server.mjs"], {
      cwd: resolve(__dirname, "../.."),
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: "development",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Collect server stderr for debugging
    serverProcess.stderr?.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) console.log(`[server stderr] ${msg}`);
    });
    serverProcess.stdout?.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) console.log(`[server stdout] ${msg}`);
    });

    serverProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.log(`[server] exited with code ${code}`);
      }
    });

    // Wait until the server is accepting requests
    await waitForServer(BASE, SERVER_START_TIMEOUT);
  }, SERVER_START_TIMEOUT + 15000);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      // Force kill after a short grace period
      setTimeout(() => {
        try {
          serverProcess?.kill("SIGKILL");
        } catch {
          // Process already dead
        }
      }, 3000);
    }
  });

  it("POST /api/session creates a session with agents", async () => {
    const res = await fetch(`${BASE}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "000001", workflow: "quick-scan" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBeDefined();
    expect(body.sessionId).toBeTypeOf("string");
    expect(body.agents).toBeInstanceOf(Array);
    expect(body.agents.length).toBeGreaterThan(0);
  });

  it("POST /api/session/:id/message sends and returns messages", async () => {
    // Create a session first
    const createRes = await fetch(`${BASE}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "000001", workflow: "quick-scan" }),
    });
    expect(createRes.status).toBe(200);
    const { sessionId } = await createRes.json();

    // Send a message to the session
    const msgRes = await fetch(`${BASE}/api/session/${sessionId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });
    expect(msgRes.status).toBe(200);
    const msgBody = await msgRes.json();
    expect(msgBody.messages).toBeInstanceOf(Array);
    expect(msgBody.messages.length).toBe(1);
    expect(msgBody.messages[0].role).toBe("user");
    expect(msgBody.messages[0].content).toBe("hello");
  });

  it("GET /api/session/:id/messages returns history", async () => {
    // Create a session first
    const createRes = await fetch(`${BASE}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "000001", workflow: "quick-scan" }),
    });
    expect(createRes.status).toBe(200);
    const { sessionId } = await createRes.json();

    // Get message history for the session
    const histRes = await fetch(
      `${BASE}/api/session/${sessionId}/messages?limit=10`,
    );
    expect(histRes.status).toBe(200);
    const histBody = await histRes.json();
    expect(histBody.messages).toBeInstanceOf(Array);
    expect(histBody.hasMore).toBe(false);
    expect(histBody.nextCursor).toBeNull();
  });

  it("POST /api/session returns 400 when missing code/sector/index", async () => {
    const res = await fetch(`${BASE}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Must specify");
  });

  it("POST /api/session/:id/message returns 404 for unknown session", async () => {
    const res = await fetch(
      `${BASE}/api/session/nonexistent-session-id/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "hello" }),
      },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Session not found");
  });

  it("messages are scoped to the correct session", async () => {
    // Create two sessions
    const res1 = await fetch(`${BASE}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "000001", workflow: "quick-scan" }),
    });
    const { sessionId: sessionA } = await res1.json();

    const res2 = await fetch(`${BASE}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "600519", workflow: "quick-scan" }),
    });
    const { sessionId: sessionB } = await res2.json();

    // Message into session A
    await fetch(`${BASE}/api/session/${sessionA}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "only in A" }),
    });

    // Session B should have no messages
    const histRes = await fetch(
      `${BASE}/api/session/${sessionB}/messages?limit=10`,
    );
    expect(histRes.status).toBe(200);
    const histBody = await histRes.json();
    expect(histBody.messages).toHaveLength(0);
  });
});
