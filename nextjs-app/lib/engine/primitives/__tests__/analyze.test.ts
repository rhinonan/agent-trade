import { describe, it, expect } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { AgentRegistry } from "../../registry.js";
import { createContext } from "../../context.js";
import { executeAnalyze } from "../analyze.js";
import type { BaseAgent, ExecutionContext, WorkflowStep, Analysis } from "../../types.js";

class FakeChatModel {
  async invoke(_messages: HumanMessage[]) {
    return { content: '{"conclusion":"看涨信号强烈","confidence":0.85,"sentiment":"bullish","reasoning":["MACD金叉","放量突破","均线多头"]}' };
  }
}

function fakeAgent(overrides: Partial<BaseAgent> = {}): BaseAgent {
  return {
    id: "test-bull",
    name: "Test Bull",
    capabilities: ["technical", "bullish"],
    personality: { stance: "bullish" },
    tools: [],
    async analyze(_ctx: ExecutionContext): Promise<Analysis> {
      return { conclusion: "看涨", confidence: 0.7, sentiment: "bullish", reasoning: [] };
    },
    ...overrides,
  };
}

describe("executeAnalyze", () => {
  it("produces a finding from an agent matched by capability", async () => {
    const registry = new AgentRegistry();
    registry.register(fakeAgent());

    const ctx = createContext(
      { type: "stock", code: "600519", name: "茅台" },
      "分析茅台",
    );

    const step: WorkflowStep = {
      id: "bull-step",
      type: "analyze",
      agent: { capability: "bullish" },
      prompt: "从技术面看多 {target}",
    };

    const result = await executeAnalyze(step, registry, ctx, {
      llm: new FakeChatModel() as any,
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].step).toBe("bull-step");
    expect(result.findings[0].agent).toBe("test-bull");
    expect(result.findings[0].analysis.sentiment).toBe("bullish");
    expect(result.findings[0].analysis.confidence).toBeGreaterThan(0);
  });

  it("replaces {target} placeholder in prompt", async () => {
    const registry = new AgentRegistry();
    // Use a custom agent that captures the prompt for verification
    let capturedContent = "";
    class CapturingModel {
      async invoke(msgs: HumanMessage[]) {
        capturedContent = typeof msgs[1].content === "string" ? msgs[1].content as string : "";
        return { content: '{"conclusion":"ok","confidence":0.5,"sentiment":"neutral","reasoning":["test"]}' };
      }
    }

    registry.register(fakeAgent({ id: "capture" }));

    const step: WorkflowStep = {
      id: "s1", type: "analyze",
      agent: { id: "capture" },
      prompt: "分析 {target}",
    };

    await executeAnalyze(step, registry, createContext(
      { type: "stock", code: "600519", name: "茅台" },
      "test",
    ), { llm: new CapturingModel() as any });

    expect(capturedContent).toContain("茅台");
  });

  it("throws when no agent matches", async () => {
    const registry = new AgentRegistry();
    const step: WorkflowStep = {
      id: "s1", type: "analyze",
      agent: { capability: "nonexistent" },
    };
    await expect(
      executeAnalyze(step, registry, createContext({ type: "stock", code: "x" }, "test"))
    ).rejects.toThrow("No agent found");
  });
});
