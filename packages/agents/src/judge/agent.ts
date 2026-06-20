import type { BaseAgent, AgentPersona, Analysis } from "@agenttrade/core";
import type { ExecutionContext } from "@agenttrade/core";
import type { StructuredTool } from "@langchain/core/tools";
import { JUDGE_SYSTEM_PROMPT } from "./prompts.js";

export class JudgeAgent implements BaseAgent {
  id = "judge";
  name = "裁判/研判Agent";
  capabilities = ["judge", "synthesizer", "neutral"];
  personality: AgentPersona = { stance: "neutral", style: "balanced", description: "公正的首席分析师" };
  tools: StructuredTool[] = [];

  canCritique = true;
  canDebate = false;

  async analyze(_context: ExecutionContext): Promise<Analysis> {
    throw new Error("JudgeAgent.analyze() should be called via executeSynthesize primitive");
  }
}
