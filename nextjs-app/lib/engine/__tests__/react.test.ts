import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { runReActLoop, type ReActEvent } from "../react.js";
import { createContext } from "../context.js";
import type { BaseAgent, ExecutionContext, Analysis, AnalysisTarget } from "../types.js";
import type { ToolDefinition, ToolContext } from "../../tools/types.js";
import { registerPrompt } from "../../prompt/builder.js";

// ——— Test helpers ———

const testTarget: AnalysisTarget = { type: "stock", code: "600519", name: "茅台" };

function fakeAgent(overrides: Partial<BaseAgent> = {}): BaseAgent {
  return {
    id: "test-agent",
    name: "Test Agent",
    capabilities: ["test"],
    personality: { stance: "neutral" },
    tools: [],
    async analyze(_ctx: ExecutionContext): Promise<Analysis> {
      return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
    },
    ...overrides,
  };
}

/** Create a fake tool that returns preset data */
function fakeTool(name: string, result: string): ToolDefinition {
  return {
    name,
    description: `Fake tool: ${name}`,
    parameters: {
      type: "object",
      properties: {
        param1: { type: "string", description: "A parameter" },
      },
      required: [],
    },
    async execute(_params, _ctx) {
      return result;
    },
  };
}

// ——— Tests ———

describe("runReActLoop", () => {
  // Ensure a default prompt is registered so buildSystemPrompt works
  beforeEach(() => {
    registerPrompt("test-agent", {
      identity: "你是一个测试分析师。",
      outputFormat: '输出JSON：{"conclusion":"...","confidence":0.5,"sentiment":"neutral","reasoning":[]}',
    });
  });

  it("returns analysis after single LLM call when agent has no tools", async () => {
    const agent = fakeAgent();
    const ctx = createContext(testTarget, "测试分析");

    const events: ReActEvent[] = [];
    const analysis = await runReActLoop({
      agent,
      context: ctx,
      prompt: "分析 {target}",
      target: testTarget,
      maxSteps: 5,
      llmOptions: {
        llm: {
          async invoke(_msgs: unknown[]) {
            return new AIMessage({
              content: '{"conclusion":"测试结论","confidence":0.8,"sentiment":"bullish","reasoning":["理由1"]}',
            });
          },
          bindTools: () => ({
            async invoke(_msgs: unknown[]) {
              return new AIMessage({
                content: '{"conclusion":"测试结论","confidence":0.8,"sentiment":"bullish","reasoning":["理由1"]}',
              });
            },
          }),
        } as any,
      },
      onEvent: (e) => events.push(e),
    });

    expect(analysis.conclusion).toBe("测试结论");
    expect(analysis.confidence).toBe(0.8);
    expect(analysis.sentiment).toBe("bullish");
    expect(analysis.reasoning).toEqual(["理由1"]);
    expect(analysis.forcedSummary).toBeUndefined();
    expect(events.length).toBeGreaterThanOrEqual(2); // thought + final
    expect(events[events.length - 1].type).toBe("final");
  });

  it("loops: tool call then final answer", async () => {
    const toolExecuted = vi.fn().mockResolvedValue('{"data": [1, 2, 3]}');
    const agent = fakeAgent({
      id: "test-agent",
      tools: [
        {
          name: "get-data",
          description: "获取数据",
          parameters: {
            type: "object",
            properties: { symbol: { type: "string", description: "股票代码" } },
            required: ["symbol"],
          },
          execute: toolExecuted,
        },
      ] as any,
    });

    const ctx = createContext(testTarget, "测试分析");

    // First call returns tool_call, second returns final answer
    let callCount = 0;
    const events: ReActEvent[] = [];

    const analysis = await runReActLoop({
      agent,
      context: ctx,
      prompt: "分析 {target}",
      target: testTarget,
      maxSteps: 5,
      llmOptions: {
        llm: {
          bindTools: () => ({
            async invoke(_msgs: unknown[]) {
              callCount++;
              if (callCount === 1) {
                // First call: request tool
                return new AIMessage({
                  content: "我需要获取数据",
                  tool_calls: [
                    {
                      id: "call_1",
                      name: "get-data",
                      args: { symbol: "600519" },
                    },
                  ],
                });
              }
              // Second call: final answer
              return new AIMessage({
                content:
                  '{"conclusion":"数据驱动的结论","confidence":0.9,"sentiment":"bullish","reasoning":["基于数据"]}',
              });
            },
          }),
        } as any,
      },
      onEvent: (e) => events.push(e),
    });

    expect(callCount).toBe(2);
    expect(toolExecuted).toHaveBeenCalledTimes(1);
    expect(toolExecuted).toHaveBeenCalledWith(
      { symbol: "600519" },
      expect.any(Object), // ToolContext
    );
    expect(analysis.conclusion).toBe("数据驱动的结论");
    expect(analysis.confidence).toBe(0.9);

    // Verify events
    const actions = events.filter((e) => e.type === "action");
    const observations = events.filter((e) => e.type === "observation");
    expect(actions.length).toBe(1);
    expect(actions[0]).toMatchObject({ type: "action", toolName: "get-data" });
    expect(observations.length).toBe(1);
    expect(observations[0]).toMatchObject({ type: "observation", toolName: "get-data" });
  });

  it("hits maxSteps and forces summary", async () => {
    const agent = fakeAgent({
      tools: [
        fakeTool("loop-tool", '{"result": "ok"}'),
      ] as any,
    });

    const ctx = createContext(testTarget, "测试分析");

    // Always return tool call — never give final answer
    const events: ReActEvent[] = [];

    const analysis = await runReActLoop({
      agent,
      context: ctx,
      prompt: "分析 {target}",
      target: testTarget,
      maxSteps: 2,
      llmOptions: {
        llm: {
          async invoke(_msgs: unknown[]) {
            // Force summary path calls llm.invoke() directly
            return new AIMessage({
              content: '{"conclusion":"forced结论","confidence":0.3,"sentiment":"neutral","reasoning":["步数耗尽"]}',
            });
          },
          bindTools: () => ({
            async invoke(_msgs: unknown[]) {
              return new AIMessage({
                content: "需要更多数据",
                tool_calls: [
                  {
                    id: "call_loop",
                    name: "loop-tool",
                    args: { param1: "x" },
                  },
                ],
              });
            },
          }),
        } as any,
      },
      onEvent: (e) => events.push(e),
    });

    expect(analysis.forcedSummary).toBe(true);
    // Should have forced summary event
    const forcedEvent = events.find((e) => e.type === "forced_summary");
    expect(forcedEvent).toBeDefined();
  });

  it("tool error is caught and converted to ToolMessage (does not crash loop)", async () => {
    const failingTool: ToolDefinition = {
      name: "failing-tool",
      description: "这个工具总是出错",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      async execute(_params, _ctx) {
        throw new Error("数据库连接失败");
      },
    };

    const agent = fakeAgent({
      tools: [failingTool] as any,
    });

    const ctx = createContext(testTarget, "测试分析");

    let callCount = 0;
    const analysis = await runReActLoop({
      agent,
      context: ctx,
      prompt: "分析 {target}",
      target: testTarget,
      maxSteps: 5,
      llmOptions: {
        llm: {
          bindTools: () => ({
            async invoke(_msgs: unknown[]) {
              callCount++;
              if (callCount === 1) {
                return new AIMessage({
                  content: "调用工具",
                  tool_calls: [
                    { id: "call_fail", name: "failing-tool", args: {} },
                  ],
                });
              }
              return new AIMessage({
                content:
                  '{"conclusion":"工具失败后的结论","confidence":0.4,"sentiment":"neutral","reasoning":["工具出错"]}',
              });
            },
          }),
        } as any,
      },
    });

    // Loop should NOT crash — error becomes ToolMessage, LLM sees it and recovers
    expect(callCount).toBe(2);
    expect(analysis.conclusion).toBe("工具失败后的结论");
  });

  it("replaces {target} placeholder in prompt", async () => {
    const agent = fakeAgent();
    const ctx = createContext(testTarget, "测试");
    let capturedMessages: unknown[] = [];

    await runReActLoop({
      agent,
      context: ctx,
      prompt: "请分析股票 {target} 的走势",
      target: testTarget,
      llmOptions: {
        llm: {
          async invoke(msgs: unknown[]) {
            capturedMessages = msgs;
            return new AIMessage({
              content:
                '{"conclusion":"ok","confidence":0.5,"sentiment":"neutral","reasoning":[]}',
            });
          },
          bindTools: () => ({
            async invoke(msgs: unknown[]) {
              capturedMessages = msgs;
              return new AIMessage({
                content:
                  '{"conclusion":"ok","confidence":0.5,"sentiment":"neutral","reasoning":[]}',
              });
            },
          }),
        } as any,
      },
    });

    const humanMsg = capturedMessages.find((m) => m instanceof HumanMessage) as HumanMessage;
    expect(humanMsg).toBeDefined();
    const content = typeof humanMsg.content === "string" ? humanMsg.content : "";
    expect(content).toContain("茅台");
    expect(content).not.toContain("{target}");
  });

  it("respects AbortSignal", async () => {
    const agent = fakeAgent();
    const ctx = createContext(testTarget, "测试");
    const controller = new AbortController();
    controller.abort();

    await expect(
      runReActLoop({
        agent,
        context: ctx,
        prompt: "分析",
        target: testTarget,
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled");
  });
});
