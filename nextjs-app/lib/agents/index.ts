import type { AgentRegistry } from "../engine/registry.js";
import { TechnicalAnalystAgent } from "./technical.js";
import { FinancialReportAgent } from "./fundamental.js";
import { JudgeAgent } from "./judge.js";
// Perception layer
import {
  MarketDataAgent,
  SentimentAgent,
  MacroAgent,
  CapitalFlowAgent,
  InstitutionalAgent,
} from "./perception.js";
// Extended analysis layer
import {
  ValuationAgent,
  PatternRecognitionAgent,
  EventDrivenAgent,
  VolumeAnalysisAgent,
} from "./extended-analysis.js";
// Decision layer
import {
  PortfolioManagerAgent,
  TimingAgent,
  HedgingAgent,
  QuantAnalystAgent,
} from "./decision.js";
// Execution & risk control layer
import {
  ExecutionAgent,
  RiskControlAgent,
  ComplianceAgent,
  CostOptimizationAgent,
} from "./execution.js";

// Re-export all agent classes
export {
  // Existing
  TechnicalAnalystAgent,
  FinancialReportAgent,
  JudgeAgent,
  // Perception
  MarketDataAgent,
  SentimentAgent,
  MacroAgent,
  CapitalFlowAgent,
  InstitutionalAgent,
  // Extended analysis
  ValuationAgent,
  PatternRecognitionAgent,
  EventDrivenAgent,
  VolumeAnalysisAgent,
  // Decision
  PortfolioManagerAgent,
  TimingAgent,
  HedgingAgent,
  QuantAnalystAgent,
  // Execution & risk
  ExecutionAgent,
  RiskControlAgent,
  ComplianceAgent,
  CostOptimizationAgent,
};

export function registerBuiltinAgents(registry: AgentRegistry): void {
  // ========== 数据感知层 ==========
  registry.register(new MarketDataAgent({ id: "market-data" }));
  registry.register(new SentimentAgent({ id: "sentiment-bull", personality: { stance: "bullish", style: "optimistic" } }));
  registry.register(new SentimentAgent({ id: "sentiment-bear", personality: { stance: "bearish", style: "skeptical" } }));
  registry.register(new SentimentAgent({ id: "sentiment-neutral", personality: { stance: "neutral" } }));
  registry.register(new MacroAgent({ id: "macro-data" }));
  registry.register(new CapitalFlowAgent({ id: "capital-flow" }));
  registry.register(new InstitutionalAgent({ id: "institutional" }));

  // ========== 分析层 ==========
  // 技术面 — 已有
  registry.register(new TechnicalAnalystAgent({ id: "technical-bull", personality: { stance: "bullish", style: "optimistic" } }));
  registry.register(new TechnicalAnalystAgent({ id: "technical-bear", personality: { stance: "bearish", style: "skeptical" } }));
  registry.register(new TechnicalAnalystAgent({ id: "technical-neutral", personality: { stance: "neutral" } }));

  // 财报/基本面 — 已有
  registry.register(new FinancialReportAgent({ id: "financial-bull", personality: { stance: "bullish" } }));
  registry.register(new FinancialReportAgent({ id: "financial-bear", personality: { stance: "bearish" } }));
  registry.register(new FinancialReportAgent({ id: "financial-neutral", personality: { stance: "neutral" } }));

  // 估值分析
  registry.register(new ValuationAgent({ id: "valuation-bull", personality: { stance: "bullish", style: "optimistic" } }));
  registry.register(new ValuationAgent({ id: "valuation-bear", personality: { stance: "bearish", style: "skeptical" } }));
  registry.register(new ValuationAgent({ id: "valuation-neutral", personality: { stance: "neutral" } }));

  // 形态识别
  registry.register(new PatternRecognitionAgent({ id: "pattern-bull", personality: { stance: "bullish", style: "optimistic" } }));
  registry.register(new PatternRecognitionAgent({ id: "pattern-bear", personality: { stance: "bearish", style: "skeptical" } }));

  // 事件驱动
  registry.register(new EventDrivenAgent({ id: "event-driven" }));

  // 量价分析
  registry.register(new VolumeAnalysisAgent({ id: "volume-bull", personality: { stance: "bullish" } }));
  registry.register(new VolumeAnalysisAgent({ id: "volume-bear", personality: { stance: "bearish" } }));

  // ========== 决策层 ==========
  registry.register(new JudgeAgent()); // 裁判
  registry.register(new PortfolioManagerAgent()); // 组合管理
  registry.register(new QuantAnalystAgent()); // 量化分析
  registry.register(new TimingAgent({ id: "timing-aggressive", personality: { stance: "bullish", style: "aggressive" } }));
  registry.register(new TimingAgent({ id: "timing-conservative", personality: { stance: "bearish", style: "conservative" } }));
  registry.register(new HedgingAgent()); // 对冲策略

  // ========== 执行与风控层 ==========
  registry.register(new ExecutionAgent()); // 执行
  registry.register(new RiskControlAgent()); // 风控
  registry.register(new ComplianceAgent()); // 合规
  registry.register(new CostOptimizationAgent()); // 成本优化
}
