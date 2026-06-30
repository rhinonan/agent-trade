import type { WorkflowYaml } from "../role-loader/schema.js";
import type { RoleLoader } from "../role-loader/loader.js";
import { buildStateGraph } from "./builder.js";
import type { Runnable } from "@langchain/core/runnables";
import type { AStockClient } from "../data-sdk/client.js";

/** 编译后的工作流：包含名称和尚未编译的 StateGraph */
export interface CompiledWorkflow {
  name: string;
  /** StateGraph 实例，此时尚未调用 .compile()，编译在 runner.ts 中执行 */
  graph: ReturnType<typeof buildStateGraph>;
}

/**
 * Agent 节点生命周期回调接口。
 *
 * 回调按以下顺序触发：
 * 1. onAgentThinking — Agent 开始思考（辩论发言者开始准备论点）
 * 2. onToolCall     — 工具调用开始（可多次触发）
 * 3. onToolResult   — 工具调用返回结果（与 onToolCall 一一对应）
 * 4. onAgentWriting — Agent 输出结论和推理过程（前端打字机效果）
 *
 * 所有回调通过 WebSocket 推送到前端，实现实时进度展示。
 */
export interface AgentNodeCallbacks {
  /** Agent 开始思考时触发 */
  onAgentThinking?(nodeId: string, agentName: string): Promise<void>;
  /** Agent 调用工具时触发，args 为解析后的工具参数 */
  onToolCall?(nodeId: string, agentName: string, tool: string, args: Record<string, unknown>): Promise<void>;
  /** 工具返回结果时触发，result 为字符串格式的输出 */
  onToolResult?(nodeId: string, agentName: string, tool: string, result: string): Promise<void>;
  /** Agent 输出结论和推理过程时触发，供前端打字机效果使用 */
  onAgentWriting?(nodeId: string, agentName: string, conclusion: string, reasoning: string): Promise<void>;
}

type LLMFactory = () => Runnable;

/**
 * 顶层编译入口：将 WorkflowYaml 配置转为 CompiledWorkflow。
 *
 * 注意：模板变量 {{target}} 在运行时解析（调用时），而非编译时。
 * 这意味着同一个编译后的 workflow 可以对不同目标代码重复使用。
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
