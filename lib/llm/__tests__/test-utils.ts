import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";

/**
 * A fake chat model that returns a fixed response string.
 * Useful for unit-testing LangGraph nodes and agent logic without real LLM calls.
 */
export class FakeToolCallingChatModel extends BaseChatModel {
  response: string;

  constructor(fields: { response: string }) {
    super({});
    this.response = fields.response;
  }

  _llmType(): string {
    return "fake-tool-calling";
  }

  async _generate(
    _messages: BaseMessage[],
    _options?: this["ParsedCallOptions"],
  ): Promise<{
    generations: Array<{ text: string; message: AIMessage }>;
  }> {
    return {
      generations: [
        { text: this.response, message: new AIMessage(this.response) },
      ],
    };
  }
}
