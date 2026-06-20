import { describe, it, expect, beforeEach } from "vitest";
import { executeCritique } from "../workflow/primitives/critique.js";
import { AgentRegistry } from "../agent/registry.js";
import { createContext, addFinding } from "../workflow/context.js";
import { FakeChatModel } from "../llm/fake-model.js";
import type { BaseAgent, Analysis } from "../agent/types.js";
import type { ExecutionContext } from "../workflow/types.js";

function makeAgent(id: string): BaseAgent {
  return {
    id, name: id, capabilities: ["reviewer"],
    personality: { stance: "neutral" },
    tools: [],
    analyze: async (_ctx: ExecutionContext): Promise<Analysis> => ({
      conclusion: "ok", confidence: 0.5, sentiment: "neutral", reasoning: ["r"],
    }),
  };
}

describe("executeCritique", () => {
  let registry: AgentRegistry;
  const fakeLLM = new FakeChatModel([
    { text: '{"conclusion":"有逻辑漏洞","confidence":0.6,"sentiment":"bearish","reasoning":["问题1: 数据不足","问题2: 忽略风险"]}' },
  ]);

  beforeEach(() => { registry = new AgentRegistry(); });

  it("reviews findings from target step", async () => {
    registry.register(makeAgent("reviewer1"));
    const targetAnalysis: Analysis = {
      conclusion: "目标分析结果", confidence: 0.9, sentiment: "bullish", reasoning: ["理由A", "理由B"],
    };
    let ctx = createContext({ type: "stock", code: "test" }, "task");
    ctx = addFinding(ctx, "target-step", "target-agent", targetAnalysis);

    const result = await executeCritique(
      { id: "crit1", type: "critique", targetStep: "target-step", reviewer: "reviewer1" },
      registry, ctx, { llm: fakeLLM }
    );

    expect(result.findings).toHaveLength(2); // original + critique
    const critique = result.findings[1];
    expect(critique.step).toBe("crit1");
    expect(critique.analysis.sentiment).toBe("bearish");
  });

  it("throws when target step has no findings", async () => {
    registry.register(makeAgent("r1"));
    const ctx = createContext({ type: "stock", code: "test" }, "task");
    await expect(
      executeCritique(
        { id: "c1", type: "critique", targetStep: "nonexistent", reviewer: "r1" },
        registry, ctx, { llm: fakeLLM }
      )
    ).rejects.toThrow("No findings from target step");
  });
});
