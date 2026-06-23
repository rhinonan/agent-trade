import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/client.js";
import { ChatRepo } from "@/lib/db/chat-repo.js";
import { SessionRepo } from "@/lib/db/session-repo.js";
import { createSSEEmitter } from "@/lib/chat/sse-emitter.js";
import { getSessionManager } from "@/lib/chat/session-manager.js";
import type { ChatSession } from "@/lib/chat/types.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const db = getDb();
  const repo = new ChatRepo(db);
  const sessionRepo = new SessionRepo(db);
  const mgr = getSessionManager(repo, sessionRepo);

  // Try in-memory first; fall back to database if module was reloaded
  let session: ChatSession | null = mgr.getSession(sessionId) ?? null;
  const dbRow = session ? null : sessionRepo.getById(sessionId);

  if (!session && !dbRow) {
    return new Response("Session not found", { status: 404 });
  }

  // Build a local status tracker — we poll both memory and DB
  let status = session?.status ?? (dbRow?.status === "STOPPED" ? "STOPPED" : "RUNNING");
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const emitter = createSSEEmitter({
        enqueue(data: Uint8Array) {
          if (!closed) controller.enqueue(data);
        },
        close() {
          closed = true;
          controller.close();
        },
      });

      // Send current status
      emitter.emit("status-change", { status });

      // Passive observer: poll DB for new messages every 500ms
      let lastTimestamp = Date.now();
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        try {
          // Poll new messages from ChatRepo (always works regardless of in-memory state)
          const newMsgs = repo.getSince(sessionId, lastTimestamp);
          for (const msg of newMsgs) {
            emitter.emit("message", msg);
            lastTimestamp = Math.max(lastTimestamp, msg.timestamp);
          }

          // Detect status changes — try in-memory first, then DB
          let currentStatus: string | undefined;
          const currentSession = mgr.getSession(sessionId);
          if (currentSession) {
            currentStatus = currentSession.status;
          } else {
            // Fallback: poll SessionRepo for status
            const dbSession = sessionRepo.getById(sessionId);
            currentStatus = dbSession?.status;
          }

          if (currentStatus && currentStatus !== status) {
            status = currentStatus;
            emitter.emit("status-change", { status: currentStatus });
            if (currentStatus === "STOPPED") {
              emitter.close();
              clearInterval(interval);
            }
          }
        } catch (err) {
          console.error("SSE poll error:", err);
        }
      }, 500);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
