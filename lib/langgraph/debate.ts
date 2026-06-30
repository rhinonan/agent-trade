import { StateGraph, END, START } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import type { RoleLoader, CompiledAgent } from "../role-loader/loader.js";
import { WorkflowState } from "./state.js";
import { buildCheckYieldNode } from "./nodes.js";
import { createLogger } from "../logger.js";

import type { Runnable } from "@langchain/core/runnables";

/**
 * 多轮对抗辩论子图 — agent-trade 的核心机制。
 *
 * 架构概述：
 * - 两个 agent（多方/空方）交替发言，每轮各说一次
 * - 每轮结束后检查是否有一方认输（yield）
 * - 达到最大轮次时强制终止
 * - 辩论结束后由旁白（narrator）总结
 *
 * 图结构：
 *   START → (条件路由: meets_expectations?) → 先发言者
 *   先发言者 → (条件路由) → 后发言者 → check_yield
 *   check_yield → END (认输) | set_max_end (达最大轮次) | increment_round → 先发言者（循环）
 *
 * 先发言者路由策略：
 * - 当 research.meets_expectations === false（业绩低于预期）时：空方先发言
 * - 否则（true 或 undefined，业绩符合/超出预期）：多方先发言
 * - 设计理由：让不利方先陈述观点，更符合真实辩论的公平性原则
 *
 * 节点 ID 设计：
 * - 使用角色命名（如 "多方_speak"、"空方_speak"）而非位置命名（"p1_speak"、"p2_speak"）
 * - 优点：日志可读性更好，路由逻辑更清晰，前端展示时可直接使用角色标签
 */

type LLMFactory = () => Runnable;
type State = typeof WorkflowState.State;

const log = createLogger("debate");

/** 辩论配置接口 */
interface DebateConfig {
  /** 辩论节点 ID */
  id: string;
  /** 参与者列表，每项包含 agent ID、角色名称（如"多方"/"空方"）和是否先发言标志 */
  participants: { agent: string; role: string; first?: boolean }[];
  /** 最大辩论轮次 */
  max_rounds: number;
  /** 终止条件：检查哪个字段，any（任一认输即停）/ all（双方均认输才停） */
  stop_when: { field: string; condition: "any" | "all" };
  /** 辩论发言的 prompt 模板 */
  prompt_template: string;
}

/**
 * 构建多轮对抗辩论子图。
 *
 * 详情见文件顶部的架构说明。
 */
export function buildDebateSubgraph(
  config: DebateConfig,
  loader: RoleLoader,
  llmFactory: LLMFactory,
  agentCallbacks?: import("./compiler.js").AgentNodeCallbacks,
) {
  const graph = new StateGraph(WorkflowState);
  const participants = config.participants;

  if (participants.length !== 2) {
    throw new Error("Debate currently supports exactly 2 participants");
  }

  const p1 = participants[0]; // 如 { agent: "earnings-bull", role: "多方" }
  const p2 = participants[1]; // 如 { agent: "earnings-bear", role: "空方" }

  const p1Agent = loader.getAgent(p1.agent);
  const p2Agent = loader.getAgent(p2.agent);

  if (!p1Agent || !p2Agent) {
    throw new Error(
      `Debate agent "${!p1Agent ? p1.agent : p2.agent}" not found for debate "${config.id}"`
    );
  }

  // 节点 ID 使用角色命名而非位置命名
  const p1NodeId = `${p1.role}_speak`;
  const p2NodeId = `${p2.role}_speak`;

  graph.addNode(p1NodeId, buildDebateSpeakerNode(p1Agent, llmFactory, p1.role, p2.role, config.prompt_template, p1NodeId, agentCallbacks));
  graph.addNode(p2NodeId, buildDebateSpeakerNode(p2Agent, llmFactory, p2.role, p1.role, config.prompt_template, p2NodeId, agentCallbacks));
  graph.addNode("check_yield", buildCheckYieldNode(config.stop_when.field, config.stop_when.condition));
  graph.addNode("increment_round", incrementRoundNode);
  graph.addNode("set_max_end", (state: State): Partial<State> => ({
    should_stop: true,
    stop_reason: "max_rounds",
    total_rounds: state.round + 1,
  }));
  graph.addEdge("set_max_end" as any, END as any);

  // 路由函数：业绩低于预期时空方先发言
  const routeToFirstSpeaker = (state: State): string => {
    const research = state.findings?.research as Record<string, unknown> | undefined;
    // meets_expectations === false → 低于预期 → 空方先发言
    // true 或 undefined → 符合/超出预期 → 多方先发言
    const bearFirst = research?.meets_expectations === false;
    return bearFirst ? p2NodeId : p1NodeId;
  };

  // START → conditional to first speaker
  graph.addConditionalEdges(START as any, routeToFirstSpeaker);

  // 从 p1（如多方）：如果空方先发言则 p1 第二个发言 → check_yield；否则 p1 先发言 → p2
  graph.addConditionalEdges(p1NodeId as any, (state: State) => {
    const research = state.findings?.research as Record<string, unknown> | undefined;
    const bearFirst = research?.meets_expectations === false;
    return bearFirst ? "check_yield" : p2NodeId;
  });

  // 从 p2（如空方）：如果空方先发言则 p2 先发言 → p1；否则 p2 第二个发言 → check_yield
  graph.addConditionalEdges(p2NodeId as any, (state: State) => {
    const research = state.findings?.research as Record<string, unknown> | undefined;
    const bearFirst = research?.meets_expectations === false;
    return bearFirst ? p1NodeId : "check_yield";
  });

  // check_yield → END (yield) | set_max_end (max rounds) | increment_round
  graph.addConditionalEdges("check_yield" as any, (state: State) => {
    if (state.should_stop) return END;
    if (state.round >= config.max_rounds - 1) return "set_max_end";
    return "increment_round";
  });

  // increment_round → back to first speaker (same routing logic)
  graph.addConditionalEdges("increment_round" as any, routeToFirstSpeaker);

  return graph;
}

// ——— 内部节点 ———

/**
 * 辩论轮次计数器 +1。
 * 纯状态变换 — 无 LLM 调用，仅递增 round 字段。
 */
function incrementRoundNode(state: State): Partial<State> {
  return { round: (state.round || 0) + 1 };
}

/**
 * 解析辩论专用的模板变量。
 *
 * 支持的变量：
 * - `{{role}}` → 当前发言者的角色（如"多方"、"空方"）
 * - `{{round}}` → 当前辩论轮次
 * - `{{opponent.last_argument}}` → 对方上一轮的论点文本
 * - `{{findings}}` → 所有分析结果的格式化 JSON 列表
 * - `{{target}}` → 分析目标代码
 * - `{{state.<node_id>}}` → 指定节点的完整分析结果
 * - `{{state.<node_id>.<field>}}` → 指定节点结果的特定字段
 */
function resolveDebateTemplate(
  template: string,
  state: State,
  role: string,
  opponentRole: string,
): string {
  let result = template;

  result = result.replace(/\{\{role\}\}/g, role);
  result = result.replace(/\{\{round\}\}/g, String(state.round ?? 0));
  result = result.replace(/\{\{target\}\}/g, state.target);

  // {{opponent.last_argument}} — 对方上一轮的论点
  result = result.replace(
    /\{\{opponent\.last_argument\}\}/g,
    () => {
      // 从 messages 数组中收集对方所有发言，取最后一条
      const opponentMsgs = (state.messages ?? [])
        .filter((m) => m.role === opponentRole);
      if (opponentMsgs.length > 0) {
        return opponentMsgs[opponentMsgs.length - 1].content;
      }
      return "(尚无对方论点)";
    },
  );

  // {{findings}}
  result = result.replace(/\{\{findings\}\}/g, () => {
    const entries = Object.entries(state.findings ?? {});
    if (entries.length === 0) return "(暂无分析结果)";
    return entries
      .map(([key, value]) => `[${key}]: ${JSON.stringify(value)}`)
      .join("\n");
  });

  // {{state.<node_id>.<field>}} — 指定节点结果的特定字段
  result = result.replace(
    /\{\{state\.(\w+)\.(\w+)\}\}/g,
    (_match, nodeId: string, field: string) => {
      const finding = state.findings?.[nodeId];
      if (finding && typeof finding === "object" && field in (finding as Record<string, unknown>)) {
        return String((finding as Record<string, unknown>)[field]);
      }
      return `{{state.${nodeId}.${field}}}`; // leave unresolved if not found
    },
  );

  // {{state.<node_id>}} — 指定节点的完整分析结果
  result = result.replace(
    /\{\{state\.(\w+)\}\}/g,
    (_match, nodeId: string) => {
      const finding = state.findings?.[nodeId];
      if (finding !== undefined) {
        return typeof finding === "string" ? finding : JSON.stringify(finding);
      }
      return `{{state.${nodeId}}}`; // leave unresolved if not found
    },
  );

  return result;
}

/**
 * 构建辩论发言者节点，执行以下步骤：
 * 1. 使用配置的 prompt_template 构造轮次特定的 prompt
 * 2. 调用 LLM（无工具路径，辩论中不需要外部数据）
 * 3. 将解析后的输出存入 findings[`round_{N}_{role}`]
 * 4. 将发言追加到 messages 数组
 *
 * Delta 返回模式：
 * - 只返回 { findings: {[key]}, messages: [...] }
 * - 不展开 state.* — 否则每轮 messages 数组会翻倍，最终导致 RangeError
 */
function buildDebateSpeakerNode(
  compiled: CompiledAgent,
  llmFactory: LLMFactory,
  role: string,
  opponentRole: string,
  promptTemplate: string,
  debateNodeId: string,
  agentCallbacks?: import("./compiler.js").AgentNodeCallbacks,
) {
  return async (state: State): Promise<Partial<State>> => {
    const llm = llmFactory();
    const round = state.round ?? 0;
    const agentName = `${role}分析师`;

    // 发出 onAgentThinking 事件，前端显示"正在思考..."
    await agentCallbacks?.onAgentThinking?.(debateNodeId, agentName);

    // 从 YAML prompt_template 构建 prompt，插值解析所有变量
    const prompt = resolveDebateTemplate(promptTemplate, state, role, opponentRole);

    log.verbose("LLM call", {
      debateNode: debateNodeId,
      role,
      round,
      promptLength: prompt.length,
    });

    const startMs = Date.now();

    // Invoke LLM with system prompt + debate prompt
    const messages = [
      ...(await compiled.systemPrompt.formatMessages({})),
      new HumanMessage(prompt),
    ];

    const response = await llm.invoke(messages);
    const text =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    const latencyMs = Date.now() - startMs;

    log.verbose("LLM response", {
      debateNode: debateNodeId,
      role,
      round,
      responseLength: text.length,
      latencyMs,
    });

    // 尝试解析结构化输出
    let parsed: unknown = text;
    if (compiled.outputParser) {
      try {
        parsed = await compiled.outputParser.parse(text);
      } catch {
        parsed = { argument: text, raw: text };
      }
    } else {
      try {
        parsed = JSON.parse(text);
      } catch {
        // keep as raw text
      }
    }

    // 发出 onAgentWriting 事件，前端渲染发言文本
    const conclusion =
      typeof parsed === "object" && parsed !== null
        ? ((parsed as Record<string, unknown>).argument as string)
          ?? ((parsed as Record<string, unknown>).conclusion as string)
          ?? text.slice(0, 300)
        : String(parsed).slice(0, 300);
    const reasoning =
      typeof parsed === "object" && parsed !== null
        ? ((parsed as Record<string, unknown>).reasoning as string) ?? ""
        : "";

    await agentCallbacks?.onAgentWriting?.(debateNodeId, agentName, conclusion, reasoning);

    const findingsKey = `round_${state.round}_${role}`;

    // 只返回增量（delta）— channel reducer 自动合并/拼接。
    // 警告：如果在此处展开 state.* 会导致指数级增长
    // （每轮 messages 数组翻倍），最终触发 RangeError。
    return {
      findings: { [findingsKey]: parsed },
      messages: [{ role, content: text }],
    };
  };
}
