import { describe, it, expect, beforeEach } from "vitest";
import { WorkflowScheduler } from "../workflow/scheduler.js";
import { defineWorkflow, analyze, synthesize } from "../workflow/builder.js";
import { AgentRegistry } from "../agent/registry.js";
import { createContext } from "../workflow/context.js";
import { FakeChatModel } from "../llm/fake-model.js";
import type { BaseAgent, Analysis } from "../agent/types.js";
import type { ExecutionContext } from "../workflow/types.js";

function makeAgent(id: string, stance: "bullish" | "neutral" = "neutral"): BaseAgent {
  return {
    id, name: id, capabilities: ["analyst"],
    personality: { stance },
    tools: [],
    analyze: async (_ctx: ExecutionContext): Promise<Analysis> => ({
      conclusion: `${id} analysis`, confidence: 0.7, sentiment: stance, reasoning: ["ok"],
    }),
  };
}

describe("WorkflowScheduler", () => {
  let registry: AgentRegistry;
  let scheduler: WorkflowScheduler;

  beforeEach(() => {
    registry = new AgentRegistry();
    registry.register(makeAgent("analyst1", "bullish"));
    registry.register(makeAgent("judge1"));
    scheduler = new WorkflowScheduler(registry);
  });

  it("executes a simple 2-step workflow", async () => {
    const fakeLLM = new FakeChatModel([
      { text: '{"conclusion":"step1分析结果","confidence":0.8,"sentiment":"bullish","reasoning":["理由A"]}' },
      { text: '综合研判: 看多。\n```json\n{"conclusion":"最终看多","confidence":0.75,"sentiment":"bullish","reasoning":["核心理由"]}\n```' },
    ]);

    const dag = defineWorkflow({ name: "simple" })
      .step("analysis", analyze({ agent: { id: "analyst1" }, prompt: "分析 {target}" }))
      .step("final", synthesize({ agent: "judge1", prompt: "总结" }))
      .build();

    const ctx = createContext({ type: "stock", code: "600519", name: "茅台" }, "分析任务", "simple");
    const events: string[] = [];
    const result = await scheduler.execute(dag, ctx, { llm: fakeLLM }, {
      onStepStart: (id) => events.push(`start:${id}`),
      onStepComplete: (id) => events.push(`done:${id}`),
    });

    expect(result.findings).toHaveLength(2);
    expect(events).toContain("start:analysis");
    expect(events).toContain("done:final");
  });
});
