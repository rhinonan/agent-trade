import type { AnalysisTarget, ExecutionContext } from "../engine/types.js";
import type { AStockClient } from "../data-sdk/client.js";

/**
 * 工具系统核心类型定义。
 *
 * agent-trade 的工具系统围绕 ToolDefinition 构建：
 * - YAML agent 通过 tools 字段列出工具名称
 * - RoleLoader 通过 toolsByName 查表获取 ToolDefinition
 * - Agent 节点通过 ToolDefinition.execute() 调用实际工具逻辑
 * - 工具通过 ToolContext 访问市场数据客户端和分析上下文
 */

/** 工具参数的 JSON Schema 属性描述 */
export interface PropertySchema {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: PropertySchema; // 数组元素类型（递归）
  default?: unknown;
}

/**
 * 工具定义 — agent 可调用的单个工具。
 * 参数使用 JSON Schema 子集描述（type + properties + required），
 * 运行时通过 nodes.ts 中的 propertySchemaToZod() 转为 LangChain Zod schema。
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, PropertySchema>;
    required: string[]; // 必填参数列表
  };
  /** 执行工具逻辑，返回 JSON 字符串 */
  execute(params: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

/**
 * 工具执行上下文 — 工具可访问的运行时环境。
 */
export interface ToolContext {
  /** A 股市场数据客户端（注入 AStockClient） */
  dataClient: AStockClient;
  /** 当前分析目标（股票代码 + 类型） */
  target: AnalysisTarget;
  /** 工作流执行状态 */
  executionState: ExecutionContext;
  /** 取消信号，引擎可借此中止正在进行中的工具调用 */
  signal: AbortSignal;
}
