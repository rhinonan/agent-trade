import { NextRequest, NextResponse } from "next/server";
import { AStockClient } from "@/lib/data-sdk/index.js";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  try {
    const client = new AStockClient();
    const result = await client.market.kline(code, { period: "daily", count: 2 });

    if (!result.data || result.data.length === 0) {
      return NextResponse.json(
        { error: "No data for this symbol" },
        { status: 404 }
      );
    }

    const bars = result.data;
    const latest = bars[bars.length - 1];
    const prev = bars.length >= 2 ? bars[bars.length - 2] : null;

    const price = latest.close;
    const change = prev ? price - prev.close : 0;
    const changePercent = prev && prev.close !== 0 ? (change / prev.close) * 100 : 0;

    return NextResponse.json({
      symbol: code,
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      open: latest.open,
      high: latest.high,
      low: latest.low,
      volume: latest.volume,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error(`Quote error for ${code}:`, err);
    return NextResponse.json(
      { error: "Failed to fetch quote data" },
      { status: 500 }
    );
  }
}
