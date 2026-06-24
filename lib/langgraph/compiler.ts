import type { WorkflowYaml } from "../role-loader/schema.js";
import type { RoleLoader } from "../role-loader/loader.js";
import { buildStateGraph } from "./builder.js";
import type { Runnable } from "@langchain/core/runnables";
import type { AStockClient } from "../data-sdk/client.js";

export interface CompiledWorkflow {
  name: string;
  graph: ReturnType<typeof buildStateGraph>;
}

type LLMFactory = () => Runnable;

/**
 * Top-level compiler: WorkflowYaml → CompiledWorkflow.
 * Variable {{target}} is resolved at invocation time, not compile time.
 */
export function compileWorkflow(
  workflow: WorkflowYaml,
  loader: RoleLoader,
  llmFactory: LLMFactory,
  dataClient: AStockClient,
): CompiledWorkflow {
  return {
    name: workflow.name,
    graph: buildStateGraph(workflow, loader, llmFactory, dataClient),
  };
}
