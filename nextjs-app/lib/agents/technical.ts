import type { AgentPersona, ExecutionContext, Analysis } from "../engine/types.js";
import type { StructuredTool } from "@langchain/core/tools";
import { BaseAgent } from "../engine/types.js";

export class TechnicalAnalystAgent implements BaseAgent {
  id: string;
  name = "技术面分析师";
  capabilities: string[] = [];
  personality: AgentPersona;
  tools: StructuredTool[] = [];
  canCritique = true;
  canDebate = true;
  layer?: string = "analysis";

  constructor(config: { id: string; personality: AgentPersona }) {
    this.id = config.id;
    this.personality = config.personality;
    // Include stance in capabilities so workflow matching works
    this.capabilities = ["technical", config.personality.stance];
  }

  async analyze(_context: ExecutionContext): Promise<Analysis> {
    // The actual LLM interaction happens in executeAnalyze primitive.
    // This method exists for interface compliance but is not called directly by the scheduler.
    return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
  }
}
