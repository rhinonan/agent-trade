import type { AgentRegistry } from "../../agent/registry.js";
import type { ExecutionContext, WorkflowStep } from "../types.js";
import { executePanel } from "./panel.js";
import type { AnalyzeOptions } from "./llm.js";

export async function executeVote(
  step: WorkflowStep,
  registry: AgentRegistry,
  context: ExecutionContext,
  options: AnalyzeOptions = {},
): Promise<ExecutionContext> {
  // Vote is a specialized panel where each agent provides a verdict + confidence
  const votePrompt = (step.prompt ?? "基于目前所有分析，对 {target} 做出你的投票判断（看多/看空/观望），并给出置信度")
    .replace("{target}", context.target.name ?? context.target.code);

  const voteStep: WorkflowStep = {
    ...step,
    prompt: votePrompt,
    type: "panel",
  };

  return executePanel(voteStep, registry, context, options);
}
