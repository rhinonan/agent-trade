import type { BaseAgent, AgentPersona, ExecutionContext, Analysis } from "../engine/types.js";
import type { StructuredTool } from "@langchain/core/tools";

export abstract class AgentBase implements BaseAgent {
  abstract id: string;
  abstract name: string;
  abstract capabilities: string[];
  abstract personality: AgentPersona;
  tools: StructuredTool[] = [];
  canCritique = false;
  canDebate = false;

  abstract analyze(context: ExecutionContext): Promise<Analysis>;
}
