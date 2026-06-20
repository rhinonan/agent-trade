import { defineStore } from "pinia";
import { ref, computed } from "vue";

export interface Target {
  type: string;
  code: string;
  name?: string;
}

export interface StepState {
  id: string;
  type: string;
  status: "pending" | "running" | "complete" | "error";
  agentIds: string[];
  summary?: string;
}

export interface LogEntry {
  time: number;
  agent: string;
  message: string;
  sentiment?: "bullish" | "bearish" | "neutral";
}

export interface Finding {
  step: string;
  agent: string;
  conclusion: string;
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
  reasoning?: string[];
  rawOutput?: string;
}

export interface ReportData {
  target: Target;
  workflowName: string;
  findings: Finding[];
  sentiments: { bullish: number; bearish: number; neutral: number };
  conclusion?: string;
  elapsed?: number;
}

type AnalysisStatus = "idle" | "running" | "complete" | "error";

export const useAnalysisStore = defineStore("analysis", () => {
  const status = ref<AnalysisStatus>("idle");
  const target = ref<Target | null>(null);
  const workflow = ref<string | null>(null);
  const steps = ref<StepState[]>([]);
  const logs = ref<LogEntry[]>([]);
  const report = ref<ReportData | null>(null);
  const error = ref<string | null>(null);
  const sessionId = ref<string | null>(null);
  const stepCount = ref(0);
  const totalSteps = ref(0);

  const isRunning = computed(() => status.value === "running");

  function reset() {
    status.value = "idle";
    target.value = null;
    workflow.value = null;
    steps.value = [];
    logs.value = [];
    report.value = null;
    error.value = null;
    sessionId.value = null;
    stepCount.value = 0;
    totalSteps.value = 0;
  }

  function handleStart(payload: { target: Target; workflow: string }) {
    target.value = payload.target;
    workflow.value = payload.workflow;
    status.value = "running";
    error.value = null;
    steps.value = [];
    logs.value = [];
    report.value = null;

    addLog("system", `开始分析 ${payload.target.name ?? payload.target.code}`);
  }

  function handleStepStart(payload: { stepId: string; type: string; agentIds: string[] }) {
    stepCount.value++;
    steps.value.push({
      id: payload.stepId,
      type: payload.type,
      status: "running",
      agentIds: payload.agentIds,
    });
    addLog("system", `Step ${stepCount.value}: ${payload.stepId} (${payload.type}) 开始...`);
  }

  function handleStepComplete(payload: {
    stepId: string;
    findings: { agent: string; conclusion: string; sentiment: string; confidence: number }[];
  }) {
    const step = steps.value.find(s => s.id === payload.stepId);
    if (step) step.status = "complete";

    for (const f of payload.findings) {
      addLog(
        f.agent,
        f.conclusion.slice(0, 120),
        f.sentiment as "bullish" | "bearish" | "neutral",
      );
    }
  }

  function handleComplete(payload: { context: { target: Target; workflowName: string; findings: Finding[]; debateRounds: any[] } }) {
    status.value = "complete";
    const ctx = payload.context;
    const findings = ctx.findings ?? [];
    const sentiments = {
      bullish: findings.filter(f => f.analysis?.sentiment === "bullish").length,
      bearish: findings.filter(f => f.analysis?.sentiment === "bearish").length,
      neutral: findings.filter(f => f.analysis?.sentiment === "neutral").length,
    };

    const lastFinding = findings.at(-1);
    report.value = {
      target: ctx.target,
      workflowName: ctx.workflowName,
      findings: findings.map(f => ({
        step: f.step,
        agent: f.agent,
        conclusion: f.analysis?.conclusion ?? "",
        sentiment: f.analysis?.sentiment ?? "neutral",
        confidence: f.analysis?.confidence ?? 0,
        reasoning: f.analysis?.reasoning,
        rawOutput: f.analysis?.rawOutput,
      })),
      sentiments,
      conclusion: lastFinding?.analysis?.rawOutput ?? lastFinding?.analysis?.conclusion,
    };

    addLog("system", "分析完成");
  }

  function handleError(payload: { message: string }) {
    status.value = "error";
    error.value = payload.message;
    addLog("system", `错误: ${payload.message}`);
  }

  function addLog(agent: string, message: string, sentiment?: "bullish" | "bearish" | "neutral") {
    logs.value.push({ time: Date.now(), agent, message, sentiment });
  }

  return {
    status, target, workflow, steps, logs, report, error, sessionId, stepCount, totalSteps,
    isRunning,
    reset, handleStart, handleStepStart, handleStepComplete, handleComplete, handleError,
  };
});
