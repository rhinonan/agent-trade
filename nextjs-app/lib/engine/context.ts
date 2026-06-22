import type { AnalysisTarget, ExecutionContext, Finding, DebateRound, Analysis } from "./types.js";

export function createContext(
  target: AnalysisTarget,
  task: string,
  workflowName = "unknown",
): ExecutionContext {
  return {
    target,
    task,
    findings: [],
    debateRounds: [],
    workflowName,
    startedAt: Date.now(),
  };
}

export function addFinding(
  ctx: ExecutionContext,
  step: string,
  agent: string,
  analysis: Analysis,
): ExecutionContext {
  const finding: Finding = { step, agent, analysis, timestamp: Date.now() };
  return { ...ctx, findings: [...ctx.findings, finding] };
}

export function addDebateRound(
  ctx: ExecutionContext,
  round: DebateRound,
): ExecutionContext {
  return { ...ctx, debateRounds: [...ctx.debateRounds, round] };
}

export function getAgentFindings(ctx: ExecutionContext, agentId: string): Finding[] {
  return ctx.findings.filter(f => f.agent === agentId);
}

export function getStepFindings(ctx: ExecutionContext, stepId: string): Finding[] {
  return ctx.findings.filter(f => f.step === stepId);
}

export function getLatestFinding(ctx: ExecutionContext): Finding | undefined {
  return ctx.findings.at(-1);
}
