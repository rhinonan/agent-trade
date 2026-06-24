import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client.js";
import { SessionRepo } from "@/lib/db/session-repo.js";
import { ChatRepo } from "@/lib/db/chat-repo.js";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id") ?? "anonymous";

  try {
    const db = getDb();
    const sessionRepo = new SessionRepo(db);
    const chatRepo = new ChatRepo(db);

    const session = sessionRepo.getById(id, userId !== "anonymous" ? userId : undefined);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const messages = chatRepo.getBySession(id);

    return NextResponse.json({
      session: {
        id: session.id,
        targetCode: session.targetCode,
        targetName: session.targetName,
        targetType: session.targetType,
        workflowName: session.workflowName,
        status: session.status,
        createdAt: session.createdAt,
      },
      messages,
    });
  } catch (err) {
    console.error("Session detail error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
