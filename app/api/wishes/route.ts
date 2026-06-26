// app/api/wishes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listWishes, createWish } from "@/lib/wishpool/repo.js";
import { wishFiltersSchema, createWishSchema } from "@/lib/wishpool/types.js";

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = wishFiltersSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const result = listWishes(parsed.data, userId);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createWishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const userName = req.headers.get("x-user-name") ?? "匿名用户";
  const wish = createWish(userId, userName, parsed.data);
  return NextResponse.json(wish, { status: 201 });
}
