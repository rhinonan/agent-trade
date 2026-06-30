import type { ToolDefinition, ToolContext } from "./types.js";

/**
 * K 线数据工具 — 获取 OHLCV 数据（开盘价/最高价/最低价/收盘价/成交量）。
 *
 * 数据来源：腾讯财经行情接口（via AStockClient.market.kline）。
 * 默认返回最近 120 根日 K（约半年交易日），可用于趋势分析、形态识别和支撑阻力位判断。
 */

export const klineTool: ToolDefinition = {
  name: "get-kline",
  description: "获取股票K线数据，返回开盘价、收盘价、最高价、最低价、成交量。适用于分析趋势、形态和支撑阻力位。",
  parameters: {
    type: "object",
    properties: {
      count: { type: "number", description: "返回的K线条数，默认120条（约半年交易日）", default: 120 },
      period: { type: "string", description: "K线周期", enum: ["daily", "weekly", "monthly"], default: "daily" },
    },
    required: [],
  },
  async execute(params, ctx) {
    const count = (params.count as number) ?? 120;
    const period = ((params.period as string) ?? "daily") as "daily" | "weekly" | "monthly";

    const res = await ctx.dataClient.market.kline(ctx.target.code, { period, count });

    if (!res.data || res.data.length === 0) {
      return JSON.stringify({ error: res.error ?? "No K-line data", source: res.source });
    }

    const bars = res.data;
    const recent = bars.slice(-20);
    const latest = bars.length > 0 ? bars[bars.length - 1] : null;

    return JSON.stringify({
      symbol: ctx.target.code,
      totalBars: bars.length,
      source: res.source,
      recent20Bars: recent.map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })),
      latest: latest ? { date: latest.date, close: latest.close, volume: latest.volume } : null,
    });
  },
};
