import type { StructuredTool } from "@langchain/core/tools";
import type { ToolDefinition } from "../tools/types.js";

// ——— Analysis Target ———
export type TargetType = "stock" | "sector" | "index";

export interface AnalysisTarget {
  type: TargetType;
  code: string;
  name?: string;
}

// ——— Agent ———
export type Capability = string;

export interface AgentPersona {
  stance: "bullish" | "bearish" | "neutral";
  style?: "aggressive" | "balanced" | "conservative" | "optimistic" | "skeptical";
  description?: string;
}

export interface Analysis {
  conclusion: string;
  confidence: number;   // 0–1
  sentiment: "bullish" | "bearish" | "neutral";
  reasoning: string[];
  rawOutput?: string;
  forcedSummary?: boolean;  // true when ReAct loop hit maxSteps and forced a summary
}

export interface BaseAgent {
  id: string;
  name: string;
  capabilities: Capability[];
  layer?: string; // "perception" | "analysis" | "decision" | "execution"
  personality: AgentPersona;
  tools: (StructuredTool | ToolDefinition)[];

  /** Optional override: a static system prompt string, or a function that returns one given context. */
  systemPrompt?: string | ((context: ExecutionContext) => string);

  analyze(context: ExecutionContext): Promise<Analysis>;

  canCritique?: boolean;
  canDebate?: boolean;
}

// ——— Workflow ———
export type PrimitiveType =
  | "analyze" | "panel" | "critique" | "debate"
  | "vote" | "synthesize" | "parallel" | "sequential";

export interface AgentMatch {
  id?: string;
  capability?: string;
  not?: string[];
}

export interface AgentCount {
  min?: number;
  max?: number;
}

export interface WorkflowStep {
  id: string;
  type: PrimitiveType;
  prompt?: string;
  agent?: AgentMatch | AgentMatch[];
  match?: AgentMatch;
  count?: AgentCount | "all";
  targetStep?: string;
  reviewer?: string;
  maxRounds?: number;
  children?: WorkflowStep[];
  next?: string[];
}

export interface WorkflowDAG {
  name: string;
  version: string;
  description?: string;
  steps: WorkflowStep[];
}

export interface Finding {
  step: string;
  agent: string;
  analysis: Analysis;
  timestamp: number;
}

export interface DebateRound {
  round: number;
  entries: {
    agent: string;
    argument: string;
    target?: string;
  }[];
}

export interface ExecutionContext {
  target: AnalysisTarget;
  task: string;
  findings: Finding[];
  debateRounds: DebateRound[];
  workflowName: string;
  startedAt: number;
}
