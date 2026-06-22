import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../../engine/registry.js";
import { TechnicalAnalystAgent, JudgeAgent } from "../index.js";

describe("TechnicalAnalystAgent", () => {
  it("has required BaseAgent shape", () => {
    const agent = new TechnicalAnalystAgent({ id: "tech-1", personality: { stance: "bullish" } });
    expect(agent.id).toBe("tech-1");
    expect(agent.name).toBeDefined();
    expect(agent.capabilities).toContain("technical");
    expect(agent.personality.stance).toBe("bullish");
    expect(agent.canCritique).toBe(true);
    expect(agent.tools).toBeDefined();
  });
});

describe("JudgeAgent", () => {
  it("has neutral stance", () => {
    const agent = new JudgeAgent();
    expect(agent.id).toBe("judge");
    expect(agent.personality.stance).toBe("neutral");
    expect(agent.capabilities).toContain("judge");
  });
});

describe("registerBuiltinAgents", () => {
  it("registers all agents into registry", async () => {
    const { registerBuiltinAgents } = await import("../index.js");
    const registry = new AgentRegistry();
    registerBuiltinAgents(registry);
    expect(registry.size).toBeGreaterThanOrEqual(6);
    expect(registry.get("judge")).toBeDefined();
  });
});
