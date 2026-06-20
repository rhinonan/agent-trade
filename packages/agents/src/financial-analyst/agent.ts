import type { BaseAgent, AgentPersona, Analysis } from "@agenttrade/core";
import type { ExecutionContext } from "@agenttrade/core";
import type { StructuredTool } from "@langchain/core/tools";
import { FINANCIAL_SYSTEM_PROMPT, getStanceGuide } from "./prompts.js";
import { getFinancialSummaryTool, getValuationTool } from "./tools.js";

export class FinancialReportAgent implements BaseAgent {
  id: string;
  name = "财报分析Agent";
  capabilities = ["fundamental", "financial-report", "valuation", "a-share"];
  personality: AgentPersona;
  tools: StructuredTool[];

  constructor(config: { id: string; personality: AgentPersona }) {
    this.id = config.id;
    this.personality = config.personality;
    this.capabilities = [...this.capabilities, config.personality.stance];
    this.tools = [getFinancialSummaryTool, getValuationTool] as unknown as StructuredTool[];
  }

  canCritique = true;
  canDebate = true;

  async analyze(_context: ExecutionContext): Promise<Analysis> {
    throw new Error("FinancialReportAgent.analyze() should be called via executeAnalyze primitive");
  }
}
