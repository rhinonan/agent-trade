import { describe, it, expect } from "vitest";
import { TechnicalAnalystAgent } from "../technical-analyst/agent.js";
import { FinancialReportAgent } from "../financial-analyst/agent.js";
import { JudgeAgent } from "../judge/agent.js";

describe("Built-in Agents", () => {
  it("TechnicalAnalystAgent has correct capabilities", () => {
    const agent = new TechnicalAnalystAgent({ id: "tech-1", personality: { stance: "bullish" } });
    expect(agent.id).toBe("tech-1");
    expect(agent.capabilities).toContain("technical");
    expect(agent.capabilities).toContain("bullish");
    expect(agent.tools).toHaveLength(2);
    expect(agent.canCritique).toBe(true);
  });

  it("FinancialReportAgent has correct capabilities", () => {
    const agent = new FinancialReportAgent({ id: "fin-1", personality: { stance: "neutral" } });
    expect(agent.capabilities).toContain("fundamental");
    expect(agent.tools).toHaveLength(2);
  });

  it("JudgeAgent has neutral stance", () => {
    const agent = new JudgeAgent();
    expect(agent.id).toBe("judge");
    expect(agent.personality.stance).toBe("neutral");
    expect(agent.canDebate).toBe(false);
  });

  it("agents can be instantiated with different personas", () => {
    const bull = new TechnicalAnalystAgent({ id: "tech-bull", personality: { stance: "bullish" } });
    const bear = new TechnicalAnalystAgent({ id: "tech-bear", personality: { stance: "bearish" } });
    expect(bull.personality.stance).toBe("bullish");
    expect(bear.personality.stance).toBe("bearish");
    expect(bull.id).not.toBe(bear.id);
  });
});
