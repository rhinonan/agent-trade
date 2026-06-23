import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSessionManager } from "@/lib/chat/session-manager.js";
import { getDb } from "@/lib/db/client.js";
import { ChatRepo } from "@/lib/db/chat-repo.js";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const { content } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const mgr = getSessionManager();
  const session = mgr.getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Persist the user message
  const repo = new ChatRepo(getDb());
  const userMsg = {
    id: randomUUID(),
    sessionId,
    role: "user" as const,
    senderId: "user",
    senderName: "散户",
    content,
    metadata: null as any,
    timestamp: Date.now(),
  };
  repo.insert(userMsg);

  return NextResponse.json({ messages: [userMsg] });
}
