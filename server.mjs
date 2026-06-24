import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { Server } from "socket.io";
import dotenv from "dotenv";

dotenv.config();

// ── Socket event constants (mirrors lib/socket/events.ts) ─────────────
const WS_EVENTS = Object.freeze({
  ANALYSIS_START: "analysis:start",
  STEP_START: "step:start",
  STEP_COMPLETE: "step:complete",
  STEP_ERROR: "step:error",
  ANALYSIS_COMPLETE: "analysis:complete",
  ANALYSIS_ERROR: "analysis:error",
  SUBSCRIBE: "subscribe",
  UNSUBSCRIBE: "unsubscribe",
});

// ── Socket.IO singleton (shared with webpack routes via globalThis) ──
const GLOBAL_KEY = Symbol.for("agenttrade.socketio");

function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  const analysisNs = io.of("/analysis");

  analysisNs.on("connection", (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    socket.on(WS_EVENTS.SUBSCRIBE, ({ sessionId }) => {
      socket.join(sessionId);
      socket.emit("subscribed", { sessionId });
      console.log(`[WS] ${socket.id} → session ${sessionId}`);
    });

    socket.on(WS_EVENTS.UNSUBSCRIBE, ({ sessionId }) => {
      socket.leave(sessionId);
      socket.emit("unsubscribed", { sessionId });
    });

    socket.on("disconnect", () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });

  globalThis[GLOBAL_KEY] = io;
  return io;
}

function getSocketIO() {
  const io = globalThis[GLOBAL_KEY];
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

function setSocketIO(io) {
  globalThis[GLOBAL_KEY] = io;
}

// ── Server startup ─────────────────────────────────────────────────────
const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = process.env.PORT ?? 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  const io = createSocketServer(httpServer);
  setSocketIO(io);

  httpServer.listen(port, () => {
    console.log(`AgentTrade running on http://${hostname}:${port}`);
  });
});
