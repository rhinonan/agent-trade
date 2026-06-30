import { StateGraph, END, START } from "@langchain/langgraph";
import type { WorkflowYaml } from "../role-loader/schema.js";
import type { RoleLoader } from "../role-loader/loader.js";
import { WorkflowState } from "./state.js";
import { buildAgentNode } from "./nodes.js";
import { buildDebateSubgraph } from "./debate.js";

import type { Runnable } from "@langchain/core/runnables";
import type { AStockClient } from "../data-sdk/client.js";

type LLMFactory = () => Runnable;

/**
 * 将 WorkflowYaml 配置编译为可执行的 LangGraph StateGraph。
 *
 * 边的路由规则：
 * - 没有 depends_on 的节点 → 从 START 并行启动（可同时执行多个独立分析）
 * - 有 depends_on 的节点 → 等待所有依赖节点完成后才执行
 * - 不被任何其他节点依赖的节点（叶子节点） → 连接到 END
 *
 * 辩论节点处理：
 * - type === "debate" 的节点委托给 buildDebateSubgraph() 构建子图
 * - 子图在添加前先调用 .compile() 编译
 *
 * Prompt 传递说明：
 * - task prompt 作为 {input} 值传给 LangChain agent 模板，而非 LangChain 模板本身
 * - resolveStateVariables() 在运行时解析 {{target}} 等状态变量
 */
export function buildStateGraph(
  workflow: WorkflowYaml,
  loader: RoleLoader,
  llmFactory: LLMFactory,
  dataClient: AStockClient,
  agentCallbacks?: import("./compiler.js").AgentNodeCallbacks,
) {
  const graph = new StateGraph(WorkflowState);

  // 记录哪些节点被其他节点依赖（用于确定哪些节点需要连接到 END）
  const isDependedOn = new Set<string>();

  for (const node of workflow.nodes) {
    for (const dep of node.depends_on ?? []) {
      isDependedOn.add(dep);
    }

    if (node.type === "debate") {
      // 辩论类型 → 构建子图，编译后作为单个节点注册
      const debateSubgraph = buildDebateSubgraph(node, loader, llmFactory, agentCallbacks);
      graph.addNode(node.id, debateSubgraph.compile() as any);
    } else {
      const agent = loader.getAgent(node.agent);
      if (!agent) {
        throw new Error(
          `Agent "${node.agent}" not found for node "${node.id}" in workflow "${workflow.name}"`
        );
      }
      // task prompt 作为 {input} 值传给 LangChain agent 模板，而非 LangChain 模板本身。
      // resolveStateVariables() 在运行时处理 {{target}} 和其他状态变量。
      const prompt = node.prompt ?? `分析 {{target}}`;
      graph.addNode(node.id, buildAgentNode(agent, prompt, llmFactory, dataClient, node.id, agentCallbacks));
    }
  }

  // 添加边：无依赖的节点从 START 并行启动，有依赖的等待依赖完成
  for (const node of workflow.nodes) {
    if ((node.depends_on ?? []).length === 0) {
      graph.addEdge(START as any, node.id as any);
    } else {
      for (const dep of node.depends_on!) {
        graph.addEdge(dep as any, node.id as any);
      }
    }
  }

  // 叶子节点（不被任何节点依赖）→ END
  for (const node of workflow.nodes) {
    if (!isDependedOn.has(node.id)) {
      graph.addEdge(node.id as any, END as any);
    }
  }

  return graph;
}
