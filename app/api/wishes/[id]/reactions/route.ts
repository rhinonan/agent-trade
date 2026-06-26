import { NextRequest, NextResponse } from "next/server";
import { setReaction, removeReaction } from "@/lib/wishpool/repo.js";
import { setReactionSchema } from "@/lib/wishpool/types.js";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = setReactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  setReaction(id, userId, parsed.data.emoji);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  removeReaction(id, userId);
  return NextResponse.json({ ok: true });
}
