import { describe, it, expect } from "vitest";
import { Annotation } from "@langchain/langgraph";
import { ChatPromptTemplate, SystemMessagePromptTemplate } from "@langchain/core/prompts";
import { FakeToolCallingChatModel } from "../../llm/__tests__/test-utils.js";

// Mirror of WorkflowState for test isolation (avoids coupling to the real state module)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TestState = Annotation.Root({
  target: Annotation<string>,
  task: Annotation<string>,
  findings: Annotation<Record<string, unknown>>,
  messages: Annotation<{ role: string; content: string }[]>,
  round: Annotation<number>,
  should_stop: Annotation<boolean>,
  stop_reason: Annotation<"yield" | "max_rounds" | "">,
});

describe("agentNode", () => {
  it("produces a finding in state after execution", async () => {
    const fakeLLM = new FakeToolCallingChatModel({
      response: JSON.stringify({
        conclusion: "测试结论",
        confidence: 0.8,
        sentiment: "bullish",
        reasoning: ["理由1", "理由2"],
      }),
    });

    // Build a compiled agent without tools
    const compiled = {
      id: "test-agent",
      name: "测试",
      systemPrompt: ChatPromptTemplate.fromMessages([
        SystemMessagePromptTemplate.fromTemplate("你是测试分析师"),
      ]),
      tools: [],
      maxToolSteps: 5,
    };

    const { buildAgentNode } = await import("../nodes.js");
    // buildAgentNode(compiled, taskPrompt, llmFactory)
    const node = buildAgentNode(compiled, "分析", () => fakeLLM);

    const state = {
      target: "000001",
      task: "分析",
      findings: {},
      messages: [],
      round: 0,
      should_stop: false,
      stop_reason: "" as const,
    };

    const result = await node(state);
    expect(result.findings).toHaveProperty("test-agent");
    expect((result.findings as any)["test-agent"].conclusion).toBe("测试结论");
  });
});

describe("checkYieldNode", () => {
  it("sets should_stop=true when any participant yields", async () => {
    const { buildCheckYieldNode } = await import("../nodes.js");
    const node = buildCheckYieldNode("yield", "any");

    const state = {
      target: "000001",
      task: "辩论",
      findings: {
        round_1_bull: { argument: "看多", yield: false },
        round_1_bear: { argument: "看空", yield: true },
      },
      messages: [],
      round: 1,
      should_stop: false,
      stop_reason: "" as const,
    };

    const result = await node(state);
    expect(result.should_stop).toBe(true);
  });

  it("does not stop if no participant yields", async () => {
    const { buildCheckYieldNode } = await import("../nodes.js");
    const node = buildCheckYieldNode("yield", "any");

    const state = {
      target: "000001",
      task: "辩论",
      findings: {
        round_1_bull: { argument: "看多", yield: false },
        round_1_bear: { argument: "看空", yield: false },
      },
      messages: [],
      round: 1,
      should_stop: false,
      stop_reason: "" as const,
    };

    const result = await node(state);
    expect(result.should_stop).toBe(false);
  });
});
