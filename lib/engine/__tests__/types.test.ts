import { describe, it, expect } from "vitest";
import type { Analysis, ExecutionContext, Finding, WorkflowDAG } from "../types.js";

describe("types (compile-time verification)", () => {
  it("Analysis has required fields", () => {
    const analysis: Analysis = {
      conclusion: "买入",
      confidence: 0.85,
      sentiment: "bullish",
      reasoning: ["理由1", "理由2"],
    };
    expect(analysis.conclusion).toBe("买入");
    expect(analysis.confidence).toBeGreaterThan(0.5);
  });

  it("ExecutionContext is structurally correct", () => {
    const ctx: ExecutionContext = {
      target: { type: "stock", code: "600519", name: "贵州茅台" },
      task: "分析贵州茅台",
      findings: [],
      debateRounds: [],
      workflowName: "bull-bear",
      startedAt: Date.now(),
    };
    expect(ctx.target.type).toBe("stock");
    expect(ctx.findings).toHaveLength(0);
  });

  it("WorkflowDAG has steps", () => {
    const dag: WorkflowDAG = {
      name: "test",
      version: "1",
      steps: [{ id: "step1", type: "analyze", prompt: "测试" }],
    };
    expect(dag.steps).toHaveLength(1);
    expect(dag.steps[0].type).toBe("analyze");
  });
});
