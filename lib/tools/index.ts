import { klineTool } from "./kline.js";
import { macdTool, rsiTool, maTool } from "./indicator.js";
import type { ToolDefinition } from "./types.js";

export { klineTool } from "./kline.js";
export { macdTool, rsiTool, maTool } from "./indicator.js";
export type { ToolDefinition, ToolContext, PropertySchema } from "./types.js";

// ─── Real tool implementations using AStockClient ───

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

// ─── New tools ───

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

/** Lookup map: YAML tool name → ToolDefinition. */
export const toolsByName = new Map<string, ToolDefinition>([
  ["kline", klineTool],
  ["macd", macdTool],
  ["rsi", rsiTool],
  ["ma", maTool],
  ["fund_flow", fundFlowTool],
  ["news", newsTool],
  ["announcement", announcementTool],
  ["financial_data", financialDataTool],
  ["block_trade", blockTradeTool],
  ["quote", quoteTool],
  ["dragon_tiger", dragonTigerTool],
  ["margin_trading", marginTradingTool],
  ["concept_blocks", conceptBlocksTool],
  ["shareholders", shareholdersTool],
  ["hot_stocks", hotStocksTool],
  ["north_bound", northBoundTool],
]);
