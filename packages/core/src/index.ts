export const VERSION = "0.1.0";

export type { TargetType, AnalysisTarget } from "./types.js";
export type {
  BaseAgent,
  Capability,
  AgentPersona,
  Analysis,
} from "./agent/types.js";
export type {
  PrimitiveType,
  AgentMatch,
  AgentCount,
  WorkflowStep,
  WorkflowDAG,
  Finding,
  DebateRound,
  ExecutionContext,
} from "./workflow/types.js";

export { AgentRegistry } from "./agent/registry.js";
export { loadAgents, registerInstances } from "./agent/loader.js";
export { HumanAgent, setHumanInputHandler } from "./agent/human-agent.js";
export type { HumanInputRequest, HumanInputHandler } from "./agent/human-agent.js";
