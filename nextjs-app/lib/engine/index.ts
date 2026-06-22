// ——— Types ———
export type { TargetType, AnalysisTarget } from "./types.js";
export type { BaseAgent, Capability, AgentPersona, Analysis } from "./types.js";
export type {
  PrimitiveType,
  AgentMatch,
  AgentCount,
  WorkflowStep,
  WorkflowDAG,
  Finding,
  DebateRound,
  ExecutionContext,
} from "./types.js";

// ——— Registry ———
export { AgentRegistry } from "./registry.js";

// ——— Context ———
export {
  createContext,
  addFinding,
  addDebateRound,
  getAgentFindings,
  getStepFindings,
  getLatestFinding,
} from "./context.js";

// ——— Primitives ———
export { executeAnalyze } from "./primitives/analyze.js";
export { executePanel } from "./primitives/panel.js";
export { executeCritique } from "./primitives/critique.js";
export { executeDebate } from "./primitives/debate.js";
export { executeVote } from "./primitives/vote.js";
export { executeSynthesize } from "./primitives/synthesize.js";

// ——— Builder DSL ———
export {
  defineWorkflow,
  analyze,
  critique,
  parallel,
  sequential,
  panel,
  synthesize,
  vote,
  debate,
} from "./builder.js";

// ——— Scheduler ———
export { WorkflowScheduler } from "./scheduler.js";
export type { SchedulerEvents } from "./scheduler.js";

// ——— LLM layer ———
export { setDefaultLLMProvider, createLLM } from "../llm/create-llm.js";
export { parseLLMJson, parseSentiment } from "../llm/parse.js";
export type { AnalyzeOptions, LLMProvider } from "../llm/create-llm.js";
export type { Sentiment } from "../llm/parse.js";
