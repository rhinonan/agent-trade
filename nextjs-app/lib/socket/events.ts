export const WS_EVENTS = {
  // Server emits
  ANALYSIS_START: "analysis:start",
  STEP_START: "step:start",
  STEP_COMPLETE: "step:complete",
  STEP_ERROR: "step:error",
  ANALYSIS_COMPLETE: "analysis:complete",
  ANALYSIS_ERROR: "analysis:error",
  SESSION_STATUS: "session:status",
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
