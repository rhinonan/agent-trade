import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createLogger } from "../logger.js";

const log = createLogger("llm");

export type LLMProvider = "anthropic" | "openai" | "deepseek";

export interface AnalyzeOptions {
  provider?: LLMProvider;
  modelName?: string;
  llm?: BaseChatModel; // override — used in tests
}

let _defaultProvider: LLMProvider = "anthropic";

export function setDefaultLLMProvider(provider: LLMProvider): void {
  _defaultProvider = provider;
  log.debug("Default LLM provider set", { provider });
}

export function createLLM(options: AnalyzeOptions = {}): BaseChatModel {
  if (options.llm) {
    log.debug("Using injected LLM override");
    return options.llm;
  }
  const provider = options.provider ?? _defaultProvider;
  const model = options.modelName
    ?? (provider === "deepseek" ? "deepseek-chat" : provider === "openai" ? "gpt-4o" : "claude-sonnet-4-6");

  log.debug("Creating LLM instance", { provider, model });

  if (provider === "deepseek") {
    return new ChatOpenAI({
      model,
      configuration: { baseURL: "https://api.deepseek.com/v1" },
    });
  }
  if (provider === "openai") {
    return new ChatOpenAI({ model });
  }
  return new ChatAnthropic({ model });
}
