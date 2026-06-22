import { describe, it, expect } from "vitest";

describe("Bull-Bear Workflow", () => {
  it("should be importable and have correct structure", async () => {
    const { bullBearWorkflow } = await import("../bull-bear.js");

    expect(bullBearWorkflow.name).toBe("bull-bear");
    expect(bullBearWorkflow.version).toBe("1");
    expect(bullBearWorkflow.description).toContain("牛熊");

    // 4 top-level steps: bull-analysis, bear-analysis, cross-critique, final
    expect(bullBearWorkflow.steps).toHaveLength(4);

    const [bull, bear, cross, final] = bullBearWorkflow.steps;

    // Step 1: bull-analysis (analyze with bullish capability)
    expect(bull.id).toBe("bull-analysis");
    expect(bull.type).toBe("analyze");
    expect(bull.prompt).toContain("看多");
    expect(bull.agent).toEqual({ capability: "bullish" });
    expect(bull.next).toEqual(["bear-analysis"]);

    // Step 2: bear-analysis (analyze with bearish capability)
    expect(bear.id).toBe("bear-analysis");
    expect(bear.type).toBe("analyze");
    expect(bear.prompt).toContain("看空");
    expect(bear.agent).toEqual({ capability: "bearish" });
    expect(bear.next).toEqual(["cross-critique"]);

    // Step 3: cross-critique (parallel with 2 critiques)
    expect(cross.id).toBe("cross-critique");
    expect(cross.type).toBe("parallel");
    expect(cross.children).toHaveLength(2);
    expect(cross.children![0].id).toBe("cross-critique__child0");
    expect(cross.children![0].type).toBe("critique");
    expect((cross.children![0].agent as { id: string }).id).toBe("technical-bull");
    expect(cross.children![0].targetStep).toBe("bear-analysis");
    expect(cross.children![1].id).toBe("cross-critique__child1");
    expect(cross.children![1].type).toBe("critique");
    expect((cross.children![1].agent as { id: string }).id).toBe("technical-bear");
    expect(cross.children![1].targetStep).toBe("bull-analysis");
    // parallel steps are NOT auto-chained (builder skips parallel/sequential types)

    // Step 4: final (synthesize with judge agent)
    expect(final.id).toBe("final");
    expect(final.type).toBe("synthesize");
    expect(final.agent).toEqual({ id: "judge" });
    expect(final.prompt).toContain("{target}");
  });
});

describe("Quick-Scan Workflow", () => {
  it("should be importable and have correct structure", async () => {
    const { quickScanWorkflow } = await import("../quick-scan.js");

    expect(quickScanWorkflow.name).toBe("quick-scan");
    expect(quickScanWorkflow.version).toBe("1");
    expect(quickScanWorkflow.description).toContain("快速扫描");

    // 3 steps: tech (analyze), fundamental (analyze), final (synthesize)
    expect(quickScanWorkflow.steps).toHaveLength(3);

    const [tech, fundamental, final] = quickScanWorkflow.steps;

    // Step 1: tech (analyze with technical capability)
    expect(tech.id).toBe("tech");
    expect(tech.type).toBe("analyze");
    expect(tech.agent).toEqual({ capability: "technical" });
    expect(tech.prompt).toContain("{target}");
    expect(tech.next).toEqual(["fundamental"]);

    // Step 2: fundamental (analyze with fundamental capability)
    expect(fundamental.id).toBe("fundamental");
    expect(fundamental.type).toBe("analyze");
    expect(fundamental.agent).toEqual({ capability: "fundamental" });
    expect(fundamental.prompt).toContain("{target}");
    expect(fundamental.next).toEqual(["final"]);

    // Step 3: final (synthesize with judge agent)
    expect(final.id).toBe("final");
    expect(final.type).toBe("synthesize");
    expect(final.agent).toEqual({ id: "judge" });
    expect(final.prompt).toContain("{target}");
  });
});

describe("WORKFLOWS registry", () => {
  it("should export both workflows keyed by name", async () => {
    const { WORKFLOWS } = await import("../index.js");

    expect(WORKFLOWS).toHaveProperty("bull-bear");
    expect(WORKFLOWS).toHaveProperty("quick-scan");
    expect(Object.keys(WORKFLOWS)).toHaveLength(3);

    expect(WORKFLOWS["bull-bear"].name).toBe("bull-bear");
    expect(WORKFLOWS["quick-scan"].name).toBe("quick-scan");
  });
});
