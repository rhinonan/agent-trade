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
      model: options.modelName ?? "deepseek-chat",
      configuration: { baseURL: "https://api.deepseek.com/v1" },
    });
  }
  if (provider === "openai") {
    return new ChatOpenAI({ model: options.modelName ?? "gpt-4o" });
  }
  return new ChatAnthropic({ model: options.modelName ?? "claude-sonnet-4-6" });
}
