import type { ToolDefinition, ToolContext } from "./types.js";

/**
 * 技术指标计算工具 — MACD / RSI / MA 三种常用指标。
 *
 * 所有指标均基于本地计算（先取 K 线数据，再通过 AStockClient.fundamentals.indicators 计算）。
 * 不依赖外部 API，计算速度快。
 */

/**
 * MACD 指标 — 异同移动平均线。
 * 判断信号：golden_cross（金叉，DIF 上穿 DEA）= 看涨；death_cross（死叉，DIF 下穿 DEA）= 看跌。
 * 返回最近 50 组 MACD 数据供趋势分析。
 */
export const macdTool: ToolDefinition = {
  name: "calc-macd",
  description: "计算MACD指标，返回DIF、DEA和柱状值。用于判断趋势方向、金叉死叉信号和背离。",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const kline = await ctx.dataClient.market.kline(ctx.target.code, { count: 120 });
    if (!kline.data) {
      return JSON.stringify({ error: kline.error ?? "No data for MACD", source: kline.source });
    }

    const closes = kline.data.map((b) => b.close);
    const ind = await ctx.dataClient.fundamentals.indicators(closes);
    const macdData = ind.macd.slice(-50);
    const latest = macdData.length > 0 ? macdData[macdData.length - 1] : null;
    const prev = macdData.length > 1 ? macdData[macdData.length - 2] : null;

    let signal = "neutral";
    if (latest && prev && latest.dif != null && latest.dea != null && prev.dif != null && prev.dea != null) {
      if (prev.dif <= prev.dea && latest.dif > latest.dea) signal = "golden_cross";
      else if (prev.dif >= prev.dea && latest.dif < latest.dea) signal = "death_cross";
    }

    return JSON.stringify({
      symbol: ctx.target.code,
      signal,
      latest: latest ? { dif: latest.dif, dea: latest.dea, histogram: latest.histogram } : null,
      recent50: macdData.map((item) => ({ dif: item.dif, dea: item.dea, histogram: item.histogram })),
    });
  },
};

/** RSI 相对强弱指标（14 日）。RSI > 70 为超买（overbought），RSI < 30 为超卖（oversold）。 */
export const rsiTool: ToolDefinition = {
  name: "calc-rsi",
  description: "计算RSI相对强弱指标(14日)。RSI>70为超买，RSI<30为超卖。",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const kline = await ctx.dataClient.market.kline(ctx.target.code, { count: 120 });
    if (!kline.data) {
      return JSON.stringify({ error: kline.error ?? "No data for RSI", source: kline.source });
    }

    const closes = kline.data.map((b) => b.close);
    const ind = await ctx.dataClient.fundamentals.indicators(closes);
    const rsiValues = (ind.rsi as (number | null)[]).filter((v): v is number => v != null);
    const latest = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;

    let zone = "neutral";
    if (latest != null) {
      if (latest > 70) zone = "overbought";
      else if (latest < 30) zone = "oversold";
    }

    return JSON.stringify({ symbol: ctx.target.code, latest, zone, recent20: rsiValues.slice(-20) });
  },
};

/**
 * 移动平均线 — MA5/10/20/60。
 * 判断均线排列：bullish_alignment（多头排列，短周期在上）看涨；
 * bearish_alignment（空头排列，长周期在上）看跌。
 */
export const maTool: ToolDefinition = {
  name: "calc-ma",
  description: "计算移动平均线(MA5/10/20/60)。用于判断趋势方向和均线排列。",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const kline = await ctx.dataClient.market.kline(ctx.target.code, { count: 120 });
    if (!kline.data) {
      return JSON.stringify({ error: kline.error ?? "No data for MA", source: kline.source });
    }

    const closes = kline.data.map((b) => b.close);
    const ind = await ctx.dataClient.fundamentals.indicators(closes);
    const maData = ind.ma as Record<string, (number | null)[]>;

    const normalized: Record<string, number | null> = {};
    for (const [key, values] of Object.entries(maData)) {
      const arr = values.filter((v): v is number => v != null);
      normalized[key] = arr.length > 0 ? arr[arr.length - 1] : null;
    }

    const periods = ["5", "10", "20", "60"];
    const alignmentValues = periods.map((p) => normalized[p]).filter((v): v is number => v != null);
    let alignment = "unknown";
    if (alignmentValues.length >= 3) {
      const bullish = alignmentValues.every((v, i) => i === 0 || v < alignmentValues[i - 1]);
      const bearish = alignmentValues.every((v, i) => i === 0 || v > alignmentValues[i - 1]);
      if (bullish) alignment = "bullish_alignment";
      else if (bearish) alignment = "bearish_alignment";
    }

    return JSON.stringify({ symbol: ctx.target.code, latest: normalized, alignment });
  },
};
