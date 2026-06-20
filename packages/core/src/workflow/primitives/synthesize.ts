import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentRegistry } from "../../agent/registry.js";
import type { ExecutionContext, WorkflowStep } from "../types.js";
import { addFinding } from "../context.js";
import { createLLM, parseLLMJson } from "./llm.js";
import type { AnalyzeOptions } from "./llm.js";
import type { Analysis } from "../../agent/types.js";

export async function executeSynthesize(
  step: WorkflowStep,
  registry: AgentRegistry,
  context: ExecutionContext,
  options: AnalyzeOptions = {},
): Promise<ExecutionContext> {
  const agentId = (step.agent as { id: string })?.id ?? "judge";
  const judge = registry.get(agentId);

  const allFindingsSummary = context.findings
    .map(f => `### [${f.step}] ${f.agent}\n**结论**: ${f.analysis.conclusion}\n**立场**: ${f.analysis.sentiment}\n**置信度**: ${f.analysis.confidence}\n**理由**:\n${f.analysis.reasoning.map(r => `- ${r}`).join("\n")}`)
    .join("\n\n");

  const debateSummary = context.debateRounds
    .map(r => `**第${r.round}轮**:\n${r.entries.map(e => `  - [${e.agent}]: ${e.argument}`).join("\n")}`)
    .join("\n\n");

  const prompt = (step.prompt ?? "综合以上所有分析结论和辩论记录，对 {target} 给出最终研判报告")
    .replace("{target}", context.target.name ?? context.target.code);

  const llm = createLLM(options);
  const systemPrompt = `你是一位首席投资分析师，负责综合团队的研究成果给出最终研判。
你需要：
1. 汇总多空双方的核心观点
2. 评估各方论据的有力程度
3. 指出被忽略的关键因素
4. 给出最终建议（包括操作建议、关键点位参考）
5. 如果信息不足以做出判断，诚实说明

请用中文回复Markdown格式的综合研判报告。最后附加一行JSON便于程序解析：
\`\`\`json
{"conclusion":"最终结论","confidence":0.0-1.0,"sentiment":"bullish|bearish|neutral","reasoning":["核心论据1","核心论据2"]}
\`\`\``;

  const messages = [
    new SystemMessage(systemPrompt),
    new HumanMessage(`${prompt}\n\n===== 全部分析记录 =====\n${allFindingsSummary}\n\n===== 辩论记录 =====\n${debateSummary || "(无辩论记录)"}`),
  ];

  const response = await llm.invoke(messages);
  const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

  let analysis: Analysis;
  try {
    const parsed = parseLLMJson(text) as Record<string, unknown>;
    analysis = {
      conclusion: (parsed.conclusion as string) ?? "综合研判完成",
      confidence: Math.max(0, Math.min(1, (parsed.confidence as number) ?? 0.5)),
      sentiment: (parsed.sentiment as string) ?? "neutral",
      reasoning: Array.isArray(parsed.reasoning) ? (parsed.reasoning as string[]) : [(parsed.reasoning as string) ?? ""],
      rawOutput: text,
    };
  } catch {
    analysis = { conclusion: text.slice(0, 200), confidence: 0.5, sentiment: "neutral", reasoning: [text], rawOutput: text };
  }

  return addFinding(context, step.id, agentId, analysis);
}
