import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type LLMProvider = "anthropic" | "openai" | "deepseek";

export interface AnalyzeOptions {
  provider?: LLMProvider;
  modelName?: string;
  llm?: BaseChatModel; // override — used in tests
}

let _defaultProvider: LLMProvider = "anthropic";

export function setDefaultLLMProvider(provider: LLMProvider): void {
  _defaultProvider = provider;
}

export function createLLM(options: AnalyzeOptions = {}): BaseChatModel {
  if (options.llm) return options.llm;
  const provider = options.provider ?? _defaultProvider;
  if (provider === "deepseek") {
    return new ChatOpenAI({
      modelName: options.modelName ?? "deepseek-chat",
      configuration: { baseURL: "https://api.deepseek.com/v1" },
    });
  }
  if (provider === "openai") {
    return new ChatOpenAI({ modelName: options.modelName ?? "gpt-4o" });
  }
  return new ChatAnthropic({ modelName: options.modelName ?? "claude-sonnet-4-6" });
}

/** Extract and parse JSON from an LLM response.
 *  Supports ```json ... ``` and ``` ... ``` fenced blocks,
 *  falling back to treating the whole text as raw JSON. */
export function parseLLMJson(text: string): unknown {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
  return JSON.parse(jsonStr);
}

export type Sentiment = "bullish" | "bearish" | "neutral";

const VALID_SENTIMENTS = new Set(["bullish", "bearish", "neutral"]);

export function parseSentiment(value: unknown): Sentiment {
  if (typeof value === "string" && VALID_SENTIMENTS.has(value)) {
    return value as Sentiment;
  }
  return "neutral";
}
