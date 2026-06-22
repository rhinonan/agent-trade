import type { AgentInfo } from "@/components/chat/types.js";

export const AGENT_MANIFEST: AgentInfo[] = [
  // ========== 数据感知层 (Perception) ==========
  { id: "market-data", name: "行情数据Agent", capabilities: ["market-data"], layer: "perception" },
  { id: "sentiment-bull", name: "牛方舆情Agent", capabilities: ["sentiment"], layer: "perception" },
  { id: "sentiment-bear", name: "熊方舆情Agent", capabilities: ["sentiment"], layer: "perception" },
  { id: "sentiment-neutral", name: "中性舆情Agent", capabilities: ["sentiment"], layer: "perception" },
  { id: "macro-data", name: "宏观数据Agent", capabilities: ["macro"], layer: "perception" },
  { id: "capital-flow", name: "资金流向Agent", capabilities: ["capital-flow"], layer: "perception" },
  { id: "institutional", name: "机构动向Agent", capabilities: ["institutional"], layer: "perception" },

  // ========== 分析层 (Analysis) ==========
  { id: "technical-bull", name: "牛方技术分析师", capabilities: ["technical", "bullish"], layer: "analysis" },
  { id: "technical-bear", name: "熊方技术分析师", capabilities: ["technical", "bearish"], layer: "analysis" },
  { id: "technical-neutral", name: "中性技术分析师", capabilities: ["technical", "neutral"], layer: "analysis" },
  { id: "financial-bull", name: "牛方财报分析师", capabilities: ["fundamental", "bullish"], layer: "analysis" },
  { id: "financial-bear", name: "熊方财报分析师", capabilities: ["fundamental", "bearish"], layer: "analysis" },
  { id: "financial-neutral", name: "中性财报分析师", capabilities: ["fundamental", "neutral"], layer: "analysis" },
  { id: "valuation-bull", name: "牛方估值分析师", capabilities: ["valuation", "bullish"], layer: "analysis" },
  { id: "valuation-bear", name: "熊方估值分析师", capabilities: ["valuation", "bearish"], layer: "analysis" },
  { id: "valuation-neutral", name: "中性估值分析师", capabilities: ["valuation", "neutral"], layer: "analysis" },
  { id: "pattern-bull", name: "牛方形态分析师", capabilities: ["pattern", "bullish"], layer: "analysis" },
  { id: "pattern-bear", name: "熊方形态分析师", capabilities: ["pattern", "bearish"], layer: "analysis" },
  { id: "event-driven", name: "事件驱动分析师", capabilities: ["event-driven"], layer: "analysis" },
  { id: "volume-bull", name: "牛方量价分析师", capabilities: ["volume", "bullish"], layer: "analysis" },
  { id: "volume-bear", name: "熊方量价分析师", capabilities: ["volume", "bearish"], layer: "analysis" },

  // ========== 决策层 (Decision) ==========
  { id: "judge", name: "裁判/研判Agent", capabilities: ["judge"], layer: "decision" },
  { id: "portfolio-mgr", name: "组合管理Agent", capabilities: ["portfolio"], layer: "decision" },
  { id: "quant-analyst", name: "量化分析Agent", capabilities: ["quantitative"], layer: "decision" },
  { id: "timing-aggressive", name: "激进择时Agent", capabilities: ["timing", "aggressive"], layer: "decision" },
  { id: "timing-conservative", name: "保守择时Agent", capabilities: ["timing", "conservative"], layer: "decision" },
  { id: "hedging", name: "对冲策略Agent", capabilities: ["hedging"], layer: "decision" },

  // ========== 执行层 (Execution) ==========
  { id: "execution", name: "执行Agent", capabilities: ["execution"], layer: "execution" },
  { id: "risk-ctrl", name: "风控Agent", capabilities: ["risk-control"], layer: "execution" },
  { id: "compliance", name: "合规Agent", capabilities: ["compliance"], layer: "execution" },
  { id: "cost-optimizer", name: "成本优化Agent", capabilities: ["cost-optimization"], layer: "execution" },
];
