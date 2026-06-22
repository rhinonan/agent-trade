import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentRegistry } from "../registry.js";
import type { ExecutionContext, WorkflowStep, Analysis, DebateRound } from "../types.js";
import { addFinding, addDebateRound } from "../context.js";
import { createLLM, type AnalyzeOptions } from "../../llm/create-llm.js";
import { parseLLMJson, parseSentiment } from "../../llm/parse.js";

export async function executeDebate(
  step: WorkflowStep,
  registry: AgentRegistry,
  context: ExecutionContext,
  options: AnalyzeOptions = {},
): Promise<ExecutionContext> {
  const agentMatches = (Array.isArray(step.agent) ? step.agent : [step.agent]).filter(Boolean) as { id: string }[];
  if (agentMatches.length < 2) throw new Error("Debate requires at least 2 agents");

  const agents = agentMatches.map(m => {
    const a = registry.get(m.id);
    if (!a) throw new Error(`Agent "${m.id}" not found`);
    return a;
  });

  const maxRounds = step.maxRounds ?? 2;
  const llm = createLLM(options);
  let currentCtx = context;

  for (let r = 0; r < maxRounds; r++) {
    const entries: DebateRound["entries"] = [];

    for (const agent of agents) {
      const othersText = entries.map(e => `[${e.agent}]: ${e.argument}`).join("\n");
      const prompt = `辩论轮次 ${r + 1}/${maxRounds}。${step.prompt ?? "就分析结论进行辩论"}`
        .replace("{target}", currentCtx.target.name ?? currentCtx.target.code);

      const messages = [
        new SystemMessage(`你是${agent.name}，立场${agent.personality.stance}。请发表辩论观点。输出JSON: {"conclusion":"你的论点","confidence":0.0-1.0,"sentiment":"bullish|bearish|neutral","reasoning":["论据"]}`),
        new HumanMessage(`${prompt}${othersText ? `\n\n对方观点：\n${othersText}` : ""}`),
      ];

      const response = await llm.invoke(messages);
      const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

      try {
        const parsed = parseLLMJson(text) as Record<string, unknown>;
        const analysis: Analysis = {
          conclusion: (parsed.conclusion as string) ?? text.slice(0, 100),
          confidence: Math.max(0, Math.min(1, (parsed.confidence as number) ?? 0.5)),
          sentiment: parseSentiment(parsed.sentiment),
          reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning as string[] : [],
          rawOutput: text,
        };
        currentCtx = addFinding(currentCtx, `${step.id}_r${r}`, agent.id, analysis);
        entries.push({ agent: agent.id, argument: analysis.conclusion });
      } catch {
        const fallback: Analysis = {
          conclusion: text.slice(0, 200),
          confidence: 0.5,
          sentiment: "neutral" as const,
          reasoning: ["无法解析LLM输出为JSON"],
          rawOutput: text,
        };
        currentCtx = addFinding(currentCtx, `${step.id}_r${r}`, agent.id, fallback);
        entries.push({ agent: agent.id, argument: text.slice(0, 200) });
      }
    }

    currentCtx = addDebateRound(currentCtx, { round: r + 1, entries });
  }

  return currentCtx;
}
