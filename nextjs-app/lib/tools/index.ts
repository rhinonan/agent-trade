import { klineTool as _kline } from "./kline.js";
import { macdTool as _macd, rsiTool as _rsi, maTool as _ma } from "./indicator.js";
import type { ToolDefinition } from "./types.js";

export { klineTool } from "./kline.js";
export { macdTool, rsiTool, maTool } from "./indicator.js";
export type { ToolDefinition, ToolContext, PropertySchema } from "./types.js";

// ——— Stub tools (not yet implemented — degrade gracefully) ———

function stub(name: string, description: string): ToolDefinition {
  return {
    name,
    description,
    parameters: { type: "object", properties: {}, required: [] },
    async execute() {
      return JSON.stringify({
        error: "not_implemented",
        message: `工具 "${name}" 尚未实现，将降至纯LLM推理`,
      });
    },
  };
}

const _fundFlow = stub("get-fund-flow", "获取资金流向数据（主力/散户净流入流出）");
const _news = stub("get-news", "获取相关新闻资讯（含情感标签）");
const _announcement = stub("get-announcement", "获取上市公司公告");
const _financialData = stub("get-financial-data", "获取财务数据（营收/利润/资产负债/现金流等）");
const _blockTrade = stub("get-block-trade", "获取大宗交易数据（折溢价/席位信息）");
const _macroIndicator = stub("get-macro-indicator", "获取宏观经济指标（GDP/CPI/PMI/利率等）");
const _quote = stub("get-quote", "获取实时行情报价（最新价/涨跌幅/换手率等）");
const _indicator = stub("calc-indicator", "计算综合技术指标（批量返回MACD/RSI/KDJ/布林带等）");
const _socialSentiment = stub("get-social-sentiment", "获取社交媒体情绪（股吧/雪球/微博热度与方向）");
const _volume = stub("calc-volume", "分析成交量特征（放量/缩量/量比/筹码分布）");

/** Lookup map: short YAML name → ToolDefinition. Keys match the strings used in agent YAML `tools: [...]`. */
export const toolsByName = new Map<string, ToolDefinition>([
  ["kline", _kline],
  ["macd", _macd],
  ["rsi", _rsi],
  ["ma", _ma],
  // ——— Stubs ———
  ["fund_flow", _fundFlow],
  ["news", _news],
  ["announcement", _announcement],
  ["financial_data", _financialData],
  ["block_trade", _blockTrade],
  ["macro_indicator", _macroIndicator],
  ["quote", _quote],
  ["indicator", _indicator],
  ["social_sentiment", _socialSentiment],
  ["volume", _volume],
]);
