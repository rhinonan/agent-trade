import type { AgentPersona, ExecutionContext, Analysis } from "../engine/types.js";
import type { StructuredTool } from "@langchain/core/tools";
import { BaseAgent } from "../engine/types.js";

export class FinancialReportAgent implements BaseAgent {
  id: string;
  name = "财报分析师";
  capabilities = ["fundamental"];
  personality: AgentPersona;
  tools: StructuredTool[] = [];
  canCritique = true;
  canDebate = true;

  constructor(config: { id: string; personality: AgentPersona }) {
    this.id = config.id;
    this.personality = config.personality;
  }

  async analyze(_context: ExecutionContext): Promise<Analysis> {
    // The actual LLM interaction happens in executeAnalyze primitive.
    // This method exists for interface compliance but is not called directly by the scheduler.
    return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
  }
}
