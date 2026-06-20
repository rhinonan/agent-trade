import { describe, it, expect, beforeEach } from "vitest";
import { executeDebate } from "../workflow/primitives/debate.js";
import { AgentRegistry } from "../agent/registry.js";
import { createContext } from "../workflow/context.js";
import { FakeChatModel } from "../llm/fake-model.js";
import type { BaseAgent, Analysis } from "../agent/types.js";
import type { ExecutionContext } from "../workflow/types.js";

function makeAgent(id: string, stance: "bullish" | "bearish"): BaseAgent {
  return {
    id, name: id, capabilities: ["debater"],
    personality: { stance },
    tools: [],
    analyze: async (_ctx: ExecutionContext): Promise<Analysis> => ({
      conclusion: `${id} argument`, confidence: 0.7, sentiment: stance, reasoning: ["r"],
    }),
  };
}

describe("executeDebate", () => {
  let registry: AgentRegistry;
  const fakeLLM = new FakeChatModel([
    { text: '{"conclusion":"牛方: 看多理由A/B/C","confidence":0.8,"sentiment":"bullish","reasoning":["A","B","C"]}' },
    { text: '{"conclusion":"熊方: 反驳看多，风险X/Y","confidence":0.7,"sentiment":"bearish","reasoning":["X","Y"]}' },
    { text: '{"conclusion":"牛方回应: 风险X可控","confidence":0.75,"sentiment":"bullish","reasoning":["回应X"]}' },
    { text: '{"conclusion":"熊方最后: 坚持看空","confidence":0.7,"sentiment":"bearish","reasoning":["最终"]}' },
  ]);

  beforeEach(() => { registry = new AgentRegistry(); });

  it("runs structured multi-round debate", async () => {
    registry.register(makeAgent("bull-1", "bullish"));
    registry.register(makeAgent("bear-1", "bearish"));
    const ctx = createContext({ type: "stock", code: "600519" }, "辩论茅台走势", "debate-test");

    const result = await executeDebate(
      {
        id: "d1", type: "debate", maxRounds: 2, prompt: "辩论 {target} 短期走势",
        agent: [{ id: "bull-1" }, { id: "bear-1" }],
      },
      registry, ctx, { llm: fakeLLM }
    );

    // 2 rounds x 2 agents = 4 findings
    expect(result.findings).toHaveLength(4);
    // 2 debate rounds
    expect(result.debateRounds).toHaveLength(2);
    expect(result.debateRounds[0].entries).toHaveLength(2);
  });

  it("throws with fewer than 2 agents", async () => {
    registry.register(makeAgent("only-one", "bullish"));
    const ctx = createContext({ type: "stock", code: "test" }, "task");
    await expect(
      executeDebate({ id: "d1", type: "debate", agent: [{ id: "only-one" }] }, registry, ctx, { llm: fakeLLM })
    ).rejects.toThrow("at least 2 agents");
  });
});
