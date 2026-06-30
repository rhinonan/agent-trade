import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createLogger } from "../logger.js";

/**
 * LLM 提供商工厂 — 创建 LangChain ChatModel 实例。
 *
 * 支持三种提供商：
 * - Anthropic Claude（默认，通过 ChatAnthropic）
 * - OpenAI GPT（通过 ChatOpenAI）
 * - DeepSeek（通过 ChatOpenAI + 自定义 baseURL）
 *
 * 选择优先级：注入的 LLM 实例 > provider 参数 > 全局默认值
 */

const log = createLogger("llm");

/** 支持的 LLM 提供商类型 */
export type LLMProvider = "anthropic" | "openai" | "deepseek";

/** 分析选项 — 包含 LLM 提供商选择和模型配置 */
export interface AnalyzeOptions {
  /** LLM 提供商，不设置则使用全局默认值 */
  provider?: LLMProvider;
  /** 模型名称，不设置则根据提供商选择默认模型 */
  modelName?: string;
  /** 注入的 LLM 实例（用于测试覆盖） */
  llm?: BaseChatModel;
}

/** 全局默认 LLM 提供商，初始值为 "anthropic" */
let _defaultProvider: LLMProvider = "anthropic";

/** 设置全局默认 LLM 提供商 */
export function setDefaultLLMProvider(provider: LLMProvider): void {
  _defaultProvider = provider;
  log.debug("Default LLM provider set", { provider });
}

/**
 * 创建 LLM 实例。
 *
 * 逻辑：
 * 1. 如果传入了 options.llm（注入覆盖），直接使用（通常用于测试）
 * 2. 否则使用 options.provider，未设置则用全局默认值
 * 3. 根据提供商选择默认模型：
 *    - deepseek → "deepseek-chat"（通过 OpenAI 兼容 API，baseURL 指向 api.deepseek.com）
 *    - openai → "gpt-4o"
 *    - anthropic → "claude-sonnet-4-6"
 */
export function createLLM(options: AnalyzeOptions = {}): BaseChatModel {
  // 注入覆盖（测试用）
  if (options.llm) {
    log.debug("Using injected LLM override");
    return options.llm;
  }
  const provider = options.provider ?? _defaultProvider;
  const model = options.modelName
    ?? (provider === "deepseek" ? "deepseek-chat" : provider === "openai" ? "gpt-4o" : "claude-sonnet-4-6");

  log.debug("Creating LLM instance", { provider, model });

  // DeepSeek 使用 OpenAI 兼容 API，需要自定义 baseURL
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
