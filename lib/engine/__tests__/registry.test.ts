import { describe, it, expect, beforeEach } from "vitest";
import { AgentRegistry } from "../registry.js";
import type { BaseAgent, ExecutionContext } from "../types.js";

function fakeAgent(overrides: Partial<BaseAgent> = {}): BaseAgent {
  return {
    id: "test-1",
    name: "Test Agent",
    capabilities: ["technical"],
    personality: { stance: "neutral" },
    tools: [],
    async analyze(_ctx: ExecutionContext) {
      return { conclusion: "OK", confidence: 0.5, sentiment: "neutral", reasoning: [] };
    },
    ...overrides,
  };
}

describe("AgentRegistry", () => {
  let registry: AgentRegistry;

  beforeEach(() => { registry = new AgentRegistry(); });

  it("registers and retrieves an agent", () => {
    registry.register(fakeAgent());
    expect(registry.get("test-1")!.name).toBe("Test Agent");
  });

  it("throws on duplicate registration", () => {
    registry.register(fakeAgent());
    expect(() => registry.register(fakeAgent())).toThrow("already registered");
  });

  it("lists all agents", () => {
    registry.register(fakeAgent({ id: "a" }));
    registry.register(fakeAgent({ id: "b" }));
    expect(registry.list()).toHaveLength(2);
  });

  it("matches by id", () => {
    registry.register(fakeAgent({ id: "my-id" }));
    const result = registry.match({ id: "my-id" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("my-id");
  });

  it("matches by capability", () => {
    registry.register(fakeAgent({ id: "tech", capabilities: ["technical"] }));
    registry.register(fakeAgent({ id: "fund", capabilities: ["fundamental"] }));
    const result = registry.match({ capability: "technical" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("tech");
  });

  it("excludes agents via 'not' filter", () => {
    registry.register(fakeAgent({ id: "tech", capabilities: ["technical"] }));
    registry.register(fakeAgent({ id: "fund", capabilities: ["fundamental"] }));
    const result = registry.match({ capability: "technical", not: ["fundamental"] });
    expect(result).toHaveLength(1);
  });

  it("returns empty array for unknown id", () => {
    expect(registry.match({ id: "nope" })).toHaveLength(0);
  });
});
