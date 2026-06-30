/**
 * WebSocket 事件目录 — 所有事件名常量和 TypeScript 载荷接口。
 *
 * 事件分类：
 * - 分析生命周期：ANALYSIS_START / COMPLETE / ERROR
 * - 旧版步骤事件：STEP_START / COMPLETE / ERROR（向后兼容）
 * - LangGraph 节点事件：NODE_START / END / ERROR + DEBATE_ROUND / YIELD
 * - Agent 粒度事件：AGENT_THINKING / TOOL_CALL / TOOL_RESULT / WRITING
 * - 客户端事件：SUBSCRIBE / UNSUBSCRIBE
 */
export const WS_EVENTS = {
  // 服务端发出 — 分析生命周期
  ANALYSIS_START: "analysis:start",
  ANALYSIS_COMPLETE: "analysis:complete",
  ANALYSIS_ERROR: "analysis:error",
  SESSION_STATUS: "session:status",
  // 服务端发出 — 旧版步骤事件（向后兼容）
  STEP_START: "step:start",
  STEP_COMPLETE: "step:complete",
  STEP_ERROR: "step:error",
  // 服务端发出 — LangGraph 节点级事件
  NODE_START: "node:start",
  NODE_END: "node:end",
  NODE_ERROR: "node:error",
  DEBATE_ROUND: "debate:round",
  DEBATE_YIELD: "debate:yield",
  // 服务端发出 — Agent 粒度事件（工具调用、思考、输出）
  AGENT_THINKING: "agent:thinking",
  AGENT_TOOL_CALL: "agent:tool_call",
  AGENT_TOOL_RESULT: "agent:tool_result",
  AGENT_WRITING: "agent:writing",
  // 客户端发出
  SUBSCRIBE: "subscribe",
  UNSUBSCRIBE: "unsubscribe",
} as const;

export interface AnalysisStartPayload {
  target: { type: string; code: string; name?: string };
  workflow: string;
}

export interface StepStartPayload {
  stepId: string;
  type: string;
  agentIds: string[];
}

export interface StepCompletePayload {
  stepId: string;
  findings: {
    agent: string;
    conclusion: string;
    sentiment: string;
    confidence: number;
  }[];
}

export interface StepErrorPayload {
  stepId: string;
  error: string;
}

export interface AnalysisCompletePayload {
  sessionId: string;
  summary: string;
}

export interface AnalysisErrorPayload {
  sessionId: string;
  error: string;
}

export interface SubscribePayload {
  sessionId: string;
}

export interface UnsubscribePayload {
  sessionId: string;
}

// —— LangGraph node-level payloads ——

export interface NodeStartPayload {
  nodeId: string;
  agentName: string;
  nodeType: string; // "agent" | "debate" | "router"
}

export interface NodeEndPayload {
  nodeId: string;
  agentName: string;
  findings: {
    agent: string;
    conclusion: string;
    sentiment: string;
    confidence: number;
    reasoning?: string;
  }[];
}

export interface NodeErrorPayload {
  nodeId: string;
  error: string;
}

export interface DebateRoundPayload {
  nodeId: string;
  round: number;
  participantLabel: string;
}

export interface DebateYieldPayload {
  nodeId: string;
  fromAgent: string;
  toAgent: string;
  reason: string;
}

export interface AgentThinkingPayload {
  nodeId: string;
  agentName: string;
}

export interface AgentToolCallPayload {
  nodeId: string;
  agentName: string;
  tool: string;
  args: Record<string, unknown>;
  ts: number;
}

export interface AgentToolResultPayload {
  nodeId: string;
  agentName: string;
  tool: string;
  result: string;
  ts: number;
}

export interface AgentWritingPayload {
  nodeId: string;
  agentName: string;
  conclusion: string;
  reasoning: string;
}
