// app/api/wishes/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getWish, updateWish } from "@/lib/wishpool/repo.js";
import { updateWishSchema } from "@/lib/wishpool/types.js";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const wish = getWish(id, userId);
  if (!wish) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(wish);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = updateWishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const userRole = req.headers.get("x-user-role") ?? "anonymous";
  const updated = updateWish(id, userId, userRole, parsed.data);
  if (updated === null) {
    return NextResponse.json(
      { error: "Not found or permission denied" },
      { status: 403 },
    );
  }
  return NextResponse.json(updated);
}
