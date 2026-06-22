import type { ToolDefinition, ToolContext } from "./types.js";

export const klineTool: ToolDefinition = {
  name: "get-kline",
  description:
    "获取股票K线数据，返回开盘价、收盘价、最高价、最低价、成交量。适用于分析趋势、形态和支撑阻力位。",
  parameters: {
    type: "object",
    properties: {
      count: {
        type: "number",
        description: "返回的K线条数，默认120条（约半年交易日）",
        default: 120,
      },
      period: {
        type: "string",
        description: "K线周期",
        enum: ["daily", "weekly", "monthly"],
        default: "daily",
      },
    },
    required: [],
  },
  async execute(params, ctx) {
    const count = (params.count as number) ?? 120;
    const period = ((params.period as string) ?? "daily") as
      | "daily"
      | "weekly"
      | "monthly";
    const res = await ctx.dataClient.kline.get({
      symbol: ctx.target.code,
      period,
      count,
    });
    // Return a concise summary — full bars would be too large for context
    const recent = res.bars.slice(-20);
    const summary = {
      symbol: res.symbol,
      period: res.period,
      totalBars: res.bars.length,
      recent20Bars: recent.map((b) => ({
        date: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      })),
      latest: recent.length > 0
        ? {
            date: recent[recent.length - 1].date,
            close: recent[recent.length - 1].close,
            volume: recent[recent.length - 1].volume,
          }
        : null,
    };
    return JSON.stringify(summary);
  },
};
