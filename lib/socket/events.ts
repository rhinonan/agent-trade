export const WS_EVENTS = {
  // Server emits — analysis lifecycle
  ANALYSIS_START: "analysis:start",
  ANALYSIS_COMPLETE: "analysis:complete",
  ANALYSIS_ERROR: "analysis:error",
  SESSION_STATUS: "session:status",
  // Server emits — legacy step-level events (kept for backward compat)
  STEP_START: "step:start",
  STEP_COMPLETE: "step:complete",
  STEP_ERROR: "step:error",
  // Server emits — LangGraph node-level events
  NODE_START: "node:start",
  NODE_END: "node:end",
  NODE_ERROR: "node:error",
  DEBATE_ROUND: "debate:round",
  DEBATE_YIELD: "debate:yield",
  // Client emits
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
