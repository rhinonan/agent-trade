import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentRegistry } from "../registry.js";
import type { ExecutionContext, WorkflowStep, Analysis } from "../types.js";
import { addFinding } from "../context.js";
import { createLLM, type AnalyzeOptions } from "../../llm/create-llm.js";
import { parseLLMJson, parseSentiment } from "../../llm/parse.js";

export async function executeAnalyze(
  step: WorkflowStep,
  registry: AgentRegistry,
  context: ExecutionContext,
  options: AnalyzeOptions = {},
): Promise<ExecutionContext> {
  const match = step.agent as { id?: string; capability?: string } | undefined;
  if (!match) throw new Error(`Analyze step "${step.id}" requires an agent match`);

  const agents = registry.match(match as any, { min: 1, max: 1 });
  if (agents.length === 0) {
    throw new Error(`No agent found for step "${step.id}" matching ${JSON.stringify(match)}`);
  }
  const agent = agents[0];

  const prompt = (step.prompt ?? "分析 {target}")
    .replace("{target}", context.target.name ?? context.target.code);

  const llm = createLLM(options);
  const messages = [
    new SystemMessage(buildSystemPrompt(agent.personality.stance)),
    new HumanMessage(formatPromptWithContext(prompt, context)),
  ];

  const response = await llm.invoke(messages);
  const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  const analysis = parseAnalysis(text, agent.id);

  return addFinding(context, step.id, agent.id, analysis);
}

function buildSystemPrompt(stance: string): string {
  const stanceGuide: Record<string, string> = {
    bullish: "你是一个乐观的分析师，倾向于寻找积极因素和上涨信号。",
    bearish: "你是一个谨慎的分析师，倾向于寻找风险因素和下跌信号。",
    neutral: "你是一个客观的分析师，平衡考虑多空因素。",
  };
  return `${stanceGuide[stance] ?? stanceGuide.neutral}
请用中文回复。输出JSON格式：{"conclusion":"结论","confidence":0.0-1.0,"sentiment":"bullish|bearish|neutral","reasoning":["理由1","理由2","理由3"]}`;
}

function formatPromptWithContext(prompt: string, context: ExecutionContext): string {
  const parts = [prompt];
  const prevFindings = context.findings;
  if (prevFindings.length > 0) {
    parts.push("\n\n已有的分析结论（供参考）：");
    for (const f of prevFindings) {
      parts.push(`- [${f.agent}]: ${f.analysis.conclusion} (置信度: ${f.analysis.confidence})`);
    }
  }
  return parts.join("\n");
}

function parseAnalysis(text: string, _agentId: string): Analysis {
  try {
    const parsed = parseLLMJson(text) as Record<string, unknown>;
    return {
      conclusion: (parsed.conclusion as string) ?? "无法解析",
      confidence: Math.max(0, Math.min(1, (parsed.confidence as number) ?? 0.5)),
      sentiment: parseSentiment(parsed.sentiment),
      reasoning: Array.isArray(parsed.reasoning) ? (parsed.reasoning as string[]) : [(parsed.reasoning as string) ?? ""],
      rawOutput: text,
    };
  } catch {
    return {
      conclusion: text.slice(0, 100),
      confidence: 0.5,
      sentiment: "neutral",
      reasoning: ["无法解析LLM输出为JSON"],
      rawOutput: text,
    };
  }
}
