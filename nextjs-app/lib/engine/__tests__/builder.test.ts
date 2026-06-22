import { describe, it, expect } from "vitest";
import { defineWorkflow, analyze, critique, parallel, synthesize } from "../builder.js";

describe("WorkflowBuilder", () => {
  it("builds a simple linear workflow", () => {
    const dag = defineWorkflow({ name: "test-wf", description: "测试" })
      .step("step1", analyze({ agent: { capability: "tech" }, prompt: "分析" }))
      .step("step2", synthesize({ agent: "judge", prompt: "综合" }))
      .build();

    expect(dag.name).toBe("test-wf");
    expect(dag.description).toBe("测试");
    expect(dag.steps).toHaveLength(2);
    expect(dag.steps[0].type).toBe("analyze");
    expect(dag.steps[1].type).toBe("synthesize");
    // Auto-next chaining
    expect(dag.steps[0].next).toEqual(["step2"]);
  });

  it("builds a workflow with parallel steps", () => {
    const dag = defineWorkflow({ name: "parallel-test" })
      .step("bull", analyze({ agent: { capability: "bullish" }, prompt: "看多" }))
      .step("cross", parallel([
        critique({ reviewer: "bull", targetStep: "bear", prompt: "反驳" }),
        critique({ reviewer: "bear", targetStep: "bull", prompt: "反驳" }),
      ]))
      .step("final", synthesize({ agent: "judge", prompt: "裁决" }))
      .build();

    expect(dag.steps).toHaveLength(3);
    const parallelStep = dag.steps[1];
    expect(parallelStep.type).toBe("parallel");
    expect(parallelStep.children).toHaveLength(2);
    // Children get auto-assigned IDs
    expect(parallelStep.children![0].id).toBe("cross__child0");
  });

  it("build returns a deep clone (no mutation)", () => {
    const builder = defineWorkflow({ name: "clone-test" })
      .step("s1", analyze({ agent: { capability: "x" }, prompt: "p" }));
    const dag1 = builder.build();
    const dag2 = builder.build();
    dag2.name = "mutated";
    expect(dag1.name).toBe("clone-test");
  });
});
