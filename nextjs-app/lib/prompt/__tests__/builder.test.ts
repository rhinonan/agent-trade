import { describe, it, expect, beforeEach } from "vitest";
import {
  buildSystemPrompt,
  registerPrompt,
  getPromptForAgent,
  defaultPrompt,
} from "../builder.js";
import type { BaseAgent, ExecutionContext, Analysis } from "../../engine/types.js";
import { createContext } from "../../engine/context.js";

// Import technical prompt module to trigger registration side-effect
import "../technical.js";

function fakeAgent(overrides: Partial<BaseAgent> = {}): BaseAgent {
  return {
    id: "test-agent",
    name: "Test",
    capabilities: [],
    personality: { stance: "neutral" },
    tools: [],
    async analyze(_ctx: ExecutionContext): Promise<Analysis> {
      return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
    },
    ...overrides,
  };
}

describe("buildSystemPrompt", () => {
  it("uses default prompt when no agent-specific prompt is registered", () => {
    const agent = fakeAgent({ id: "unknown-agent" });
    const ctx = createContext(
      { type: "stock", code: "000001", name: "平安银行" },
      "test",
    );
    const prompt = buildSystemPrompt(agent, ctx);
    expect(prompt).toContain(defaultPrompt.identity);
    expect(prompt).toContain(defaultPrompt.outputFormat);
  });

  it("returns agent.systemPrompt string override when set", () => {
    const agent = fakeAgent({
      id: "test",
      systemPrompt: "自定义系统提示词",
    });
    const ctx = createContext({ type: "stock", code: "x" }, "test");
    expect(buildSystemPrompt(agent, ctx)).toBe("自定义系统提示词");
  });

  it("uses registered technical prompt for technical-bull agent", () => {
    const agent = fakeAgent({
      id: "technical-bull",
      personality: { stance: "bullish" },
    });
    const ctx = createContext(
      { type: "stock", code: "600519", name: "茅台" },
      "test",
    );
    const prompt = buildSystemPrompt(agent, ctx);
    expect(prompt).toContain("技术面分析师");
    expect(prompt).toContain("道氏理论");
    expect(prompt).toContain("看多");
  });

  it("includes tool descriptions when agent has tools", () => {
    const agent = fakeAgent({
      id: "technical-bull",
      tools: [
        {
          name: "get-kline",
          description: "获取K线数据",
          parameters: { type: "object", properties: {}, required: [] },
          execute: async () => "{}",
        },
      ] as any,
    });
    const ctx = createContext(
      { type: "stock", code: "600519", name: "茅台" },
      "test",
    );
    const prompt = buildSystemPrompt(agent, ctx);
    expect(prompt).toContain("get-kline");
    expect(prompt).toContain("获取K线数据");
  });
});

describe("getPromptForAgent", () => {
  it("returns undefined for unregistered agent", () => {
    expect(getPromptForAgent("nonexistent")).toBeUndefined();
  });

  it("finds by prefix match: technical-bear matches technical", () => {
    const prompt = getPromptForAgent("technical-bear");
    expect(prompt).toBeDefined();
    expect(prompt!.identity).toContain("技术面分析师");
  });
});
