import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { WS_EVENTS } from "./events.js";

// Use globalThis so the Socket.IO instance is shared between the custom server
// (server.mjs / Node.js context) and webpack-compiled API route handlers.
const GLOBAL_KEY = Symbol.for("agenttrade.socketio");

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  const analysisNs = io.of("/analysis");

  analysisNs.on("connection", (socket: Socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    socket.on(WS_EVENTS.SUBSCRIBE, ({ sessionId }: { sessionId: string }) => {
      socket.join(sessionId);
      socket.emit("subscribed", { sessionId });
      console.log(`[WS] ${socket.id} → session ${sessionId}`);
    });

    socket.on(WS_EVENTS.UNSUBSCRIBE, ({ sessionId }: { sessionId: string }) => {
      socket.leave(sessionId);
      socket.emit("unsubscribed", { sessionId });
    });

    socket.on("disconnect", () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });

  // Store on globalThis so both server.mjs and webpack-compiled routes see the same instance
  (globalThis as any)[GLOBAL_KEY] = io;
  return io;
}

export function getSocketIO(): Server {
  const io = (globalThis as any)[GLOBAL_KEY] as Server | undefined;
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

export function setSocketIO(io: Server): void {
  (globalThis as any)[GLOBAL_KEY] = io;
}
