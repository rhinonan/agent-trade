import { Server } from "socket.io";
import { WS_EVENTS } from "./events.mjs";

const GLOBAL_KEY = Symbol.for("agenttrade.socketio");

export function createSocketServer(httpServer) {
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

export function getSocketIO() {
  const io = globalThis[GLOBAL_KEY];
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

export function setSocketIO(io) {
  globalThis[GLOBAL_KEY] = io;
}
