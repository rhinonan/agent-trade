/**
 * Fake chat model for testing primitives without real LLM calls.
 * Extends LangChain's BaseChatModel so it's compatible with AgentExecutor.
 */
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";

export interface FakeResponse {
  text: string;
}

export class FakeChatModel extends BaseChatModel {
  lc_namespace = ["agenttrade", "test"];

  constructor(private responses: FakeResponse[] = []) {
    super({});
    this.responses = responses;
  }

  setResponses(responses: FakeResponse[]): void {
    this.responses = [...responses];
  }

  _llmType(): string {
    return "fake";
  }

  async _generate(
    _messages: BaseMessage[],
    _options?: this["ParsedCallOptions"],
    _runManager?: any,
  ): Promise<{ generations: { text: string; message: AIMessage }[] }> {
    const next = this.responses.shift();
    const text = next?.text ?? '{"conclusion":"默认结论","confidence":0.5,"sentiment":"neutral","reasoning":["无足够信息"]}';
    return {
      generations: [{ text, message: new AIMessage(text) }],
    };
  }
}
