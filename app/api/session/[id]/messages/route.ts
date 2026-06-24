import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client.js";
import { ChatRepo } from "@/lib/db/chat-repo.js";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 100);

  const db = getDb();
  const repo = new ChatRepo(db);

  let messages: import("@/lib/chat/types.js").ChatMessage[];
  let hasMore = false;

  if (cursor) {
    const after = repo.getById(cursor)?.timestamp;
    if (after !== undefined) {
      const allSince = repo.getSince(sessionId, after);
      hasMore = allSince.length > limit;
      messages = allSince.slice(0, limit);
    } else {
      messages = [];
    }
  } else {
    messages = repo.getBySession(sessionId, { limit: limit + 1 });
    hasMore = messages.length > limit;
    if (hasMore) messages.pop();
  }

  return NextResponse.json({
    messages,
    hasMore,
    nextCursor: hasMore ? messages[messages.length - 1]?.id : null,
  });
}
