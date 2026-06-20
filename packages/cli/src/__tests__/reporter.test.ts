import { describe, it, expect } from "vitest";
import { Reporter } from "../reporter.js";
import type { ExecutionContext } from "@agenttrade/core";

describe("Reporter", () => {
  it("can be instantiated", () => {
    const reporter = new Reporter();
    expect(reporter).toBeDefined();
  });

  it("startAnalysis does not throw", () => {
    const reporter = new Reporter();
    expect(() => reporter.startAnalysis({ type: "stock", code: "600519" }, "test")).not.toThrow();
  });

  it("renderReport handles empty context", () => {
    const reporter = new Reporter();
    const ctx: ExecutionContext = {
      target: { type: "stock", code: "000001" },
      task: "test",
      findings: [],
      debateRounds: [],
      workflowName: "test",
      startedAt: Date.now(),
    };
    expect(() => reporter.renderReport(ctx)).not.toThrow();
  });
});
