import type { ToolDefinition, ToolContext } from "./types.js";

export const macdTool: ToolDefinition = {
  name: "calc-macd",
  description:
    "计算MACD指标，返回DIF、DEA和柱状值(MACD histogram)。用于判断趋势方向、金叉死叉信号和背离。",
  parameters: {
    type: "object",
    properties: {
      fast: { type: "number", description: "快线EMA周期，默认12", default: 12 },
      slow: { type: "number", description: "慢线EMA周期，默认26", default: 26 },
      signal: { type: "number", description: "信号线EMA周期，默认9", default: 9 },
    },
    required: [],
  },
  async execute(params, ctx) {
    const res = await ctx.dataClient.kline.indicators({
      symbol: ctx.target.code,
      names: ["MACD"],
      count: 120,
    });
    const macdData = res.indicators?.macd ?? [];
    // Return recent 50 items + key signals
    const recent = macdData.slice(-50);
    const latest = recent.length > 0 ? recent[recent.length - 1] : null;
    const prev = recent.length > 1 ? recent[recent.length - 2] : null;

    let signal = "neutral";
    if (latest && prev) {
      // Check for golden cross (DIF crosses above DEA)
      if (
        prev.dif != null && prev.dea != null &&
        latest.dif != null && latest.dea != null
      ) {
        if (prev.dif <= prev.dea && latest.dif > latest.dea) signal = "golden_cross";
        else if (prev.dif >= prev.dea && latest.dif < latest.dea) signal = "death_cross";
      }
    }

    return JSON.stringify({
      symbol: ctx.target.code,
      signal,
      latest: latest
        ? { dif: latest.dif, dea: latest.dea, histogram: latest.histogram }
        : null,
      recent50: recent.map((item) => ({
        dif: item.dif,
        dea: item.dea,
        histogram: item.histogram,
      })),
    });
  },
};

export const rsiTool: ToolDefinition = {
  name: "calc-rsi",
  description:
    "计算RSI相对强弱指标(14日)，返回数值序列。RSI>70为超买，RSI<30为超卖。",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.kline.indicators({
      symbol: ctx.target.code,
      names: ["RSI"],
      count: 120,
    });
    const rsiData = (res.indicators?.rsi ?? []).filter(
      (v): v is number => v != null,
    );
    const latest = rsiData.length > 0 ? rsiData[rsiData.length - 1] : null;
    const recent20 = rsiData.slice(-20);

    let zone = "neutral";
    if (latest != null) {
      if (latest > 70) zone = "overbought";
      else if (latest < 30) zone = "oversold";
    }

    return JSON.stringify({
      symbol: ctx.target.code,
      latest,
      zone,
      recent20,
    });
  },
};

export const maTool: ToolDefinition = {
  name: "calc-ma",
  description:
    "计算移动平均线(MA)，返回5/10/20/60日均线值。用于判断趋势方向和均线排列(多头/空头排列)。",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.kline.indicators({
      symbol: ctx.target.code,
      names: ["MA"],
      count: 120,
    });
    const maData = res.indicators?.ma ?? {};
    // Get latest values for each MA period
    const latest: Record<string, number | null> = {};
    for (const [period, values] of Object.entries(maData)) {
      const arr = values.filter((v): v is number => v != null);
      latest[period] = arr.length > 0 ? arr[arr.length - 1] : null;
    }

    // Determine alignment
    const periods = ["5", "10", "20", "60"];
    const alignmentValues = periods.map((p) => latest[p]).filter((v): v is number => v != null);
    let alignment = "unknown";
    if (alignmentValues.length >= 3) {
      const sorted = [...alignmentValues].sort((a, b) => b - a);
      if (JSON.stringify(alignmentValues) === JSON.stringify(sorted)) {
        alignment = "bullish_alignment";
      } else if (
        JSON.stringify(alignmentValues) ===
        JSON.stringify([...alignmentValues].sort((a, b) => a - b))
      ) {
        alignment = "bearish_alignment";
      }
    }

    return JSON.stringify({
      symbol: ctx.target.code,
      latest,
      alignment,
    });
  },
};
