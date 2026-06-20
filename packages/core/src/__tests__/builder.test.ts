import { describe, it, expect } from "vitest";
import { defineWorkflow, analyze, parallel, critique, synthesize } from "../workflow/builder.js";

describe("Workflow Builder", () => {
  it("builds a simple workflow DAG", () => {
    const dag = defineWorkflow({ name: "test-wf", description: "A test workflow" })
      .step("step1", analyze({ agent: { id: "a1" }, prompt: "分析 {target}" }))
      .step("step2", synthesize({ agent: "judge", prompt: "总结" }))
      .build();

    expect(dag.name).toBe("test-wf");
    expect(dag.steps).toHaveLength(2);
    expect(dag.steps[0].id).toBe("step1");
    expect(dag.steps[0].type).toBe("analyze");
    expect(dag.steps[0].next).toEqual(["step2"]);
  });

  it("builds workflow with parallel composition", () => {
    const dag = defineWorkflow({ name: "parallel-test" })
      .step("multi", parallel([
        analyze({ agent: { id: "a1" }, prompt: "p1" }),
        analyze({ agent: { id: "a2" }, prompt: "p2" }),
      ]))
      .step("final", synthesize({ agent: "judge", prompt: "总结" }))
      .build();

    expect(dag.steps[0].type).toBe("parallel");
    expect(dag.steps[0].children).toHaveLength(2);
  });

  it("produces valid JSON DAG", () => {
    const dag = defineWorkflow({ name: "json-test" })
      .step("a", analyze({ agent: { id: "x" }, prompt: "test" }))
      .build();
    const json = JSON.stringify(dag);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("json-test");
    expect(parsed.steps).toHaveLength(1);
  });
});
