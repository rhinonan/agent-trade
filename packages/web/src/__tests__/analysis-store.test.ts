import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAnalysisStore } from "../stores/analysis.js";

describe("Analysis Store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should initialize with idle status", () => {
    const store = useAnalysisStore();
    expect(store.status).toBe("idle");
    expect(store.steps).toHaveLength(0);
    expect(store.logs).toHaveLength(0);
  });

  it("should handle analysis:start event", () => {
    const store = useAnalysisStore();
    store.handleStart({ target: { type: "stock", code: "600519", name: "贵州茅台" }, workflow: "bull-bear" });
    expect(store.status).toBe("running");
    expect(store.target?.code).toBe("600519");
    expect(store.logs.length).toBeGreaterThan(0);
  });

  it("should handle step:start and step:complete events", () => {
    const store = useAnalysisStore();
    store.handleStart({ target: { type: "stock", code: "600519" }, workflow: "bull-bear" });
    store.handleStepStart({ stepId: "bull-analysis", type: "analyze", agentIds: ["technical-bull"] });
    expect(store.steps).toHaveLength(1);
    expect(store.steps[0].status).toBe("running");

    store.handleStepComplete({
      stepId: "bull-analysis",
      findings: [{ agent: "technical-bull", conclusion: "看涨", sentiment: "bullish", confidence: 0.8 }],
    });
    expect(store.steps[0].status).toBe("complete");
    expect(store.logs.length).toBeGreaterThan(1);
  });

  it("should handle analysis:complete event", () => {
    const store = useAnalysisStore();
    store.handleStart({ target: { type: "stock", code: "600519" }, workflow: "bull-bear" });
    store.handleComplete({
      context: {
        target: { type: "stock", code: "600519", name: "茅台" },
        workflowName: "bull-bear",
        findings: [
          { step: "bull", agent: "bull", analysis: { conclusion: "看涨", sentiment: "bullish", confidence: 0.8, reasoning: [] } },
          { step: "bear", agent: "bear", analysis: { conclusion: "看跌", sentiment: "bearish", confidence: 0.6, reasoning: [] } },
        ],
        debateRounds: [],
      },
    });
    expect(store.status).toBe("complete");
    expect(store.report).not.toBeNull();
    expect(store.report!.sentiments.bullish).toBe(1);
    expect(store.report!.sentiments.bearish).toBe(1);
  });

  it("should handle analysis:error event", () => {
    const store = useAnalysisStore();
    store.handleError({ message: "Network error" });
    expect(store.status).toBe("error");
    expect(store.error).toBe("Network error");
  });

  it("should reset all state", () => {
    const store = useAnalysisStore();
    store.handleStart({ target: { type: "stock", code: "000001" }, workflow: "quick-scan" });
    store.reset();
    expect(store.status).toBe("idle");
    expect(store.steps).toHaveLength(0);
    expect(store.logs).toHaveLength(0);
    expect(store.report).toBeNull();
  });
});
