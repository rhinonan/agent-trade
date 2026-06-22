import { describe, it, expect, vi, beforeEach } from "vitest";
import { Director } from "../director.js";
import type { WorkflowDAG, AnalysisTarget } from "../../engine/types.js";
import type { PendingMessage } from "../types.js";

const miniDag: WorkflowDAG = {
  name: "test",
  version: "1",
  steps: [
    { id: "analysis-step1", type: "analyze", agent: { id: "technical-bull" }, prompt: "分析 {target}" },
    { id: "analysis-step2", type: "analyze", agent: { id: "technical-bear" }, prompt: "看空 {target}" },
  ],
};

const target: AnalysisTarget = { type: "stock", code: "s1", name: "测试标的" };

/** Mock LLM that returns valid JSON — no API key needed */
function mockLLM() {
  return {
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        conclusion: "测试结论",
        confidence: 0.8,
        sentiment: "bullish",
        reasoning: ["理由1", "理由2", "理由3"],
      }),
    }),
  } as any;
}

describe("Director", () => {
  let director: Director;

  beforeEach(() => {
    director = new Director(miniDag, { provider: "deepseek", llm: mockLLM() });
  });

  it("starts in RUNNING state", () => {
    expect(director.status).toBe("RUNNING");
  });

  it("advance() emits a system step-boundary message for the first step", async () => {
    const messages: PendingMessage[] = [];
    const result = await director.advance(target, [], [], async (msg) => {
      messages.push(msg);
    });
    expect(messages.length).toBeGreaterThanOrEqual(1);
    const systemMsg = messages.find((m) => m.role === "system");
    expect(systemMsg).toBeDefined();
    expect(systemMsg!.metadata?.type).toBe("step-boundary");
    expect(result.hasMore).toBe(true);
  });

  it("advance() emits agent analysis message alongside system boundary", async () => {
    const messages: PendingMessage[] = [];
    await director.advance(target, [], [], async (msg) => {
      messages.push(msg);
    });
    const agentMsgs = messages.filter((m) => m.role === "agent");
    expect(agentMsgs.length).toBeGreaterThanOrEqual(1);
    expect(agentMsgs[0].metadata?.type).toBe("analysis");
  });

  it("pause() changes status to PAUSED", () => {
    director.pause();
    expect(director.status).toBe("PAUSED");
  });

  it("resume() changes status back to RUNNING", () => {
    director.pause();
    director.resume();
    expect(director.status).toBe("RUNNING");
  });

  it("stop() changes status to STOPPED", () => {
    director.stop();
    expect(director.status).toBe("STOPPED");
  });

  it("returns hasMore=false after all steps exhausted", async () => {
    const messages: PendingMessage[] = [];
    let result = await director.advance(target, [], [], async (msg) => {
      messages.push(msg);
    });
    expect(result.hasMore).toBe(true);

    result = await director.advance(target, [], messages, async (msg) => {
      messages.push(msg);
    });
    expect(result.hasMore).toBe(false);
    expect(director.status).toBe("RUNNING"); // still running until next advance
  });

  it("advance() returns hasMore=false and STOPPED when called beyond last step", async () => {
    // exhaust all steps
    await director.advance(target, [], [], async () => {});
    await director.advance(target, [], [], async () => {});

    // now stepIndex === steps.length, next advance should stop
    const messages: PendingMessage[] = [];
    const result = await director.advance(target, [], [], async (msg) => {
      messages.push(msg);
    });
    expect(result.hasMore).toBe(false);
    expect(director.status).toBe("STOPPED");
    const doneMsg = messages.find((m) => m.content === "分析流程已完成");
    expect(doneMsg).toBeDefined();
  });

  it("advance() does nothing when PAUSED", async () => {
    director.pause();
    const messages: PendingMessage[] = [];
    const result = await director.advance(target, [], [], async (msg) => {
      messages.push(msg);
    });
    expect(result.hasMore).toBe(true); // still has steps, just paused
    expect(messages.length).toBe(0); // no messages emitted
  });

  it("advance() does nothing when STOPPED", async () => {
    director.stop();
    const messages: PendingMessage[] = [];
    const result = await director.advance(target, [], [], async (msg) => {
      messages.push(msg);
    });
    expect(result.hasMore).toBe(false);
    expect(messages.length).toBe(0);
  });

  it("emits layer boundary on layer transition", async () => {
    const layeredDag: WorkflowDAG = {
      name: "layered",
      version: "1",
      steps: [
        { id: "perception-1", type: "analyze", agent: { id: "agent1" }, prompt: "分析 {target}" },
        { id: "analysis-1", type: "analyze", agent: { id: "agent2" }, prompt: "分析 {target}" },
        { id: "decision-1", type: "synthesize", agent: { id: "agent3" }, prompt: "综合 {target}" },
        { id: "execution-1", type: "analyze", agent: { id: "agent4" }, prompt: "执行 {target}" },
      ],
    };
    const d = new Director(layeredDag, { provider: "deepseek", llm: mockLLM() });

    const allMessages: PendingMessage[] = [];
    const onMsg = async (msg: PendingMessage) => { allMessages.push(msg); };

    await d.advance(target, [], [], onMsg); // perception
    await d.advance(target, [], [], onMsg); // analysis
    await d.advance(target, [], [], onMsg); // decision
    await d.advance(target, [], [], onMsg); // execution

    const layerBoundaries = allMessages.filter(
      (m) => m.role === "system" && m.metadata?.type === "step-boundary" && m.metadata?.layer,
    );
    expect(layerBoundaries.length).toBe(4); // one per layer entry

    const layerNames = layerBoundaries.map((m) => m.metadata!.layer);
    expect(layerNames).toEqual(["perception", "analysis", "decision", "execution"]);

    const contentPatterns = layerBoundaries.map((m) => m.content);
    expect(contentPatterns[0]).toContain("数据感知层");
    expect(contentPatterns[1]).toContain("分析层");
    expect(contentPatterns[2]).toContain("决策层");
    expect(contentPatterns[3]).toContain("执行与风控层");
  });

  it("does not emit duplicate layer boundary for same layer", async () => {
    const sameLayerDag: WorkflowDAG = {
      name: "same",
      version: "1",
      steps: [
        { id: "analysis-1", type: "analyze", agent: { id: "agent1" }, prompt: "分析 {target}" },
        { id: "analysis-2", type: "analyze", agent: { id: "agent2" }, prompt: "分析 {target}" },
      ],
    };
    const d = new Director(sameLayerDag, { provider: "deepseek", llm: mockLLM() });

    const allMessages: PendingMessage[] = [];
    await d.advance(target, [], [], async (msg) => { allMessages.push(msg); });
    await d.advance(target, [], [], async (msg) => { allMessages.push(msg); });

    const layerBoundaries = allMessages.filter(
      (m) => m.role === "system" && m.metadata?.type === "step-boundary" && m.metadata?.layer,
    );
    expect(layerBoundaries.length).toBe(1); // only first step emits layer boundary
  });

  it("resume then advance works after pause", async () => {
    // advance first step
    await director.advance(target, [], [], async () => {});

    // pause and resume
    director.pause();
    expect(director.status).toBe("PAUSED");
    director.resume();
    expect(director.status).toBe("RUNNING");

    // advance second step
    const result = await director.advance(target, [], [], async () => {});
    expect(result.hasMore).toBe(false);
  });
});
