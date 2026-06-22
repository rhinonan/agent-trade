import type { WorkflowDAG, WorkflowStep, AgentMatch, AgentCount } from "./types.js";

// Primitive constructors
export const analyze = (config: { agent: AgentMatch | { id?: string; capability?: string }; prompt: string }): WorkflowStep =>
  ({ id: "", type: "analyze", ...config }) as WorkflowStep;

export const critique = (config: { reviewer: string; targetStep: string; prompt?: string }): WorkflowStep =>
  ({ id: "", type: "critique", agent: { id: config.reviewer }, targetStep: config.targetStep, prompt: config.prompt }) as WorkflowStep;

export const parallel = (children: WorkflowStep[]): WorkflowStep =>
  ({ id: "", type: "parallel", children }) as WorkflowStep;

export const sequential = (children: WorkflowStep[]): WorkflowStep =>
  ({ id: "", type: "sequential", children }) as WorkflowStep;

export const panel = (config: { match: AgentMatch; count?: AgentCount | "all"; prompt: string }): WorkflowStep =>
  ({ id: "", type: "panel", ...config }) as WorkflowStep;

export const synthesize = (config: { agent: string; prompt: string }): WorkflowStep =>
  ({ id: "", type: "synthesize", agent: { id: config.agent }, prompt: config.prompt }) as WorkflowStep;

export const vote = (config: { match: AgentMatch; count?: AgentCount | "all"; prompt: string }): WorkflowStep =>
  ({ id: "", type: "vote", ...config }) as WorkflowStep;

export const debate = (config: { agents: { id: string }[]; maxRounds?: number; prompt: string }): WorkflowStep =>
  ({ id: "", type: "debate", agent: config.agents as AgentMatch[], maxRounds: config.maxRounds, prompt: config.prompt }) as WorkflowStep;

class WorkflowBuilder {
  private dag: WorkflowDAG;

  constructor(name: string, description?: string) {
    this.dag = { name, version: "1", description, steps: [] };
  }

  step(id: string, primitive: WorkflowStep, overrides?: Partial<WorkflowStep>): this {
    const step: WorkflowStep = { ...primitive, id, ...overrides };
    if (step.children) {
      step.children = step.children.map((child, i) => ({
        ...child,
        id: child.id || `${id}__child${i}`,
      }));
    }
    this.dag.steps.push(step);
    return this;
  }

  build(): WorkflowDAG {
    for (let i = 0; i < this.dag.steps.length - 1; i++) {
      const step = this.dag.steps[i];
      if (!step.next && step.type !== "parallel" && step.type !== "sequential") {
        step.next = [this.dag.steps[i + 1].id];
      }
    }
    return JSON.parse(JSON.stringify(this.dag));
  }
}

export function defineWorkflow(config: { name: string; description?: string }): WorkflowBuilder {
  return new WorkflowBuilder(config.name, config.description);
}
