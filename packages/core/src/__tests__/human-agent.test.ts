import { describe, it, expect, beforeEach } from "vitest";
import { HumanAgent, setHumanInputHandler } from "../agent/human-agent.js";
import type { ExecutionContext } from "../workflow/types.js";

const baseCtx: ExecutionContext = {
  target: { type: "stock", code: "600519", name: "贵州茅台" },
  task: "判断走势",
  findings: [
    {
      step: "bull",
      agent: "牛方Agent",
      analysis: { conclusion: "看多", confidence: 0.8, sentiment: "bullish", reasoning: ["趋势向好"] },
      timestamp: Date.now(),
    },
  ],
  debateRounds: [],
  workflowName: "test",
  startedAt: Date.now(),
};

describe("HumanAgent", () => {
  beforeEach(() => {
    setHumanInputHandler(async (req) => ({
      "观点": "看多，跟牛方一致",
      "置信度 (0-1)": "0.7",
      "理由": "牛方分析有道理，加上自己感觉",
    }));
  });

  it("returns Analysis from human input", async () => {
    const agent = new HumanAgent();
    const result = await agent.analyze(baseCtx);
    expect(result.sentiment).toBe("bullish");
    expect(result.confidence).toBe(0.7);
    expect(result.reasoning).toHaveLength(1);
  });

  it("throws if handler not set", async () => {
    setHumanInputHandler(null as any); // reset
    const agent = new HumanAgent();
    await expect(agent.analyze(baseCtx)).rejects.toThrow("HumanInputHandler not set");
  });
});
