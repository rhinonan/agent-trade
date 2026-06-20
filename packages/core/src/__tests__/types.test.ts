import { describe, it, expect } from "vitest";

describe("core types (compile-time check)", () => {
  it("TargetType is a string union", () => {
    const t: import("../types.js").TargetType = "stock";
    expect(t).toBe("stock");
  });

  it("Analysis requires conclusion, confidence, sentiment, reasoning", () => {
    const a: import("../agent/types.js").Analysis = {
      conclusion: "看多",
      confidence: 0.75,
      sentiment: "bullish",
      reasoning: ["理由1", "理由2"],
    };
    expect(a.confidence).toBeGreaterThan(0.5);
  });

  it("ExecutionContext is structured", () => {
    const ctx: import("../workflow/types.js").ExecutionContext = {
      target: { type: "stock", code: "600519" },
      task: "分析走势",
      findings: [],
      debateRounds: [],
      workflowName: "test",
      startedAt: Date.now(),
    };
    expect(ctx.target.code).toBe("600519");
  });
});
