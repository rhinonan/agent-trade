import type { AgentRegistry } from "../engine/registry.js";
import { TechnicalAnalystAgent } from "./technical.js";
import { FinancialReportAgent } from "./fundamental.js";
import { JudgeAgent } from "./judge.js";

export { TechnicalAnalystAgent, FinancialReportAgent, JudgeAgent };

export function registerBuiltinAgents(registry: AgentRegistry): void {
  registry.register(new TechnicalAnalystAgent({ id: "technical-bull", personality: { stance: "bullish", style: "optimistic" } }));
  registry.register(new TechnicalAnalystAgent({ id: "technical-bear", personality: { stance: "bearish", style: "skeptical" } }));
  registry.register(new TechnicalAnalystAgent({ id: "technical-neutral", personality: { stance: "neutral" } }));
  registry.register(new FinancialReportAgent({ id: "financial-bull", personality: { stance: "bullish" } }));
  registry.register(new FinancialReportAgent({ id: "financial-bear", personality: { stance: "bearish" } }));
  registry.register(new FinancialReportAgent({ id: "financial-neutral", personality: { stance: "neutral" } }));
  registry.register(new JudgeAgent());
}
