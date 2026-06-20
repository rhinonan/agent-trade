import { describe, it, expect, beforeEach } from "vitest";
import { executeAnalyze } from "../workflow/primitives/analyze.js";
import { AgentRegistry } from "../agent/registry.js";
import { createContext } from "../workflow/context.js";
import { FakeChatModel } from "../llm/fake-model.js";
import type { BaseAgent } from "../agent/types.js";
import type { ExecutionContext } from "../workflow/types.js";
import type { Analysis } from "../agent/types.js";

function makeAgent(overrides: Partial<BaseAgent> = {}): BaseAgent {
  return {
    id: "test-agent",
    name: "测试Agent",
    capabilities: ["test"],
    personality: { stance: "neutral" },
    tools: [],
    analyze: async (ctx: ExecutionContext): Promise<Analysis> => ({
      conclusion: "direct call",
      confidence: 0.6,
      sentiment: "neutral",
      reasoning: ["called directly"],
    }),
    ...overrides,
  };
}

describe("executeAnalyze", () => {
  let registry: AgentRegistry;

  beforeEach(() => { registry = new AgentRegistry(); });

  it("runs an agent and returns updated context", async () => {
    registry.register(makeAgent({ id: "a1" }));
    const ctx = createContext({ type: "stock", code: "600519", name: "茅台" }, "分析");
    const fakeLLM = new FakeChatModel([
      { text: '{"conclusion":"看多茅台","confidence":0.8,"sentiment":"bullish","reasoning":["趋势好","量能足"]}' },
    ]);

    const result = await executeAnalyze(
      { id: "step1", type: "analyze", prompt: "分析 {target}", agent: { id: "a1" } },
      registry, ctx, { llm: fakeLLM }
    );

    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0];
    expect(finding.step).toBe("step1");
    expect(finding.agent).toBe("a1");
    expect(finding.analysis.sentiment).toBe("bullish");
    expect(finding.analysis.confidence).toBe(0.8);
    expect(finding.analysis.reasoning).toHaveLength(2);
  });

  it("throws when no agent matches", async () => {
    const ctx = createContext({ type: "stock", code: "test" }, "task");
    await expect(
      executeAnalyze(
        { id: "s1", type: "analyze", prompt: "test", agent: { id: "nobody" } },
        registry, ctx, { llm: new FakeChatModel() }
      )
    ).rejects.toThrow("No agent found");
  });

  it("replaces {target} in prompt", async () => {
    registry.register(makeAgent({ id: "a1" }));
    const ctx = createContext({ type: "stock", code: "600519", name: "贵州茅台" }, "分析");
    const fakeLLM = new FakeChatModel([
      { text: '{"conclusion":"贵州茅台OK","confidence":0.7,"sentiment":"bullish","reasoning":["r1"]}' },
    ]);
    const result = await executeAnalyze(
      { id: "s1", type: "analyze", prompt: "请分析 {target}", agent: { id: "a1" } },
      registry, ctx, { llm: fakeLLM }
    );
    expect(result.findings[0].analysis.conclusion).toContain("茅台");
  });
});
