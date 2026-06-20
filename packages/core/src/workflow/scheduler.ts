import type { WorkflowDAG, WorkflowStep, ExecutionContext } from "./types.js";
import type { AgentRegistry } from "../agent/registry.js";
import { executeAnalyze, type AnalyzeOptions } from "./primitives/analyze.js";
import { executePanel } from "./primitives/panel.js";
import { executeCritique } from "./primitives/critique.js";
import { executeDebate } from "./primitives/debate.js";
import { executeVote } from "./primitives/vote.js";
import { executeSynthesize } from "./primitives/synthesize.js";

export interface SchedulerEvents {
  onStepStart?: (stepId: string, type: string) => void;
  onStepComplete?: (stepId: string, context: ExecutionContext) => void;
  onPause?: (stepId: string, reason: string) => Promise<void>;
}

export class WorkflowScheduler {
  constructor(private registry: AgentRegistry) {}

  async execute(
    dag: WorkflowDAG,
    context: ExecutionContext,
    options: AnalyzeOptions = {},
    events: SchedulerEvents = {},
  ): Promise<ExecutionContext> {
    let currentCtx = context;

    // Flatten all steps and sub-steps into execution order
    const flatSteps = flattenSteps(dag.steps);

    for (const step of flatSteps) {
      events.onStepStart?.(step.id, step.type);

      switch (step.type) {
        case "analyze":
          currentCtx = await executeAnalyze(step, this.registry, currentCtx, options);
          break;
        case "panel":
          currentCtx = await executePanel(step, this.registry, currentCtx, options);
          break;
        case "critique":
          currentCtx = await executeCritique(step, this.registry, currentCtx, options);
          break;
        case "debate":
          currentCtx = await executeDebate(step, this.registry, currentCtx, options);
          break;
        case "vote":
          currentCtx = await executeVote(step, this.registry, currentCtx, options);
          break;
        case "synthesize":
          currentCtx = await executeSynthesize(step, this.registry, currentCtx, options);
          break;
        case "parallel": {
          if (!step.children) break;
          const results = await Promise.all(
            step.children.map(child => this.executeSubStep(child, currentCtx, options))
          );
          // Merge findings from parallel results
          const allFindings = results.flatMap(r => r.findings);
          const unique = allFindings.filter(
            (f, i, arr) => arr.findIndex(x => x.step === f.step && x.agent === f.agent) === i
          );
          currentCtx = { ...currentCtx, findings: [...currentCtx.findings, ...unique] };
          break;
        }
        case "sequential":
          if (step.children) {
            for (const child of step.children) {
              currentCtx = await this.executeSubStep(child, currentCtx, options);
            }
          }
          break;
      }

      events.onStepComplete?.(step.id, currentCtx);
    }

    return currentCtx;
  }

  private async executeSubStep(
    step: WorkflowStep,
    context: ExecutionContext,
    options: AnalyzeOptions,
  ): Promise<ExecutionContext> {
    // Simplified: only handle analyze sub-steps for now (used by parallel/sequential)
    return executeAnalyze(step, this.registry, context, options);
  }
}

function flattenSteps(steps: WorkflowStep[]): WorkflowStep[] {
  const result: WorkflowStep[] = [];
  for (const step of steps) {
    result.push(step);
    // parallel/sequential children are handled inline, not flattened
    // (they execute within their parent step's switch case)
  }
  return result;
}
