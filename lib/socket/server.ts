import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { WS_EVENTS } from "./events.js";

/**
 * Socket.IO 服务器 — 实时 WebSocket 通信。
 *
 * 关键设计：通过 globalThis + Symbol 在 server.mjs（Node.js 自定义服务器）
 * 和 webpack 编译的 API 路由之间共享 Socket.IO 实例。
 * 不使用模块级变量是因为不同的编译上下文有各自的模块缓存。
 */

// 使用 globalThis 在自定义服务器（server.mjs）和 webpack 编译的 API 路由之间共享 Socket.IO 实例
const GLOBAL_KEY = Symbol.for("agenttrade.socketio");

/** 创建 Socket.IO 服务器，设置 /analysis 命名空间和处理连接/订阅逻辑 */
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

  // 存入 globalThis，server.mjs 和 webpack 编译的路由均可访问同一实例
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
