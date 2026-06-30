import type { Runnable } from "@langchain/core/runnables";
import { HumanMessage } from "@langchain/core/messages";
import { StructuredTool, tool } from "@langchain/core/tools";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { z } from "zod";
import type { CompiledAgent } from "../role-loader/loader.js";
import type { WorkflowState } from "./state.js";
import type { ToolDefinition, ToolContext, PropertySchema } from "../tools/types.js";
import type { AStockClient } from "../data-sdk/client.js";
import { createLogger } from "../logger.js";
import { AgentStreamCallbackHandler } from "./callback-handler.js";

/**
 * 核心节点工厂 — LangGraph agent engine 的核心模块。
 *
 * 包含五大功能模块：
 * 1. JSON Schema → Zod 适配器 — 将工具定义的 JSON Schema 参数转为 LangChain 可用的 Zod schema
 * 2. ToolDefinition → StructuredTool 桥接 — 将 YAML 声明的工具包装为 LangChain 可调用的工具
 * 3. 状态变量插值 — 在 prompt 模板中解析 {{target}}、{{state.*}}、{{debate.*}} 等运行时变量
 * 4. Agent 节点工厂 — 构建 LangGraph 节点函数，支持无工具和带工具两条执行路径
 * 5. 辩论终止检测节点 — 纯函数节点，检查辩论是否满足退出条件
 */

const log = createLogger("nodes");

type State = typeof WorkflowState.State;

// ——— 模块 1：JSON Schema → Zod 适配器 ———
// LangChain 的 tool() 函数和 OpenAI bindTools 流程要求 Zod schema，
// 而我们的工具定义使用 JSON Schema 风格来描述参数，这里完成转换。

/**
 * 将单个 PropertySchema（JSON Schema 对象）转为真正的 Zod schema。
 *
 * 类型映射表：
 *   string  → z.string()
 *   number  → z.number()
 *   boolean → z.boolean()
 *   array   → z.array(items 递归)
 *   object  → z.record(z.any())  （通用对象，当前工具不使用嵌套对象形参）
 *
 * 如果属性带有 description，会附带在 Zod schema 上（.describe()）。
 * 如果类型为 string 且有 enum，则转为 z.enum()。
 */
function propertySchemaToZod(prop: PropertySchema): z.ZodTypeAny {
  let base: z.ZodTypeAny;
  switch (prop.type) {
    case "string":
      base = z.string();
      break;
    case "number":
      base = z.number();
      break;
    case "boolean":
      base = z.boolean();
      break;
    case "array":
      // 递归处理数组元素类型
      base = z.array(prop.items ? propertySchemaToZod(prop.items) : z.string());
      break;
    case "object":
      // 通用对象使用 z.record — 当前工具未使用含嵌套属性的具体对象形参
      base = z.record(z.any());
      break;
    default:
      base = z.string();
  }
  if (prop.description) base = base.describe(prop.description);
  // string 类型 + enum → 转为 z.enum()
  if (prop.enum && prop.type === "string") {
    base = z.enum(prop.enum as [string, ...string[]]);
    if (prop.description) base = base.describe(prop.description);
  }
  return base;
}

/**
 * 将 ToolDefinition 的 parameters 块转为 Zod 对象 schema。
 * required 数组中的字段为必填，其余为可选（.optional()）。
 */
function parametersToZodSchema(params: ToolDefinition["parameters"]): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, prop] of Object.entries(params.properties)) {
    let field = propertySchemaToZod(prop);
    // 不在 required 列表中的字段标记为可选
    if (!params.required.includes(key)) {
      field = field.optional();
    }
    shape[key] = field;
  }
  return z.object(shape);
}

// ——— 模块 2：ToolDefinition → LangChain StructuredTool 桥接 ———

/**
 * 将内部 ToolDefinition 转为 LangChain StructuredTool。
 *
 * 这是 YAML 声明的工具与 LangChain tool-calling agent 之间的桥梁：
 * - YAML 中 agent 的 tools 字段列出工具名称
 * - RoleLoader 通过 toolsByName 查表获取 ToolDefinition
 * - 此函数将 ToolDefinition 包装为 LangChain 可调用的 StructuredTool
 * - AgentExecutor 在执行过程中自动选择合适的工具并调用
 */
function toolDefinitionToStructuredTool(
  td: ToolDefinition,
  ctx: ToolContext,
): StructuredTool {
  return tool(
    async (params: Record<string, unknown>) => {
      const result = await td.execute(params, ctx);
      return result;
    },
    {
      name: td.name,
      description: td.description,
      schema: parametersToZodSchema(td.parameters),
    },
  );
}

// ——— 模块 3：状态变量插值 ———

/**
 * 在 prompt 模板中解析运行时状态变量。
 *
 * 支持的变量语法：
 *   {{target}}              → 分析目标代码（如 "000001"）
 *   {{round}}               → 当前辩论轮次
 *   {{findings}}            → 所有节点分析结果的格式化 JSON 列表
 *   {{state.<node_id>}}     → 指定节点的完整分析结果 JSON
 *   {{state.<node_id>.<field>}} → 指定节点结果的特定字段值
 *   {{debate.messages}}     → 辩论对话记录（带轮次标签）
 *   {{debate.stop_reason}}  → 辩论终止原因（中文："一方认输" / "达到最大轮次上限"）
 *   {{debate.total_rounds}} → 辩论总轮次数
 *
 * 未找到的变量保持原样（如 {{state.unknown}}），不会抛出异常。
 */
function resolveStateVariables(template: string, state: State): string {
  let result = template;

  // {{target}} — 分析目标代码
  result = result.replace(/\{\{target\}\}/g, state.target);

  // {target}（单花括号）— 某些调用方通过 interpolateTemplate 预转换
  result = result.replace(/\{target\}/g, state.target);

  // {{round}} — 当前辩论轮次
  result = result.replace(/\{\{round\}\}/g, String(state.round ?? 0));

  // {{findings}} — 所有分析结果的格式化列表
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
      return `{{state.${nodeId}.${field}}}`; // 未找到则保持原样
    },
  );

  // {{state.<node_id>}} — 指定节点的完整结果
  result = result.replace(
    /\{\{state\.(\w+)\}\}/g,
    (_match, nodeId: string) => {
      const finding = state.findings?.[nodeId];
      if (finding !== undefined) {
        return typeof finding === "string" ? finding : JSON.stringify(finding);
      }
      return `{{state.${nodeId}}}`; // 未找到则保持原样
    },
  );

  // {{debate.messages}} — 辩论对话记录（带轮次标签）
  result = result.replace(
    /\{\{debate\.messages\}\}/g,
    () => {
      const msgs = state.messages ?? [];
      if (msgs.length === 0) return "(暂无辩论记录)";
      return msgs
        .map((m, i) => `[第${Math.floor(i / 2) + 1}轮] ${m.role}：${m.content}`)
        .join("\n\n");
    },
  );

  // {{debate.stop_reason}} — 辩论终止原因（中文显示）
  result = result.replace(
    /\{\{debate\.stop_reason\}\}/g,
    () => {
      if (state.stop_reason === "yield") return "一方认输";
      if (state.stop_reason === "max_rounds") return "达到最大轮次上限";
      return state.stop_reason || "辩论结束";
    },
  );

  // {{debate.total_rounds}} — 辩论总轮次数
  result = result.replace(
    /\{\{debate\.total_rounds\}\}/g,
    () => String(state.total_rounds ?? state.round ?? 0),
  );

  return result;
}

// ——— 模块 4：Agent 节点工厂 ———

/**
 * 构建一个 LangGraph 节点函数，运行 tool-calling agent。
 *
 * 执行流程：
 * 1. 构建 ToolContext（数据客户端 + 分析目标 + 取消信号）
 * 2. 插值解析 task prompt 中的 {{变量}}
 * 3. 根据是否有工具走两条执行路径之一
 *
 * 双路径设计：
 *
 *   【无工具路径】（compiled.tools.length === 0）：
 *   - 直接调用 LLM（system prompt + resolved prompt）
 *   - 尝试 JSON 解析输出（StructuredOutputParser 或原始 JSON.parse）
 *   - 适合不需要外部数据的分析（如估值判断、逻辑推理）
 *
 *   【有工具路径】（compiled.tools.length > 0）：
 *   - 通过 createToolCallingAgent + AgentExecutor 执行
 *   - Agent 在 tool-calling 循环中自主决定调用哪些工具
 *   - 最多执行 maxToolSteps 轮（防止无限循环）
 *   - 通过 AgentStreamCallbackHandler 实时推送工具调用事件
 *   - 适合需要获取市场数据、搜索信息的分析
 *
 * Delta 返回模式：
 * - 节点只返回 `{ findings: { [nodeId]: parsed } }`
 * - 不展开 state.* ，由 channel reducer 自动合并
 * - 这样并行节点各自写自己的 key，互不冲突
 */
export function buildAgentNode(
  compiled: CompiledAgent,
  taskPrompt: string,
  llmFactory: () => Runnable,
  dataClient: AStockClient,
  nodeId: string,
  callbacks?: import("./compiler.js").AgentNodeCallbacks,
) {
  return async (state: State): Promise<Partial<State>> => {
    const llm = llmFactory();

    // 构建 ToolContext，注入数据客户端和当前分析目标
    const toolCtx: ToolContext = {
      dataClient,
      target: { type: "stock", code: state.target },
      executionState: {} as any,
      signal: new AbortController().signal,
    };

    // 插值解析所有状态变量
    const resolvedPrompt = resolveStateVariables(taskPrompt, state);

    if (compiled.tools.length === 0) {
      // 无工具路径：直接调用 LLM（system prompt + resolved prompt）
      const messages = [
        ...(await compiled.systemPrompt.formatMessages({})),
        new HumanMessage(resolvedPrompt),
      ];

      log.verbose("LLM invoke (simple)", {
        nodeId,
        agentName: compiled.id,
        promptLength: resolvedPrompt.length,
        tools: 0,
      });

      const startMs = Date.now();
      const response = await llm.invoke(messages);
      const latencyMs = Date.now() - startMs;

      const text =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

      log.verbose("LLM response (simple)", {
        nodeId,
        agentName: compiled.id,
        responseLength: text.length,
        latencyMs,
      });

      // 发出 onAgentWriting 事件供前端打字机效果使用
      if (callbacks) {
        const agentName = compiled.id;
        let conclusion = "";
        let reasoning = "";
        try {
          const preParsed = JSON.parse(text);
          conclusion = preParsed.conclusion ?? text;
          reasoning = preParsed.reasoning ?? "";
        } catch {
          conclusion = text;
        }
        await callbacks.onAgentWriting?.(nodeId, agentName, conclusion, reasoning);
      }

      let parsed: unknown = text;
      if (compiled.outputParser) {
        try {
          parsed = await compiled.outputParser.parse(text);
        } catch {
          parsed = { conclusion: text, raw: text };
        }
      } else {
        // Try JSON parse as a convenience for structured LLM outputs
        try {
          parsed = JSON.parse(text);
        } catch {
          // keep as raw text
        }
      }

      // 只返回增量 — reducer 负责合并
      return { findings: { [nodeId]: parsed } };
    }

    // 有工具路径：ToolDefinition[] → StructuredTool[]，然后 AgentExecutor 执行
    const structuredTools = compiled.tools.map((td) =>
      toolDefinitionToStructuredTool(td, toolCtx),
    );

    // 构建完整 prompt，包含 agent_scratchpad（createToolCallingAgent 要求）。
    // compiled.systemPrompt 是包含系统消息的 ChatPromptTemplate；
    // 在此基础上追加 {input} 和工具调用历史的 MessagesPlaceholder。
    const agentPrompt = ChatPromptTemplate.fromMessages([
      ...compiled.systemPrompt.promptMessages,
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad"),
    ]);

    const agent = createToolCallingAgent({
      llm: llm as any,
      tools: structuredTools,
      prompt: agentPrompt,
    });

    const executor = new AgentExecutor({
      agent,
      tools: structuredTools,
      maxIterations: compiled.maxToolSteps,
      returnIntermediateSteps: true,
    });

    log.verbose("LLM invoke (tools)", {
      nodeId,
      agentName: compiled.id,
      promptLength: resolvedPrompt.length,
      toolCount: structuredTools.length,
      maxSteps: compiled.maxToolSteps,
    });

    // 使用 LangChain 回调处理器在 Agent 执行期间实时推送工具调用/结果事件，
    // 而非等待执行完成后批量发送。
    const streamHandler = callbacks
      ? new AgentStreamCallbackHandler(nodeId, compiled.id, callbacks)
      : undefined;

    const startMs = Date.now();
    const result = await executor.invoke(
      { input: resolvedPrompt },
      streamHandler ? { callbacks: [streamHandler] } : undefined,
    );
    const latencyMs = Date.now() - startMs;

    log.verbose("LLM response (tools)", {
      nodeId,
      agentName: compiled.id,
      outputLength: String(result.output ?? "").length,
      intermediateSteps: (result as any).intermediateSteps?.length ?? 0,
      latencyMs,
    });

    const outputText = result.output as string;

    // 发出 onAgentWriting 事件，包含完整结论和推理过程
    if (callbacks) {
      const agentName = compiled.id;
      let conclusion = "";
      let reasoning = "";
      try {
        const preParsed = JSON.parse(outputText);
        conclusion = preParsed.conclusion ?? outputText;
        reasoning = preParsed.reasoning ?? "";
      } catch {
        conclusion = outputText;
      }
      await callbacks.onAgentWriting?.(nodeId, agentName, conclusion, reasoning);
    }

    let parsed: unknown = outputText;
    if (compiled.outputParser) {
      try {
        parsed = await compiled.outputParser.parse(outputText);
      } catch {
        parsed = { conclusion: outputText, raw: outputText };
      }
    } else {
      // Try JSON parse as a convenience for structured LLM outputs
      try {
        parsed = JSON.parse(outputText);
      } catch {
        // keep as raw text
      }
    }

    // 只返回增量 — reducer 负责合并
    return { findings: { [nodeId]: parsed } };
  };
}

// ——— 模块 5：辩论终止检测节点 ———

/**
 * 辩论终止检测节点 — 纯函数，无需 LLM 调用。
 *
 * 读取当前轮次参与者的输出（从 state.findings 中查找 `round_{r}_{role}` 键），
 * 检查指定字段的值，判断是否满足退出条件。
 *
 * 两种退出条件：
 * - "any"：任意一方认输即停止（默认策略，更保守）
 * - "all"：双方均认输才停止（需要双方都同意）
 */
export function buildCheckYieldNode(
  field: string,
  condition: "any" | "all",
) {
  return async (state: State): Promise<Partial<State>> => {
    // 获取当前轮次创建的所有条目
    const entryKeys = Object.keys(state.findings).filter((k) =>
      k.startsWith(`round_${state.round}_`),
    );

    const yields: boolean[] = [];
    for (const key of entryKeys) {
      const entry = state.findings[key] as Record<string, unknown> | undefined;
      if (entry && typeof entry[field] === "boolean") {
        yields.push(entry[field] as boolean);
      }
    }

    const shouldStop =
      condition === "any"
        ? yields.some((y) => y === true)
        : yields.every((y) => y === true);

    return {
      should_stop: shouldStop,
      stop_reason: shouldStop ? "yield" : "",
      total_rounds: state.round + 1,
    };
  };
}
