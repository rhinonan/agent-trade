import { StateGraph, END, START } from "@langchain/langgraph";
import type { WorkflowYaml } from "../role-loader/schema.js";
import type { RoleLoader } from "../role-loader/loader.js";
import { WorkflowState } from "./state.js";
import { buildAgentNode } from "./nodes.js";
import { buildDebateSubgraph } from "./debate.js";
import { interpolateTemplate } from "../role-loader/loader.js";
import type { Runnable } from "@langchain/core/runnables";
import type { AStockClient } from "../data-sdk/client.js";

type LLMFactory = () => Runnable;

/**
 * Compile a WorkflowYaml into an executable LangGraph StateGraph.
 *
 * Edge rules:
 * - Nodes without depends_on → run in parallel from START
 * - Nodes with depends_on → wait for all listed nodes, then run
 * - Nodes not depended on by anyone → connect to END
 */
export function buildStateGraph(
  workflow: WorkflowYaml,
  loader: RoleLoader,
  llmFactory: LLMFactory,
  dataClient: AStockClient,
  agentCallbacks?: import("./compiler.js").AgentNodeCallbacks,
) {
  const graph = new StateGraph(WorkflowState);

  // Track which nodes are depended on (sinks → END)
  const isDependedOn = new Set<string>();

  for (const node of workflow.nodes) {
    for (const dep of node.depends_on ?? []) {
      isDependedOn.add(dep);
    }

    if (node.type === "debate") {
      // Debate is a subgraph
      const debateSubgraph = buildDebateSubgraph(node, loader, llmFactory);
      graph.addNode(node.id, debateSubgraph.compile() as any);
    } else {
      const agent = loader.getAgent(node.agent);
      if (!agent) {
        throw new Error(
          `Agent "${node.agent}" not found for node "${node.id}" in workflow "${workflow.name}"`
        );
      }
      const prompt = interpolateTemplate(node.prompt ?? `分析 {{target}}`);
      graph.addNode(node.id, buildAgentNode(agent, prompt, llmFactory, dataClient, node.id, agentCallbacks));
    }
  }

  // Add edges
  for (const node of workflow.nodes) {
    if ((node.depends_on ?? []).length === 0) {
      graph.addEdge(START as any, node.id as any);
    } else {
      for (const dep of node.depends_on!) {
        graph.addEdge(dep as any, node.id as any);
      }
    }
  }

  // Nodes not depended on → END
  for (const node of workflow.nodes) {
    if (!isDependedOn.has(node.id)) {
      graph.addEdge(node.id as any, END as any);
    }
  }

  return graph;
}
