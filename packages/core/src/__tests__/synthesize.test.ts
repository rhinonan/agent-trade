import { describe, it, expect, beforeEach } from "vitest";
import { executeSynthesize } from "../workflow/primitives/synthesize.js";
import { AgentRegistry } from "../agent/registry.js";
import { createContext, addFinding, addDebateRound } from "../workflow/context.js";
import { FakeChatModel } from "../llm/fake-model.js";
import type { BaseAgent, Analysis } from "../agent/types.js";
import type { ExecutionContext } from "../workflow/types.js";

function makeJudge(): BaseAgent {
  return {
    id: "judge", name: "首席分析师", capabilities: ["judge", "synthesizer"],
    personality: { stance: "neutral" },
    tools: [],
    analyze: async (_ctx: ExecutionContext): Promise<Analysis> => ({
      conclusion: "judges", confidence: 0.7, sentiment: "neutral", reasoning: ["r"],
    }),
  };
}

describe("executeSynthesize", () => {
  let registry: AgentRegistry;
  const fakeLLM = new FakeChatModel([
    { text: '综合研判: 短期偏多。\n```json\n{"conclusion":"短期看多，建议关注","confidence":0.72,"sentiment":"bullish","reasoning":["MACD金叉","量价配合"]}\n```' },
  ]);

  beforeEach(() => { registry = new AgentRegistry(); registry.register(makeJudge()); });

  it("synthesizes all findings into final report", async () => {
    let ctx = createContext({ type: "stock", code: "600519" }, "最终研判");
    const a1: Analysis = { conclusion: "看多", confidence: 0.8, sentiment: "bullish", reasoning: ["理由1"] };
    const a2: Analysis = { conclusion: "看空", confidence: 0.65, sentiment: "bearish", reasoning: ["理由2"] };
    ctx = addFinding(ctx, "step1", "bull", a1);
    ctx = addFinding(ctx, "step2", "bear", a2);
    ctx = addDebateRound(ctx, { round: 1, entries: [{ agent: "bull", argument: "看多" }, { agent: "bear", argument: "看空" }] });

    const result = await executeSynthesize(
      { id: "final", type: "synthesize", agent: { id: "judge" } },
      registry, ctx, { llm: fakeLLM }
    );

    const finalFinding = result.findings.find(f => f.step === "final");
    expect(finalFinding).toBeDefined();
    expect(finalFinding!.analysis.sentiment).toBe("bullish");
    expect(finalFinding!.analysis.confidence).toBe(0.72);
    expect(finalFinding!.analysis.rawOutput).toContain("综合研判");
  });
});
