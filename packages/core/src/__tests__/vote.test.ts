import { describe, it, expect, beforeEach } from "vitest";
import { executeVote } from "../workflow/primitives/vote.js";
import { AgentRegistry } from "../agent/registry.js";
import { createContext } from "../workflow/context.js";
import { FakeChatModel } from "../llm/fake-model.js";
import type { BaseAgent, Analysis } from "../agent/types.js";
import type { ExecutionContext } from "../workflow/types.js";

function makeAgent(id: string, stance: "bullish" | "bearish" | "neutral"): BaseAgent {
  return {
    id, name: id, capabilities: ["voter"],
    personality: { stance },
    tools: [],
    analyze: async (_ctx: ExecutionContext): Promise<Analysis> => ({
      conclusion: `${id} votes ${stance}`, confidence: 0.6, sentiment: stance, reasoning: ["r"],
    }),
  };
}

describe("executeVote", () => {
  let registry: AgentRegistry;
  const fakeLLM = new FakeChatModel([
    { text: '{"conclusion":"看多","confidence":0.8,"sentiment":"bullish","reasoning":["好"]}' },
    { text: '{"conclusion":"看空","confidence":0.6,"sentiment":"bearish","reasoning":["差"]}' },
    { text: '{"conclusion":"观望","confidence":0.5,"sentiment":"neutral","reasoning":["不确定"]}' },
  ]);

  beforeEach(() => { registry = new AgentRegistry(); });

  it("collects votes from all matching agents", async () => {
    registry.register(makeAgent("v1", "bullish"));
    registry.register(makeAgent("v2", "bearish"));
    registry.register(makeAgent("v3", "neutral"));
    const ctx = createContext({ type: "stock", code: "test" }, "投票");

    const result = await executeVote(
      { id: "vote1", type: "vote", match: { capability: "voter" }, count: "all" },
      registry, ctx, { llm: fakeLLM }
    );

    expect(result.findings).toHaveLength(3);
    const sentiments = result.findings.map(f => f.analysis.sentiment);
    expect(sentiments).toContain("bullish");
    expect(sentiments).toContain("bearish");
    expect(sentiments).toContain("neutral");
  });
});
