import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentRegistry } from "../../agent/registry.js";
import type { ExecutionContext, WorkflowStep } from "../types.js";
import { addFinding, getStepFindings } from "../context.js";
import { type AnalyzeOptions } from "./analyze.js";
import { FakeChatModel } from "../../llm/fake-model.js";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

function createLLM(options: AnalyzeOptions = {}): BaseChatModel {
  if (options.llm) return options.llm;
  const provider = options.provider ?? "anthropic";
  if (provider === "openai") return new ChatOpenAI({ modelName: options.modelName ?? "gpt-4o" });
  return new ChatAnthropic({ modelName: options.modelName ?? "claude-sonnet-4-6" });
}

export async function executeCritique(
  step: WorkflowStep,
  registry: AgentRegistry,
  context: ExecutionContext,
  options: AnalyzeOptions = {},
): Promise<ExecutionContext> {
  if (!step.targetStep) {
    throw new Error(`Critique step "${step.id}" requires targetStep`);
  }

  const targetFindings = getStepFindings(context, step.targetStep);
  if (targetFindings.length === 0) {
    throw new Error(`No findings from target step "${step.targetStep}" for critique`);
  }

  const reviewerId = step.reviewer ?? step.agent?.id;
  if (!reviewerId) throw new Error(`Critique step "${step.id}" requires a reviewer`);

  const reviewer = registry.get(reviewerId);
  if (!reviewer) throw new Error(`Reviewer agent "${reviewerId}" not found`);

  const targetText = targetFindings
    .map(f => `[${f.agent}] 结论: ${f.analysis.conclusion}\n置信度: ${f.analysis.confidence}\n理由:\n${f.analysis.reasoning.map(r => `  - ${r}`).join("\n")}`)
    .join("\n\n");

  const prompt = (step.prompt ?? "审阅以下分析结论，找出逻辑漏洞和不足之处：")
    .replace("{target}", context.target.name ?? context.target.code);

  const llm = createLLM(options);
  const messages = [
    new SystemMessage(`你是一个严谨的分析审阅者。批判性地审视以下分析结论，找出：
1. 逻辑漏洞或假设不成立的地方
2. 数据支撑不足的论点
3. 被忽略的风险因素
4. 反驳的观点和证据

请用中文回复JSON格式：
{"conclusion":"审阅总结","confidence":0.0-1.0,"sentiment":"bullish|bearish|neutral","reasoning":["问题1","问题2","问题3"]}`),
    new HumanMessage(`${prompt}\n\n===== 待审阅分析 =====\n${targetText}\n=====`),
  ];

  const response = await llm.invoke(messages);
  const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

  // Parse JSON (same pattern as analyze)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
  let analysis;
  try {
    const parsed = JSON.parse(jsonStr);
    analysis = {
      conclusion: parsed.conclusion ?? "无法解析",
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
      sentiment: parsed.sentiment ?? "neutral",
      reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning : [parsed.reasoning ?? ""],
      rawOutput: text,
    };
  } catch {
    analysis = { conclusion: text.slice(0, 100), confidence: 0.5, sentiment: "neutral" as const, reasoning: ["parse failed"], rawOutput: text };
  }

  return addFinding(context, step.id, reviewerId, analysis);
}
