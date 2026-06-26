import { NextResponse } from "next/server";
import { getUsedTags } from "@/lib/wishpool/repo.js";

export async function GET() {
  const tags = getUsedTags();
  return NextResponse.json(tags);
}
