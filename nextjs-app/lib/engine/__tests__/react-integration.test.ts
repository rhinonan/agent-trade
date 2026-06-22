import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../registry.js";
import { createContext } from "../context.js";
import { executeAnalyze } from "../primitives/analyze.js";
import { executeSynthesize } from "../primitives/synthesize.js";
import { TechnicalAnalystAgent } from "../../agents/technical.js";
import { JudgeAgent } from "../../agents/judge.js";
import type { WorkflowStep } from "../types.js";

// Import prompt modules to trigger registration
import "../../prompt/technical.js";

function createFakeLLM(responses: string[]) {
  let idx = 0;
  return {
    bindTools() { return this; },
    async invoke(_msgs: unknown[]) {
      const content = responses[idx] ?? responses[responses.length - 1];
      idx++;
      // Check if this response should include a tool call
      if (content.startsWith("TOOL:")) {
        const toolName = content.split(":")[1];
        return {
          content: "需要调用工具",
          tool_calls: [{ id: `call_${idx}`, name: toolName, args: {} }],
        };
      }
      return { content };
    },
  };
}

describe("Bull-Bear Workflow with ReAct", () => {
  it("technical agent uses tools to fetch data, judge synthesizes", async () => {
    const registry = new AgentRegistry();

    // Register pilot agent (with tools) and judge (no tools)
    const bullTech = new TechnicalAnalystAgent({
      id: "technical-bull",
      personality: { stance: "bullish" },
    });
    const judge = new JudgeAgent();

    registry.register(bullTech);
    registry.register(judge);

    // Fake LLM: first call = tool call, second = final answer
    const fakeLLM = createFakeLLM([
      "TOOL:get-kline",  // step 1: request tool
      '{"conclusion":"技术面看涨，均线多头排列，MACD金叉","confidence":0.8,"sentiment":"bullish","reasoning":["均线多头排列","MACD金叉","放量突破"]}',
      // step 2: judge synthesis (no tools)
      '{"conclusion":"综合来看，技术面偏多，建议关注","confidence":0.75,"sentiment":"bullish","reasoning":["技术面信号积极","量价配合良好","短期趋势向上"]}',
    ]);

    // Step 1: Technical bull analysis with ReAct
    const ctx1 = createContext(
      { type: "stock", code: "600519", name: "茅台" },
      "分析茅台",
    );

    const bullStep: WorkflowStep = {
      id: "analysis-bull",
      type: "analyze",
      agent: { id: "technical-bull" },
      prompt: "从技术面看多 {target}",
    };

    const result1 = await executeAnalyze(bullStep, registry, ctx1, {
      llm: fakeLLM as any,
    }, { useReAct: true });

    expect(result1.findings).toHaveLength(1);
    expect(result1.findings[0].agent).toBe("technical-bull");
    expect(result1.findings[0].analysis.sentiment).toBe("bullish");

    // Step 2: Judge synthesis (no tools — uses legacy path)
    const synthStep: WorkflowStep = {
      id: "decision-synth",
      type: "synthesize",
      agent: { id: "judge" },
      prompt: "综合评判 {target}",
    };

    const result2 = await executeSynthesize(synthStep, registry, result1, {
      llm: fakeLLM as any,
    });

    expect(result2.findings).toHaveLength(2); // original finding + judge
    const judgeFinding = result2.findings[1];
    expect(judgeFinding.agent).toBe("judge");
    expect(judgeFinding.analysis.sentiment).toBe("bullish");
  });
});
