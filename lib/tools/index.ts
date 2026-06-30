import { klineTool } from "./kline.js";
import { macdTool, rsiTool, maTool } from "./indicator.js";
import { webSearchTool } from "./web-search.js";
import { webFetchTool } from "./web-fetch/index.js";
import type { ToolDefinition } from "./types.js";

/**
 * 工具注册中心 — agent-trade 所有工具的定义和查找表。
 *
 * 工具分为三类：
 * 1. 独立文件工具 — kline.ts / indicator.ts / web-search.ts / web-fetch/
 *    这些是相对通用的计算型工具（K线、技术指标、搜索）
 * 2. 内联工具 — 本文件内定义的、直接依赖 AStockClient API 的数据查询工具
 *    涵盖资金流、新闻、公告、财务、龙虎榜、两融、北向资金等
 * 3. toolsByName Map — 中心注册表，YAML agent 通过字符串名称查找工具
 *
 * 新增工具只需：
 * 1. 在本文件定义 ToolDefinition 常量
 * 2. 在 toolsByName Map 中注册
 */

export { klineTool } from "./kline.js";
export { macdTool, rsiTool, maTool } from "./indicator.js";
export { webSearchTool } from "./web-search.js";
export { webFetchTool } from "./web-fetch/index.js";
export type { ToolDefinition, ToolContext, PropertySchema } from "./types.js";

// ─── 数据查询工具（依赖 AStockClient 各层 API）───

/** 资金流向 — 主力/超大单/大单/中单/小单净流入流出（分钟级），来源：东方财富 fundFlowMinute */
const fundFlowTool: ToolDefinition = {
  name: "get-fund-flow",
  description: "获取个股资金流向数据（主力/超大单/大单/中单/小单净流入流出，分钟级）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.signal.fundFlowMinute(ctx.target.code);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    const latest = res.data.slice(-10);
    return JSON.stringify({ symbol: ctx.target.code, source: res.source, recent10: latest });
  },
};

/** 新闻资讯 — 个股相关新闻（含情感标签），来源：stockNews */
const newsTool: ToolDefinition = {
  name: "get-news",
  description: "获取个股相关新闻资讯（含情感标签）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.news.stockNews(ctx.target.code);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    return JSON.stringify({ symbol: ctx.target.code, count: res.data.length, source: res.source, news: res.data.slice(0, 10) });
  },
};

/** 公司公告 — 上市公司公告检索（支持关键词），来源：announcements.search */
const announcementTool: ToolDefinition = {
  name: "get-announcement",
  description: "获取上市公司公告（支持关键词检索）",
  parameters: {
    type: "object",
    properties: { keyword: { type: "string", description: "搜索关键词，默认为空获取最近公告" } },
    required: [],
  },
  async execute(params, ctx) {
    const keyword = (params.keyword as string) ?? "";
    const res = await ctx.dataClient.announcements.search(keyword || "公告", ctx.target.code);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    return JSON.stringify({ symbol: ctx.target.code, count: res.data.length, source: res.source, announcements: res.data.slice(0, 10) });
  },
};

/** 财务数据 — 营收/利润/资产负债/现金流，来源：incomeStatement + balanceSheet */
const financialDataTool: ToolDefinition = {
  name: "get-financial-data",
  description: "获取财务数据（营收/利润/资产负债/现金流等），默认返回最新一季利润表",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const income = await ctx.dataClient.fundamentals.incomeStatement(ctx.target.code);
    const balance = await ctx.dataClient.fundamentals.balanceSheet(ctx.target.code);
    return JSON.stringify({
      symbol: ctx.target.code,
      income: income.data,
      balance: balance.data ? {
        totalAssets: balance.data.totalAssets,
        totalLiabilities: balance.data.totalLiabilities,
        equity: balance.data.equity,
      } : null,
      source: `${income.source}, ${balance.source}`,
    });
  },
};

/** 大宗交易 — 折溢价/席位信息，默认最近 60 天，来源：capital.blockTrades */
const blockTradeTool: ToolDefinition = {
  name: "get-block-trade",
  description: "获取大宗交易数据（折溢价/席位信息），默认最近60天",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.capital.blockTrades(ctx.target.code);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    return JSON.stringify({ symbol: ctx.target.code, count: res.data.length, source: res.source, recent: res.data.slice(0, 20) });
  },
};

/** 实时行情 — 最新价/涨跌幅/PE/PB/市值/换手率，来源：market.quote */
const quoteTool: ToolDefinition = {
  name: "get-quote",
  description: "获取实时行情报价（最新价/涨跌幅/PE/PB/市值/换手率等）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.market.quote([ctx.target.code]);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    const q = res.data[ctx.target.code];
    if (!q) return JSON.stringify({ error: "No quote found", source: res.source });
    return JSON.stringify(q);
  },
};

// ─── 宏观 / 情绪 / 量价 / 综合指标（agent YAML 引用的组合工具）───

/** 宏观经济 — GDP/CPI/PMI/货币政策等宏观新闻动态，来源：news.globalNews（过滤宏观类别） */
const macroIndicatorTool: ToolDefinition = {
  name: "macro-indicator",
  description: "获取宏观经济相关新闻与政策动态（GDP/CPI/PMI/货币政策/财政政策等宏观信息）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.news.globalNews(1);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    const macroNews = res.data.filter((n: any) =>
      n.category === "宏观" || n.category === "全球"
    ).slice(0, 15);
    return JSON.stringify({
      source: res.source,
      macroNews,
      note: "宏观经济指标通过宏观新闻动态间接反映，包含政策动向、经济数据解读等信息",
    });
  },
};

/** 市场情绪 — 热门题材股 + 北向资金动向，来源：hotStocks + northBound */
const socialSentimentTool: ToolDefinition = {
  name: "social-sentiment",
  description: "获取市场情绪数据（热门题材股/北向资金动向/龙虎榜，反映市场情绪热度）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const [hotRes, northRes] = await Promise.all([
      ctx.dataClient.signal.hotStocks(),
      ctx.dataClient.signal.northBound(),
    ]);
    return JSON.stringify({
      hotStocks: hotRes.data?.slice(0, 20) ?? [],
      northBound: northRes.data?.slice(-20) ?? [],
      note: "热门题材股反映短线情绪热度，北向资金反映外资情绪方向",
    });
  },
};

/** 量价关系 — K 线量价 + 分钟级资金流向，计算均量和量比，来源：kline + fundFlowMinute */
const volumeTool: ToolDefinition = {
  name: "get-volume",
  description: "获取成交量与资金流向数据（K线量价+分钟级资金流向，用于量价关系分析）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const [klineRes, flowRes] = await Promise.all([
      ctx.dataClient.market.kline(ctx.target.code, { period: "daily", count: 60 }),
      ctx.dataClient.signal.fundFlowMinute(ctx.target.code),
    ]);
    const bars = klineRes.data ?? [];
    const recentBars = bars.slice(-20);
    const avgVol = recentBars.length > 0
      ? recentBars.reduce((s: number, b: any) => s + b.volume, 0) / recentBars.length
      : 0;
    const latestVol = recentBars.length > 0 ? recentBars[recentBars.length - 1].volume : 0;
    return JSON.stringify({
      symbol: ctx.target.code,
      recent20Days: recentBars.map((b: any) => ({
        date: b.date, open: b.open, close: b.close, volume: b.volume, amount: b.amount,
      })),
      avgVolume: avgVol,
      latestVolume: latestVol,
      volumeRatio: avgVol > 0 ? latestVol / avgVol : 1,
      fundFlowMinute: flowRes.data?.slice(-20) ?? [],
      source: `${klineRes.source}, ${flowRes.source}`,
    });
  },
};

/** 综合技术指标 — MACD/RSI/MA/布林带，基于最新 60 日 K 线，来源：indicators */
const indicatorTool: ToolDefinition = {
  name: "calc-indicators",
  description: "计算技术指标（MACD/RSI/MA/布林带），基于最新60日K线收盘价",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const klineRes = await ctx.dataClient.market.kline(ctx.target.code, { period: "daily", count: 60 });
    const closes = (klineRes.data ?? []).map((b: any) => b.close).filter((c: any) => c != null);
    if (closes.length < 20) {
      return JSON.stringify({ error: "K线数据不足，无法计算指标", closesCount: closes.length });
    }
    const indicators = ctx.dataClient.fundamentals.indicators(closes);
    if (!indicators) return JSON.stringify({ error: "指标计算失败" });
    const latest = (arr: any[]) => arr.filter(v => v != null).slice(-1)[0] ?? null;
    return JSON.stringify({
      symbol: ctx.target.code,
      closesCount: closes.length,
      latestClose: closes[closes.length - 1],
      macd: {
        latest: latest((indicators as any).macd as any[]),
        signal: ((indicators as any).macd as any[]).filter((v: any) => v != null).slice(-3),
      },
      rsi: { latest: latest((indicators as any).rsi as any[]) },
      ma: Object.fromEntries(
        Object.entries((indicators as any).ma as Record<string, any[]>).map(([k, v]) => [k, latest(v)])
      ),
      boll: {
        latest: latest((indicators as any).boll as any[]),
        position: (() => {
          const b = latest((indicators as any).boll as any[]);
          if (!b) return "unknown";
          const price = closes[closes.length - 1];
          if (price >= b.upper * 0.98) return "near_upper";
          if (price <= b.lower * 1.02) return "near_lower";
          return "mid_range";
        })(),
      },
      calculatedAt: Date.now(),
    });
  },
};

// ─── 龙虎榜 / 两融 / 板块 / 股东 / 强势股 / 北向资金 ───
// 市场和资金面辅助工具

const dragonTigerTool: ToolDefinition = {
  name: "get-dragon-tiger-board",
  description: "获取龙虎榜数据（上榜股票+席位明细+净买额排名）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.signal.dragonTigerBoard(ctx.target.code);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    return JSON.stringify({ symbol: ctx.target.code, count: res.data.length, source: res.source, entries: res.data.slice(0, 10) });
  },
};

const marginTradingTool: ToolDefinition = {
  name: "get-margin-trading",
  description: "获取融资融券数据（融资余额/买入/偿还/融券余额）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.capital.marginTrading(ctx.target.code);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    return JSON.stringify({ symbol: ctx.target.code, count: res.data.length, source: res.source, recent: res.data.slice(0, 20) });
  },
};

const conceptBlocksTool: ToolDefinition = {
  name: "get-concept-blocks",
  description: "获取个股所属概念/行业/地域板块归属",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.signal.conceptBlocks(ctx.target.code);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    return JSON.stringify({ symbol: ctx.target.code, count: res.data.length, source: res.source, blocks: res.data });
  },
};

const shareholdersTool: ToolDefinition = {
  name: "get-shareholders",
  description: "获取股东户数变化（筹码集中度分析）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.capital.shareholders(ctx.target.code);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    return JSON.stringify({ symbol: ctx.target.code, count: res.data.length, source: res.source, history: res.data });
  },
};

const hotStocksTool: ToolDefinition = {
  name: "get-hot-stocks",
  description: "获取当日强势股榜单及题材归因",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.signal.hotStocks();
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    return JSON.stringify({ count: res.data.length, source: res.source, hotStocks: res.data.slice(0, 30) });
  },
};

const northBoundTool: ToolDefinition = {
  name: "get-north-bound",
  description: "获取北向资金动向（沪股通/深股通分钟级资金流向）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.signal.northBound();
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    const latest = res.data.slice(-20);
    const totalNet = latest.reduce((s, f) => s + f.netFlow, 0);
    return JSON.stringify({ source: res.source, recent20: latest, totalNetFlowWan: totalNet });
  },
};

/**
 * 工具注册表 — YAML agent 通过字符串名称查找工具实现。
 *
 * YAML agent 的 tools 字段列出工具名称（如 "kline", "macd", "fund_flow"），
 * RoleLoader 通过此 Map 将名称解析为 ToolDefinition，再包装为 LangChain StructuredTool。
 *
 * 新增工具时，在此 Map 中添加条目即可生效。
 */
export const toolsByName = new Map<string, ToolDefinition>([
  ["kline", klineTool],
  ["macd", macdTool],
  ["rsi", rsiTool],
  ["ma", maTool],
  ["fund_flow", fundFlowTool],
  ["get-news", newsTool],
  ["get-announcement", announcementTool],
  ["financial_data", financialDataTool],
  ["block_trade", blockTradeTool],
  ["quote", quoteTool],
  ["dragon_tiger", dragonTigerTool],
  ["margin_trading", marginTradingTool],
  ["concept_blocks", conceptBlocksTool],
  ["shareholders", shareholdersTool],
  ["hot_stocks", hotStocksTool],
  ["north_bound", northBoundTool],
  ["macro_indicator", macroIndicatorTool],
  ["social_sentiment", socialSentimentTool],
  ["volume", volumeTool],
  ["indicator", indicatorTool],
  ["web_search", webSearchTool],
  ["web_fetch", webFetchTool],
]);
