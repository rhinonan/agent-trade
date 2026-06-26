import { NextRequest, NextResponse } from "next/server";
import { deleteComment } from "@/lib/wishpool/repo.js";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; cid: string }> },
) {
  const { cid } = await params;
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const userRole = req.headers.get("x-user-role") ?? "anonymous";
  const ok = deleteComment(cid, userId, userRole);
  if (!ok) {
    return NextResponse.json(
      { error: "Not found or permission denied" },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: true });
}
