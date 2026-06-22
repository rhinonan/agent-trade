import type { AgentPersona, ExecutionContext, Analysis } from "../engine/types.js";
import type { StructuredTool } from "@langchain/core/tools";
import { BaseAgent } from "../engine/types.js";

export class JudgeAgent implements BaseAgent {
  id = "judge";
  name = "裁判/研判Agent";
  capabilities = ["judge"];
  personality: AgentPersona = { stance: "neutral" };
  tools: StructuredTool[] = [];
  canCritique = true;
  canDebate = false;

  async analyze(_context: ExecutionContext): Promise<Analysis> {
    // The actual LLM interaction happens in executeSynthesize primitive.
    // This method exists for interface compliance but is not called directly by the scheduler.
    return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
  }
}
