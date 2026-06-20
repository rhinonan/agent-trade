import type { BaseAgent, AgentPersona, Analysis } from "./types.js";
import type { ExecutionContext } from "../workflow/types.js";
import type { StructuredTool } from "@langchain/core/tools";

export interface HumanInputRequest {
  prompt: string;
  inputFields: string[];
  timeout: number | null;
  contextSummary: string;
}

export type HumanInputHandler = (request: HumanInputRequest) => Promise<Record<string, string>>;

let _handler: HumanInputHandler | null = null;

export function setHumanInputHandler(handler: HumanInputHandler): void {
  _handler = handler;
}

export class HumanAgent implements BaseAgent {
  id = "retail-investor";
  name = "散户（用户）";
  capabilities = ["retail", "human", "sentiment"];
  personality: AgentPersona = {
    stance: "neutral",
    style: "balanced",
    description: "个人投资者，基于综合信息做独立判断",
  };
  tools: StructuredTool[] = [];

  canCritique = true;
  canDebate = true;

  async analyze(context: ExecutionContext): Promise<Analysis> {
    if (!_handler) {
      throw new Error(
        "HumanInputHandler not set. Call setHumanInputHandler() before using HumanAgent."
      );
    }

    const previousFindings = context.findings
      .map(f => `[${f.agent}]: ${f.analysis.conclusion} (${f.analysis.sentiment}, confidence: ${f.analysis.confidence})`)
      .join("\n");

    const request: HumanInputRequest = {
      prompt: `请基于以下分析，对 ${context.target.name ?? context.target.code} 给出你的判断`,
      inputFields: ["观点", "置信度 (0-1)", "理由"],
      timeout: null,
      contextSummary: previousFindings || "(尚无其他Agent的分析结论)",
    };

    const input = await _handler(request);

    const confidence = parseFloat(input["置信度 (0-1)"] ?? "0.5");
    const conclusion = input["观点"] ?? "无法判断";
    const reason = input["理由"] ?? "无";

    let sentiment: "bullish" | "bearish" | "neutral" = "neutral";
    if (conclusion.includes("看多") || conclusion.includes("买入") || conclusion.includes("看好")) {
      sentiment = "bullish";
    } else if (conclusion.includes("看空") || conclusion.includes("卖出") || conclusion.includes("看淡")) {
      sentiment = "bearish";
    }

    return {
      conclusion,
      confidence: Math.max(0, Math.min(1, confidence)),
      sentiment,
      reasoning: [reason],
    };
  }
}
