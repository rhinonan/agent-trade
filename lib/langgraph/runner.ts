import * as fs from "node:fs";
import * as path from "node:path";
import { load as parseYaml } from "js-yaml";
import type { WorkflowYaml } from "../role-loader/schema.js";
import { WorkflowYamlSchema } from "../role-loader/schema.js";
import { getRoleLoader } from "../role-loader/loader.js";
import { compileWorkflow } from "./compiler.js";
import { createLLM, type AnalyzeOptions } from "../llm/create-llm.js";
import { AStockClient } from "../data-sdk/client.js";
import { createLogger } from "../logger.js";

/**
 * 工作流编排器 — agent-trade 的顶层执行入口。
 *
 * 完整流水线：
 * 1. 加载 YAML（确保 agent 和 workflow 已加载到 RoleLoader 单例）
 * 2. 编译工作流（WorkflowYaml → CompiledWorkflow，委托给 compiler.ts）
 * 3. 构建 agent 名称映射（用于 WebSocket 事件推送时关联 nodeId → agentName）
 * 4. 流式执行（LangGraph stream，每个节点完成后推送事件到前端）
 * 5. 返回累计的最终状态（findings + messages + stop_reason）
 */

const log = createLogger("runner");

// ——— 公开接口 ———

/** 工作流运行结果 */
export interface WorkflowRunResult {
  /** 所有节点的分析结果，key 为 node_id */
  findings: Record<string, unknown>;
  /** 辩论消息记录 */
  messages: { role: string; content: string }[];
  /** 辩论终止原因 */
  stop_reason: string;
}

/** 工作流运行回调接口 */
export interface WorkflowRunCallbacks {
  /** 节点开始执行时触发 */
  onNodeStart?(nodeId: string, agentName: string): Promise<void>;
  /** 节点执行完成时触发 */
  onNodeEnd?(nodeId: string, result: unknown): Promise<void>;
  /** 流式输出块（已废弃） */
  onStreamChunk?(chunk: string): Promise<void>;
  /** Agent 开始思考时触发 */
  onAgentThinking?(nodeId: string, agentName: string): Promise<void>;
  /** Agent 调用工具时触发，ts 为本次 tool call 的唯一时间戳（与 onToolResult 共享） */
  onToolCall?(nodeId: string, agentName: string, tool: string, args: Record<string, unknown>, ts: number): Promise<void>;
  /** 工具返回结果时触发，ts 与对应的 onToolCall 相同 */
  onToolResult?(nodeId: string, agentName: string, tool: string, result: string, ts: number): Promise<void>;
  /** Agent 输出结论和推理时触发 */
  onAgentWriting?(nodeId: string, agentName: string, conclusion: string, reasoning: string): Promise<void>;
}

// ——— YAML 加载 ———

/**
 * 根据 workflow 配置计算所需的 LangGraph 递归限制。
 *
 * 每轮辩论约消耗 8 个 LangGraph 步骤：
 *   speaker → route → speaker → route → check_yield → route → increment_round → route
 *
 * 默认 LangGraph 限制为 25，仅够约 3 轮辩论 — 远远不够。
 * max_rounds=50 时约需 400+ 步。公式：100 + max_rounds * 10（包含缓冲和开销）。
 */
function computeRecursionLimit(workflow: WorkflowYaml): number {
  let limit = 50; // 无辩论的简单 workflow 的基础值

  for (const node of workflow.nodes) {
    if (node.type === "debate") {
      const maxRounds = node.max_rounds ?? 10;
      // 每轮 10 步（8 实际 + 2 缓冲）+ START 路由、set_max_end 和父图节点的开销
      const needed = 100 + maxRounds * 10;
      limit = Math.max(limit, needed);
    }
  }

  return limit;
}

/**
 * 解析角色目录的绝对路径。
 * 角色存储在 <repo-root>/roles/ 下。
 */
function resolveRolesDir(): string {
  return path.resolve(process.cwd(), "roles");
}

/**
 * 从 roles/workflows/<name>.yaml 加载 workflow YAML。
 * 返回前会通过 WorkflowYamlSchema 进行 Zod 校验。
 */
export async function loadWorkflowYaml(name: string): Promise<WorkflowYaml> {
  const filePath = path.join(resolveRolesDir(), "workflows", `${name}.yaml`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Workflow YAML not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = parseYaml(raw);
  return WorkflowYamlSchema.parse(parsed);
}

/** 内建 agent 是否已加载（幂等保护） */
let _builtinAgentsLoaded = false;
/** 内建 workflow 是否已加载（幂等保护） */
let _builtinWorkflowsLoaded = false;

/**
 * 从 workflow YAML 构建 nodeId → agentName 查找映射。
 *
 * 用途：WebSocket 事件推送时，需要知道每个节点对应的 agent 名称。
 *
 * 映射规则：
 * - 标准节点：node.id → node.agent
 * - 辩论节点内部 ID（角色命名，如 多方_speak、空方_speak）→ 对应参与者的 agent
 * - 辩论工具节点（check_yield、increment_round、set_max_end）→ 辩论节点 ID
 */
function buildAgentNameMap(
  workflow: WorkflowYaml,
  loader: ReturnType<typeof getRoleLoader>,
): Map<string, string> {
  const map = new Map<string, string>();

  for (const node of workflow.nodes) {
    if (node.type === "debate") {
      // 辩论子图的内部节点 — 使用角色命名的 ID
      const participants = node.participants ?? [];
      if (participants.length >= 1) {
        map.set(`${participants[0].role}_speak`, participants[0].agent);
      }
      if (participants.length >= 2) {
        map.set(`${participants[1].role}_speak`, participants[1].agent);
      }
      // check_yield、increment_round、set_max_end 都属于辩论节点
      map.set("check_yield", node.id);
      map.set("increment_round", node.id);
      map.set("set_max_end", node.id);
    } else {
      map.set(node.id, node.agent);
    }
  }

  return map;
}

/**
 * 确保 RoleLoader 单例已加载内建 agent 和 workflow。
 * 幂等操作 — 同一进程中已加载则跳过扫描。
 */
export async function ensureAgentsLoaded(): Promise<void> {
  const loader = getRoleLoader();
  if (!_builtinAgentsLoaded) {
    const agentsDir = path.join(resolveRolesDir(), "agents");
    await loader.scanAgents(agentsDir);
    _builtinAgentsLoaded = true;
  }
  if (!_builtinWorkflowsLoaded) {
    const workflowsDir = path.join(resolveRolesDir(), "workflows");
    if (fs.existsSync(workflowsDir)) {
      await loader.scanWorkflows(workflowsDir);
    }
    _builtinWorkflowsLoaded = true;
  }
}

// ——— 核心执行器 ———

/**
 * 对目标代码执行一个 WorkflowYaml。
 *
 * 执行流水线：
 * 1. 确保 agent 已加载到 RoleLoader 单例
 * 2. 编译 workflow 为 LangGraph StateGraph
 * 3. 流式执行各节点，每次节点完成后触发生命周期回调
 * 4. 返回累计的最终状态
 */
export async function runWorkflow(
  workflow: WorkflowYaml,
  target: string,
  options: AnalyzeOptions = {},
  callbacks: WorkflowRunCallbacks = {},
): Promise<WorkflowRunResult> {
  await ensureAgentsLoaded();
  const loader = getRoleLoader();
  const llmFactory = () => createLLM(options);
  const dataClient = new AStockClient();

  log.info("Compiling workflow", { workflow: workflow.name, target, provider: options.provider ?? "default" });

  const compiled = compileWorkflow(workflow, loader, llmFactory, dataClient, {
    onAgentThinking: callbacks.onAgentThinking,
    onToolCall: callbacks.onToolCall,
    onToolResult: callbacks.onToolResult,
    onAgentWriting: callbacks.onAgentWriting,
  });

  // 构建 nodeId → agentName 查找映射（用于 WebSocket 事件推送）
  const agentNameMap = buildAgentNameMap(workflow, loader);

  const initialState = {
    target,
    task: `分析 ${target}`,
    findings: {} as Record<string, unknown>,
    messages: [] as { role: string; content: string }[],
    round: 0,
    should_stop: false,
    stop_reason: "" as const,
    total_rounds: 0,
  };

  let finalState = initialState;

  // 根据辩论节点配置计算递归限制。
  // 默认 LangGraph 限制为 25，仅够约 3 轮 — 通过 computeRecursionLimit 动态提升。
  const recursionLimit = computeRecursionLimit(workflow);
  log.debug("Computed recursion limit", { workflow: workflow.name, recursionLimit });

  // 构建顶层节点 ID 集合，用于在 streamEvents 中过滤掉子图内部节点
  // 和 LangChain 内部 chain（如 RunnableSequence、ChatOpenAI 等）
  const topLevelNodeIds = new Set(workflow.nodes.map((n) => n.id));

  const app = compiled.graph.compile();
  log.info("Streaming workflow", { workflow: workflow.name, target });

  // 使用 streamEvents (v2) 替代 stream({ streamMode: "updates" })。
  //
  // streamMode=updates 只在节点完成后才 yield —— onNodeStart 和 onNodeEnd
  // 在同一个迭代中连续触发，AGENT_THINKING 刚发出就被 NODE_END 覆盖，
  // 导致前端"思考中"的跳动动画从未真正显示。
  //
  // streamEvents 的 on_chain_start 在节点开始执行前触发，
  // on_chain_end 在节点完成后触发，两者之间有实际的执行间隔。
  const stream = app.streamEvents(initialState, {
    version: "v2",
    recursionLimit,
  });

  for await (const event of stream) {
    const nodeId = event.name;
    if (!topLevelNodeIds.has(nodeId)) continue; // 跳过子图内部节点和 LangChain 内部 chain

    if (event.event === "on_chain_start") {
      const agentName = agentNameMap.get(nodeId) ?? nodeId;
      log.debug("Node start", { workflow: workflow.name, nodeId, agentName });
      await callbacks.onNodeStart?.(nodeId, agentName);
    }

    if (event.event === "on_chain_end") {
      const agentName = agentNameMap.get(nodeId) ?? nodeId;
      const update = event.data.output as Record<string, unknown>;
      // 深度合并：findings 需要跨节点累积，不可被浅展开覆盖。
      // 例如 tech 节点写入 { findings: { tech: {...} } }，judge 节点写入
      // { findings: { judge: {...} } }，浅合并会丢失前面的 tech 条目。
      finalState = {
        ...finalState,
        ...update,
        findings: {
          ...finalState.findings,
          ...((update as any)?.findings ?? {}),
        },
      };
      await callbacks.onNodeEnd?.(nodeId, update);
      log.debug("Node end", { workflow: workflow.name, nodeId, agentName });
    }
  }

  log.info("Workflow complete", {
    workflow: workflow.name,
    findingsCount: Object.keys(finalState.findings).length,
    messagesCount: finalState.messages.length,
    stopReason: finalState.stop_reason,
  });

  return {
    findings: finalState.findings,
    messages: finalState.messages,
    stop_reason: finalState.stop_reason,
  };
}
