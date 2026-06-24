import { NextRequest, NextResponse } from "next/server";
import { AStockClient } from "@/lib/data-sdk/index.js";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get("keyword");

  if (!keyword || keyword.trim().length === 0) {
    return NextResponse.json({ error: "keyword is required" }, { status: 400 });
  }

  try {
    const client = new AStockClient();
    const result = await client.market.search(keyword.trim());
    return NextResponse.json(result);
  } catch (err) {
    console.error("Search API error:", err);
    return NextResponse.json({ keyword: keyword.trim(), results: [] });
  }
}
