import { describe, it, expect } from "vitest";
import { createContext, addFinding, addDebateRound, getAgentFindings, getStepFindings, getLatestFinding } from "../workflow/context.js";
import type { Analysis } from "../agent/types.js";

const analysis: Analysis = { conclusion: "OK", confidence: 0.8, sentiment: "bullish", reasoning: ["r1"] };

describe("workflow context", () => {
  it("createContext initializes with target and empty findings", () => {
    const ctx = createContext({ type: "stock", code: "600519" }, "分析", "test-wf");
    expect(ctx.target.code).toBe("600519");
    expect(ctx.findings).toHaveLength(0);
    expect(ctx.workflowName).toBe("test-wf");
  });

  it("addFinding appends immutably", () => {
    const ctx = createContext({ type: "stock", code: "000001" }, "task", "wf");
    const ctx2 = addFinding(ctx, "step1", "agent1", analysis);
    expect(ctx.findings).toHaveLength(0); // original unchanged
    expect(ctx2.findings).toHaveLength(1);
    expect(ctx2.findings[0].step).toBe("step1");
  });

  it("getAgentFindings filters by agent", () => {
    let ctx = createContext({ type: "stock", code: "test" }, "task", "wf");
    ctx = addFinding(ctx, "s1", "agentA", analysis);
    ctx = addFinding(ctx, "s2", "agentB", analysis);
    expect(getAgentFindings(ctx, "agentA")).toHaveLength(1);
  });

  it("getStepFindings filters by step", () => {
    let ctx = createContext({ type: "stock", code: "test" }, "task", "wf");
    ctx = addFinding(ctx, "stepX", "agentA", analysis);
    ctx = addFinding(ctx, "stepX", "agentB", analysis);
    ctx = addFinding(ctx, "stepY", "agentC", analysis);
    expect(getStepFindings(ctx, "stepX")).toHaveLength(2);
  });

  it("getLatestFinding returns most recent", () => {
    let ctx = createContext({ type: "stock", code: "test" }, "task", "wf");
    expect(getLatestFinding(ctx)).toBeUndefined();
    ctx = addFinding(ctx, "s1", "a1", { ...analysis, conclusion: "first" });
    ctx = addFinding(ctx, "s2", "a2", { ...analysis, conclusion: "last" });
    expect(getLatestFinding(ctx)!.analysis.conclusion).toBe("last");
  });

  it("addDebateRound appends debate history", () => {
    let ctx = createContext({ type: "stock", code: "test" }, "task", "wf");
    ctx = addDebateRound(ctx, { round: 1, entries: [{ agent: "牛方", argument: "看多理由" }] });
    expect(ctx.debateRounds).toHaveLength(1);
    expect(ctx.debateRounds[0].round).toBe(1);
  });
});
