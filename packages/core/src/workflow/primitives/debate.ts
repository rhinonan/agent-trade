import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { AgentRegistry } from "../../agent/registry.js";
import type { ExecutionContext, WorkflowStep, DebateRound } from "../types.js";
import { addFinding, addDebateRound } from "../context.js";
import { createLLM, parseLLMJson } from "./llm.js";
import type { AnalyzeOptions } from "./llm.js";
import type { Analysis } from "../../agent/types.js";

export async function executeDebate(
  step: WorkflowStep,
  registry: AgentRegistry,
  context: ExecutionContext,
  options: AnalyzeOptions = {},
): Promise<ExecutionContext> {
  const match = step.match ?? (Array.isArray(step.agent) ? { capability: undefined } : step.agent);
  const matchedAgents = registry.match(match as any, step.count ?? { min: 2 });
  if (matchedAgents.length < 2) throw new Error("Debate requires at least 2 agents");
  const agentIds = matchedAgents.map(a => a.id);
  const agents = matchedAgents;

  const maxRounds = step.maxRounds ?? 2;

  const topic = (step.prompt ?? "对 {target} 进行辩论分析")
    .replace("{target}", context.target.name ?? context.target.code);

  let currentCtx = context;
  const llm = createLLM(options);

  for (let round = 1; round <= maxRounds; round++) {
    const priorRoundsText = currentCtx.debateRounds
      .flatMap(r => r.entries)
      .map(e => `[${e.agent}]: ${e.argument}`)
      .join("\n");

    const roundEntries: DebateRound["entries"] = [];

    for (const agent of agents) {
      const currentRoundText = roundEntries
        .map(e => `[${e.agent}]: ${e.argument}`)
        .join("\n");
      const history = [priorRoundsText, currentRoundText].filter(Boolean).join("\n");

      const messages: BaseMessage[] = [
        new SystemMessage(`你正在参与一场辩论。你是${agent.name}（立场: ${agent.personality.stance}）。
辩论主题: ${topic}
这是第 ${round}/${maxRounds} 轮。
${round > 1 ? "请回应上一轮对手的观点，补充论据或针对性地反驳。" : "请提出你的核心论点。"}
回复JSON: {"conclusion":"你的论点","confidence":0.0-1.0,"sentiment":"bullish|bearish|neutral","reasoning":["论据1","论据2"]}`),
      ];

      if (history) {
        messages.push(new HumanMessage(`本轮已有的发言:\n${history}\n\n请发表你的观点：`));
      } else {
        messages.push(new HumanMessage("请发表你的开场观点："));
      }

      const response = await llm.invoke(messages);
      const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

      let analysis: Analysis;
      try {
        const parsed = parseLLMJson(text) as Record<string, unknown>;
        analysis = {
          conclusion: (parsed.conclusion as string) ?? text.slice(0, 100),
          confidence: Math.max(0, Math.min(1, (parsed.confidence as number) ?? 0.5)),
          sentiment: (parsed.sentiment as string) ?? "neutral",
          reasoning: Array.isArray(parsed.reasoning) ? (parsed.reasoning as string[]) : [(parsed.reasoning as string) ?? ""],
          rawOutput: text,
        };
      } catch {
        analysis = { conclusion: text.slice(0, 100), confidence: 0.5, sentiment: "neutral" as const, reasoning: ["parse failed"], rawOutput: text };
      }

      currentCtx = addFinding(currentCtx, `${step.id}__round${round}`, agent.id, analysis);
      roundEntries.push({ agent: agent.id, argument: analysis.conclusion });
    }

    currentCtx = addDebateRound(currentCtx, { round, entries: roundEntries });
  }

  return currentCtx;
}
