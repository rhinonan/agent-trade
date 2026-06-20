import type { AgentRegistry } from "../../agent/registry.js";
import type { ExecutionContext, WorkflowStep } from "../types.js";
import { executeAnalyze, type AnalyzeOptions } from "./analyze.js";

export async function executePanel(
  step: WorkflowStep,
  registry: AgentRegistry,
  context: ExecutionContext,
  options: AnalyzeOptions = {},
): Promise<ExecutionContext> {
  const match = step.match ?? (step.agent as any);
  if (!match) throw new Error(`Panel step "${step.id}" requires a match`);

  const count = step.count ?? "all";
  const agents = registry.match(match, count);

  if (agents.length === 0) {
    throw new Error(`No agents matched for panel "${step.id}"`);
  }

  // Run all agents in parallel
  const panelSteps: WorkflowStep[] = agents.map((a, i) => ({
    id: `${step.id}__${a.id}`,
    type: "analyze" as const,
    prompt: step.prompt,
    agent: { id: a.id },
  }));

  const results = await Promise.all(
    panelSteps.map(s => executeAnalyze(s, registry, context, options))
  );

  // Merge all findings from all results
  const allFindings = results.flatMap(r => r.findings);
  const uniqueFindings = allFindings.filter(
    (f, i, arr) => arr.findIndex(x => x.step === f.step && x.agent === f.agent) === i
  );

  return {
    ...context,
    findings: [...context.findings, ...uniqueFindings],
  };
}
