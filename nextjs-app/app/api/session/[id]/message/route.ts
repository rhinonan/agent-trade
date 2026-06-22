import { NextRequest, NextResponse } from "next/server";
import { getSessionManager } from "@/lib/chat/session-manager.js";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const { content, mentionAgentIds } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  const mgr = getSessionManager();
  const session = mgr.getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const messages = await mgr.handleUserMessage(sessionId, content, mentionAgentIds ?? []);
  return NextResponse.json({ messages });
}
