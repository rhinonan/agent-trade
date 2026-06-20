import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentRegistry } from "../../agent/registry.js";
import type { ExecutionContext, WorkflowStep } from "../types.js";
import { addFinding } from "../context.js";
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

  // Extract JSON from the final code block
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
  let analysis: Analysis;
  try {
    const parsed = JSON.parse(jsonStr);
    analysis = {
      conclusion: parsed.conclusion ?? "综合研判完成",
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
      sentiment: parsed.sentiment ?? "neutral",
      reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning : [parsed.reasoning ?? ""],
      rawOutput: text,
    };
  } catch {
    analysis = { conclusion: text.slice(0, 200), confidence: 0.5, sentiment: "neutral", reasoning: [text], rawOutput: text };
  }

  return addFinding(context, step.id, agentId, analysis);
}
