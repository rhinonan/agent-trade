import { HumanMessage, SystemMessage, type BaseMessage } from "@langchain/core/messages";
import type { AgentRegistry } from "../../agent/registry.js";
import type { ExecutionContext, WorkflowStep, DebateRound } from "../types.js";
import { addFinding, addDebateRound } from "../context.js";
import type { AnalyzeOptions } from "./analyze.js";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Analysis } from "../../agent/types.js";

function createLLM(options: AnalyzeOptions = {}): BaseChatModel {
  if (options.llm) return options.llm;
  return options.provider === "openai"
    ? new ChatOpenAI({ modelName: options.modelName ?? "gpt-4o" })
    : new ChatAnthropic({ modelName: options.modelName ?? "claude-sonnet-4-6" });
}

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

      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
      let analysis: Analysis;
      try {
        const parsed = JSON.parse(jsonStr);
        analysis = {
          conclusion: parsed.conclusion ?? text.slice(0, 100),
          confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
          sentiment: parsed.sentiment ?? "neutral",
          reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning : [parsed.reasoning ?? ""],
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
