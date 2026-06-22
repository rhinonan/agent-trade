import { describe, it, expect } from "vitest";
import {
  createContext, addFinding, addDebateRound,
  getAgentFindings, getStepFindings, getLatestFinding,
} from "../context.js";

describe("ExecutionContext", () => {
  const target = { type: "stock" as const, code: "600519", name: "茅台" };

  it("creates an empty context", () => {
    const ctx = createContext(target, "分析茅台", "test-wf");
    expect(ctx.target.code).toBe("600519");
    expect(ctx.task).toBe("分析茅台");
    expect(ctx.findings).toHaveLength(0);
    expect(ctx.debateRounds).toHaveLength(0);
    expect(ctx.workflowName).toBe("test-wf");
  });

  it("addFinding returns new object (immutability)", () => {
    const ctx = createContext(target, "test");
    const ctx2 = addFinding(ctx, "step1", "agent1", {
      conclusion: "看涨", confidence: 0.9, sentiment: "bullish", reasoning: ["理由"],
    });
    expect(ctx.findings).toHaveLength(0); // original unchanged
    expect(ctx2.findings).toHaveLength(1);
    expect(ctx2.findings[0].step).toBe("step1");
  });

  it("addDebateRound returns new object", () => {
    const ctx = createContext(target, "test");
    const ctx2 = addDebateRound(ctx, {
      round: 1,
      entries: [{ agent: "bull", argument: "看多" }, { agent: "bear", argument: "看空" }],
    });
    expect(ctx.debateRounds).toHaveLength(0);
    expect(ctx2.debateRounds).toHaveLength(1);
  });

  it("getAgentFindings filters correctly", () => {
    let ctx = createContext(target, "test");
    ctx = addFinding(ctx, "s1", "agent-a", { conclusion: "a", confidence: 0.5, sentiment: "neutral", reasoning: [] });
    ctx = addFinding(ctx, "s2", "agent-b", { conclusion: "b", confidence: 0.5, sentiment: "neutral", reasoning: [] });
    expect(getAgentFindings(ctx, "agent-a")).toHaveLength(1);
    expect(getAgentFindings(ctx, "agent-c")).toHaveLength(0);
  });

  it("getStepFindings filters by step", () => {
    let ctx = createContext(target, "test");
    ctx = addFinding(ctx, "step-x", "a", { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] });
    expect(getStepFindings(ctx, "step-x")).toHaveLength(1);
    expect(getStepFindings(ctx, "step-y")).toHaveLength(0);
  });

  it("getLatestFinding returns last finding", () => {
    let ctx = createContext(target, "test");
    expect(getLatestFinding(ctx)).toBeUndefined();
    ctx = addFinding(ctx, "s1", "a", { conclusion: "first", confidence: 0.5, sentiment: "neutral", reasoning: [] });
    ctx = addFinding(ctx, "s2", "b", { conclusion: "last", confidence: 0.5, sentiment: "neutral", reasoning: [] });
    expect(getLatestFinding(ctx)!.analysis.conclusion).toBe("last");
  });
});
