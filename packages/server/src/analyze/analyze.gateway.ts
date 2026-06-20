import { Logger } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({
  namespace: "/analysis",
  cors: { origin: "*" },
})
export class AnalyzeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AnalyzeGateway.name);

  @WebSocketServer()
  server!: Server;

  /** Map socket.id → sessionId for session-scoped message routing */
  private readonly socketSessions = new Map<string, string>();

  handleConnection(client: Socket): void {
    this.logger.log(`WS client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.socketSessions.delete(client.id);
    this.logger.log(`WS client disconnected: ${client.id}`);
  }

  @SubscribeMessage("subscribe")
  handleSubscribe(client: Socket, payload: { sessionId: string }): { event: string; data: { sessionId: string } } {
    const { sessionId } = payload;
    this.socketSessions.set(client.id, sessionId);
    client.join(sessionId);
    this.logger.log(`Client ${client.id} subscribed to session ${sessionId}`);
    return { event: "subscribed", data: { sessionId } };
  }

  @SubscribeMessage("unsubscribe")
  handleUnsubscribe(client: Socket, payload: { sessionId: string }): { event: string; data: { sessionId: string } } {
    const { sessionId } = payload;
    client.leave(sessionId);
    this.socketSessions.delete(client.id);
    return { event: "unsubscribed", data: { sessionId } };
  }

  /** Send an event to all clients subscribed to a session */
  sendToClient(sessionId: string, eventType: string, payload: unknown): void {
    this.server.to(sessionId).emit(eventType, payload);
  }
}
