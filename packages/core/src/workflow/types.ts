import type { AnalysisTarget } from "../types.js";
import type { Analysis } from "../agent/types.js";

export type PrimitiveType =
  | "analyze"
  | "panel"
  | "critique"
  | "debate"
  | "vote"
  | "synthesize"
  | "parallel"
  | "sequential";

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
