import type { StructuredTool } from "@langchain/core/tools";

export type Capability = string;

export interface AgentPersona {
  stance: "bullish" | "bearish" | "neutral";
  style?: "aggressive" | "balanced" | "conservative";
  description?: string;
}

export interface Analysis {
  conclusion: string;
  confidence: number;   // 0-1
  sentiment: "bullish" | "bearish" | "neutral";
  reasoning: string[];
  rawOutput?: string;
}

export interface BaseAgent {
  id: string;
  name: string;
  capabilities: Capability[];
  personality: AgentPersona;
  tools: StructuredTool[];

  analyze(context: import("../workflow/types.js").ExecutionContext): Promise<Analysis>;

  canCritique?: boolean;
  canDebate?: boolean;
}
