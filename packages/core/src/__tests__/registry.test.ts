import { describe, it, expect, beforeEach } from "vitest";
import { AgentRegistry } from "../agent/registry.js";
import type { BaseAgent } from "../agent/types.js";
import type { ExecutionContext } from "../workflow/types.js";

function makeMockAgent(overrides: Partial<BaseAgent> = {}): BaseAgent {
  return {
    id: "test-agent",
    name: "Test Agent",
    capabilities: ["test"],
    personality: { stance: "neutral" },
    tools: [],
    analyze: async (_ctx: ExecutionContext) => ({
      conclusion: "ok",
      confidence: 0.5,
      sentiment: "neutral",
      reasoning: ["reason"],
    }),
    ...overrides,
  };
}

describe("AgentRegistry", () => {
  let registry: AgentRegistry;

  beforeEach(() => { registry = new AgentRegistry(); });

  it("registers and retrieves an agent", () => {
    const agent = makeMockAgent({ id: "a1" });
    registry.register(agent);
    expect(registry.get("a1")).toBe(agent);
  });

  it("throws on duplicate id", () => {
    registry.register(makeMockAgent({ id: "a1" }));
    expect(() => registry.register(makeMockAgent({ id: "a1" }))).toThrow("already registered");
  });

  it("match by id returns exact agent", () => {
    registry.register(makeMockAgent({ id: "target" }));
    const result = registry.match({ id: "target" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("target");
  });

  it("match by capability filters correctly", () => {
    registry.register(makeMockAgent({ id: "a", capabilities: ["technical", "bullish"] }));
    registry.register(makeMockAgent({ id: "b", capabilities: ["fundamental"] }));
    registry.register(makeMockAgent({ id: "c", capabilities: ["technical"] }));
    const result = registry.match({ capability: "technical" });
    expect(result).toHaveLength(2);
  });

  it("match with not filters out excluded", () => {
    registry.register(makeMockAgent({ id: "a", capabilities: ["analyst"] }));
    registry.register(makeMockAgent({ id: "judge", capabilities: ["analyst", "judge"] }));
    const result = registry.match({ capability: "analyst", not: ["judge"] });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("match with count limits result size", () => {
    for (let i = 0; i < 5; i++) {
      registry.register(makeMockAgent({ id: `a${i}`, capabilities: ["analyst"] }));
    }
    expect(registry.match({ capability: "analyst" }, { min: 1, max: 3 })).toHaveLength(3);
    expect(registry.match({ capability: "analyst" }, "all")).toHaveLength(5);
  });
});
