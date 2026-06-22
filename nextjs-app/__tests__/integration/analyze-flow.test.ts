// @vitest-environment node

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { io, Socket } from "socket.io-client";
import dotenv from "dotenv";
import http from "node:http";

// Load .env from repo root (nextjs-app/../.env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, "..");
const repoRoot = resolve(__dirname, "../../..");
dotenv.config({ path: resolve(repoRoot, ".env") });

const PORT = 3099;
const BASE = `http://localhost:${PORT}`;
const SERVER_START_TIMEOUT = 60000;

// Unique session-scoped DB to avoid conflicts with any running instance
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

describe("analyze flow (integration)", () => {
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

  it("POST /api/analyze starts an analysis and WebSocket delivers events", async () => {
    // 1. Connect WebSocket FIRST (before starting analysis) to avoid race condition
    const events: Record<string, any>[] = [];
    const socket: Socket = io(`${BASE}/analysis`, {
      transports: ["websocket"],
      timeout: 30000,
    });

    await new Promise<void>((resolve, reject) => {
      const connectTimeout = setTimeout(() => {
        reject(new Error("WebSocket connection timeout"));
      }, 15000);

      socket.on("connect", () => {
        clearTimeout(connectTimeout);
        resolve();
      });

      socket.on("connect_error", (err: Error) => {
        clearTimeout(connectTimeout);
        reject(new Error(`WebSocket connection error: ${err.message}`));
      });
    });

    // 2. Start analysis via HTTP POST (WebSocket is already connected)
    const res = await fetch(`${BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "600519",
        workflow: "bull-bear",
        provider: "deepseek",
      }),
    });
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body.sessionId).toBeDefined();
    const sessionId = body.sessionId as string;

    // Subscribe to the session room NOW
    socket.emit("subscribe", { sessionId });

    // 3. Collect WebSocket events
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.disconnect();
        reject(new Error("Timeout (90s) waiting for analysis events"));
      }, 90000);

      socket.on("analysis:start", (data: any) => {
        events.push({ type: "start", ...data });
      });

      socket.on("step:start", (data: any) => {
        events.push({ type: "step:start", ...data });
      });

      socket.on("step:complete", (data: any) => {
        events.push({ type: "step:complete", ...data });
      });

      socket.on("step:error", (data: any) => {
        events.push({ type: "step:error", ...data });
      });

      socket.on("analysis:complete", (data: any) => {
        events.push({ type: "complete", ...data });
        clearTimeout(timeout);
        socket.disconnect();
        resolve();
      });

      socket.on("analysis:error", (data: any) => {
        events.push({ type: "error", ...data });
        // Even an error proves the pipeline works
        clearTimeout(timeout);
        socket.disconnect();
        resolve();
      });
    });

    // 4. Verify we received events
    expect(events.length).toBeGreaterThan(0);

    const startEvent = events.find((e) => e.type === "start");
    if (startEvent) {
      expect(startEvent.target).toBeDefined();
      expect(startEvent.target.type).toBeDefined();
      expect(startEvent.workflow).toBe("bull-bear");
    }

    // We should have at least a terminal event (complete or error)
    const terminalEvent = events.find(
      (e) => e.type === "complete" || e.type === "error",
    );
    expect(terminalEvent).toBeDefined();

    // 5. Verify the session persisted via REST GET
    const statusRes = await fetch(`${BASE}/api/analyze/${sessionId}`);
    expect(statusRes.ok).toBe(true);

    const status = await statusRes.json();
    expect(status.sessionId).toBe(sessionId);
    // Status should be "running", "complete", or "error"
    expect(["running", "complete", "error"]).toContain(status.status);

    // If the analysis completed successfully, verify additional detail
    if (terminalEvent?.type === "complete") {
      expect(status.status).toBe("complete");
      expect(status.target).toBeDefined();
      expect(status.workflow).toBe("bull-bear");
    }
  }, 180000);

  it("POST /api/analyze returns 400 when missing required fields", async () => {
    const res = await fetch(`${BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain("Must specify");
  });

  it("GET /api/analyze/[id] returns 404 for unknown session", async () => {
    const res = await fetch(`${BASE}/api/analyze/nonexistent-session-id`);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toBe("Not found");
  }, 15000);

  it("GET /api/workflows returns available workflows", async () => {
    const res = await fetch(`${BASE}/api/workflows`);
    expect(res.ok).toBe(true);

    const body = await res.json();
    // The workflows route returns an array directly
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);

    // Verify expected workflow names
    const names = body.map((w: any) => w.name);
    expect(names.some((n: string) => n.toLowerCase().includes("bull"))).toBe(
      true,
    );
  });
});
