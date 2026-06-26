import { NextRequest, NextResponse } from "next/server";
import { createComment, getComments } from "@/lib/wishpool/repo.js";
import { createCommentSchema } from "@/lib/wishpool/types.js";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const comments = getComments(id);
  return NextResponse.json(comments);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = createCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const userName = req.headers.get("x-user-name") ?? "匿名用户";
  const comment = createComment(id, userId, userName, parsed.data.body, parsed.data.parent_id);
  return NextResponse.json(comment, { status: 201 });
}
