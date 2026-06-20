import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../agent/registry.js";
import { loadAgents, registerInstances } from "../agent/loader.js";
import type { BaseAgent } from "../agent/types.js";
import type { ExecutionContext } from "../workflow/types.js";

class MockAnalyst implements BaseAgent {
  id = "analyst-1";
  name = "Analyst";
  capabilities = ["analysis", "fundamental"];
  personality = { stance: "neutral" as const };
  tools = [];
  async analyze(_ctx: ExecutionContext) {
    return { conclusion: "hold", confidence: 0.5, sentiment: "neutral" as const, reasoning: [] };
  }
}

class MockBear implements BaseAgent {
  id = "bear-1";
  name = "Bear";
  capabilities = ["bearish", "critique"];
  personality = { stance: "bearish" as const };
  tools = [];
  async analyze(_ctx: ExecutionContext) {
    return { conclusion: "sell", confidence: 0.6, sentiment: "bearish" as const, reasoning: [] };
  }
}

describe("loadAgents", () => {
  it("registers agents from constructor array", () => {
    const registry = new AgentRegistry();
    loadAgents(registry, [MockAnalyst, MockBear]);
    expect(registry.size).toBe(2);
    expect(registry.get("analyst-1")).toBeTruthy();
    expect(registry.get("bear-1")).toBeTruthy();
  });

  it("throws on duplicate class registration", () => {
    const registry = new AgentRegistry();
    loadAgents(registry, [MockAnalyst]);
    expect(() => loadAgents(registry, [MockAnalyst])).toThrow("already registered");
  });
});

describe("registerInstances", () => {
  it("registers pre-instantiated agents", () => {
    const registry = new AgentRegistry();
    const a1 = new MockAnalyst();
    const b1 = new MockBear();
    registerInstances(registry, [a1, b1]);
    expect(registry.size).toBe(2);
    expect(registry.get("analyst-1")).toBe(a1);
    expect(registry.get("bear-1")).toBe(b1);
  });
});
