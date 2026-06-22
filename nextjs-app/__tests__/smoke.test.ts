import { describe, it, expect } from "vitest";
import {
  AgentRegistry,
  WorkflowScheduler,
  createContext,
  parseLLMJson,
  parseSentiment,
} from "@/lib/engine";
import { registerBuiltinAgents } from "@/lib/agents/index.js";
import { WORKFLOWS } from "@/lib/workflows/index.js";

// A minimal fake chat model that returns a pre-canned JSON analysis.
// The scheduler passes it via AnalyzeOptions.llm, and createLLM() returns it directly.
class SmokeModel {
  async invoke() {
    return {
      content: JSON.stringify({
        conclusion: "smoke test ok",
        confidence: 0.9,
        sentiment: "bullish",
        reasoning: ["测试理由1", "测试理由2"],
      }),
    };
  }
}

describe("smoke test -- full engine pipeline", () => {
  it("builds and executes bull-bear workflow", async () => {
    // 1. Register all built-in agents
    const registry = new AgentRegistry();
    registerBuiltinAgents(registry);
    expect(registry.size).toBeGreaterThanOrEqual(7);

    // 2. Grab the pre-built bull-bear DAG
    const dag = WORKFLOWS["bull-bear"];
    expect(dag).toBeDefined();
    expect(dag.steps.length).toBeGreaterThanOrEqual(3);

    // 3. Execute the workflow through the scheduler with a fake LLM
    const scheduler = new WorkflowScheduler(registry);
    const ctx = createContext(
      { type: "stock", code: "600519", name: "茅台" },
      "smoke test -- full pipeline",
      dag.name,
    );
    const result = await scheduler.execute(dag, ctx, {
      llm: new SmokeModel() as any,
    });

    // 4. Assert we got findings from the pipeline
    expect(result.findings.length).toBeGreaterThan(0);

    // Each finding should have the expected shape
    for (const f of result.findings) {
      expect(f).toHaveProperty("step");
      expect(f).toHaveProperty("agent");
      expect(f).toHaveProperty("analysis");
      expect(f.analysis).toHaveProperty("conclusion");
      expect(f.analysis).toHaveProperty("confidence");
      expect(f.analysis).toHaveProperty("sentiment");
      expect(f.analysis).toHaveProperty("reasoning");
      expect(typeof f.analysis.confidence).toBe("number");
    }
  });

  it("LLM parsers work correctly", () => {
    // JSON inside markdown fenced block
    expect(parseLLMJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });

    // JSON inside plain fenced block
    expect(parseLLMJson('```\n{"b":2}\n```')).toEqual({ b: 2 });

    // Raw JSON
    expect(parseLLMJson('{"c":3}')).toEqual({ c: 3 });

    // Invalid JSON throws (as expected)
    expect(() => parseLLMJson("not json at all")).toThrow();

    // Sentiment parsing
    expect(parseSentiment("bullish")).toBe("bullish");
    expect(parseSentiment("bearish")).toBe("bearish");
    expect(parseSentiment("neutral")).toBe("neutral");
    expect(parseSentiment("unknown")).toBe("neutral"); // default
    expect(parseSentiment(undefined)).toBe("neutral");
    expect(parseSentiment(null)).toBe("neutral");
  });
});
