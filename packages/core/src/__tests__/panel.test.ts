import { describe, it, expect, beforeEach } from "vitest";
import { executePanel } from "../workflow/primitives/panel.js";
import { AgentRegistry } from "../agent/registry.js";
import { createContext } from "../workflow/context.js";
import { FakeChatModel } from "../llm/fake-model.js";
import type { BaseAgent, Analysis } from "../agent/types.js";
import type { ExecutionContext } from "../workflow/types.js";

function makeAgent(id: string, caps: string[]): BaseAgent {
  return {
    id, name: id, capabilities: caps,
    personality: { stance: "neutral" },
    tools: [],
    analyze: async (_ctx: ExecutionContext): Promise<Analysis> => ({
      conclusion: `${id} concludes`, confidence: 0.7, sentiment: "neutral", reasoning: ["reason"],
    }),
  };
}

describe("executePanel", () => {
  let registry: AgentRegistry;
  const fakeLLM = new FakeChatModel([
    { text: '{"conclusion":"panel result","confidence":0.7,"sentiment":"neutral","reasoning":["ok"]}' },
    { text: '{"conclusion":"panel result2","confidence":0.6,"sentiment":"bullish","reasoning":["ok2"]}' },
  ]);

  beforeEach(() => { registry = new AgentRegistry(); });

  it("runs multiple agents in parallel", async () => {
    registry.register(makeAgent("a1", ["technical"]));
    registry.register(makeAgent("a2", ["technical"]));
    const ctx = createContext({ type: "stock", code: "test" }, "task");
    const result = await executePanel(
      { id: "p1", type: "panel", prompt: "分析", match: { capability: "technical" }, count: "all" },
      registry, ctx, { llm: fakeLLM }
    );
    expect(result.findings).toHaveLength(2);
  });

  it("respects count limit", async () => {
    registry.register(makeAgent("a1", ["analyst"]));
    registry.register(makeAgent("a2", ["analyst"]));
    registry.register(makeAgent("a3", ["analyst"]));
    const ctx = createContext({ type: "stock", code: "test" }, "task");
    const result = await executePanel(
      { id: "p1", type: "panel", prompt: "分析", match: { capability: "analyst" }, count: { min: 1, max: 2 } },
      registry, ctx, { llm: fakeLLM }
    );
    expect(result.findings.length).toBeLessThanOrEqual(2);
  });
});
