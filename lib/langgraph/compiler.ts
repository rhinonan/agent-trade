import type { WorkflowYaml } from "../role-loader/schema.js";
import type { RoleLoader } from "../role-loader/loader.js";
import { buildStateGraph } from "./builder.js";
import type { Runnable } from "@langchain/core/runnables";
import type { AStockClient } from "../data-sdk/client.js";

export interface CompiledWorkflow {
  name: string;
  graph: ReturnType<typeof buildStateGraph>;
}

export interface AgentNodeCallbacks {
  onAgentThinking?(nodeId: string, agentName: string): Promise<void>;
  onToolCall?(nodeId: string, agentName: string, tool: string, args: Record<string, unknown>): Promise<void>;
  onToolResult?(nodeId: string, agentName: string, tool: string, result: string): Promise<void>;
  onAgentWriting?(nodeId: string, agentName: string, conclusion: string, reasoning: string): Promise<void>;
}

type LLMFactory = () => Runnable;

/**
 * Top-level compiler: WorkflowYaml -> CompiledWorkflow.
 * Variable {{target}} is resolved at invocation time, not compile time.
 */
export function compileWorkflow(
  workflow: WorkflowYaml,
  loader: RoleLoader,
  llmFactory: LLMFactory,
  dataClient: AStockClient,
  agentCallbacks?: AgentNodeCallbacks,
): CompiledWorkflow {
  return {
    name: workflow.name,
    graph: buildStateGraph(workflow, loader, llmFactory, dataClient, agentCallbacks),
  };
}
