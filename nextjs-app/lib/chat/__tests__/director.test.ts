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

  it("vote step delegates to execPanel and invokes all agents", async () => {
    const invokedAgents: string[] = [];
    const voteMock = {
      invoke: vi.fn().mockImplementation(async (messages: any[]) => {
        const sysContent = typeof messages[0]?.content === "string" ? messages[0].content : "";
        const agentMatch = sysContent.match(/你是([a-zA-Z0-9_-]+)/);
        invokedAgents.push(agentMatch ? agentMatch[1] : "unknown");
        return {
          content: JSON.stringify({
            conclusion: "投票结论",
            confidence: 0.8,
            sentiment: "neutral",
            reasoning: ["r1"],
          }),
        };
      }),
    } as any;

    const voteDag: WorkflowDAG = {
      name: "vote-test",
      version: "1",
      steps: [
        {
          id: "vote-step",
          type: "vote",
          agent: [{ id: "voter1" }, { id: "voter2" }, { id: "voter3" }],
          prompt: "投票 {target}",
        },
      ],
    };

    const d = new Director(voteDag, { provider: "deepseek", llm: voteMock });
    const messages: PendingMessage[] = [];
    await d.advance(target, [], [], async (msg) => {
      messages.push(msg);
    });

    // All three agents should have been invoked
    expect(invokedAgents).toContain("voter1");
    expect(invokedAgents).toContain("voter2");
    expect(invokedAgents).toContain("voter3");
    // All should produce agent messages
    const agentMsgs = messages.filter((m) => m.role === "agent");
    expect(agentMsgs.length).toBe(3);
  });

  it("parallel step runs children concurrently", async () => {
    const order: string[] = [];
    const parallelMock = {
      invoke: vi.fn().mockImplementation(async (messages: any[]) => {
        const sysContent = typeof messages[0]?.content === "string" ? messages[0].content : "";
        const agentMatch = sysContent.match(/你是([a-zA-Z0-9_-]+)/);
        const agent = agentMatch ? agentMatch[1] : "unknown";
        // child1 adds a delay so that if run sequentially, it blocks child2
        if (agent === "child1") await new Promise((r) => setTimeout(r, 50));
        order.push(agent);
        return {
          content: JSON.stringify({
            conclusion: `${agent}结论`,
            confidence: 0.8,
            sentiment: "neutral",
            reasoning: ["r1"],
          }),
        };
      }),
    } as any;

    const parallelDag: WorkflowDAG = {
      name: "parallel-test",
      version: "1",
      steps: [
        {
          id: "parallel-root",
          type: "parallel",
          children: [
            { id: "child1-step", type: "analyze", agent: { id: "child1" }, prompt: "分析 {target}" },
            { id: "child2-step", type: "analyze", agent: { id: "child2" }, prompt: "分析 {target}" },
          ],
        },
      ],
    };

    const d = new Director(parallelDag, { provider: "deepseek", llm: parallelMock });
    await d.advance(target, [], [], async () => {});

    // Both children should have been invoked
    expect(order).toContain("child1");
    expect(order).toContain("child2");
    // With Promise.all, child2 (no delay) finishes before child1 (50ms delay)
    // If sequential, child1 would be first in the order
    expect(order[0]).toBe("child2");
  });

  it("debate step passes prior arguments to subsequent agents", async () => {
    const prompts: string[] = [];
    const debateMock = {
      invoke: vi.fn().mockImplementation(async (messages: any[]) => {
        const humanContent = typeof messages[1]?.content === "string" ? messages[1].content : "";
        prompts.push(humanContent);
        const sysContent = typeof messages[0]?.content === "string" ? messages[0].content : "";
        const agentMatch = sysContent.match(/你是([a-zA-Z0-9_-]+)/);
        const agent = agentMatch ? agentMatch[1] : "agent";
        return {
          content: JSON.stringify({
            conclusion: `${agent}-结论`,
            confidence: 0.7,
            sentiment: "bullish",
            reasoning: ["r"],
          }),
        };
      }),
    } as any;

    const debateDag: WorkflowDAG = {
      name: "debate-test",
      version: "1",
      steps: [
        {
          id: "debate-step",
          type: "debate",
          agent: [{ id: "agentA" }, { id: "agentB" }],
          maxRounds: 2,
          prompt: "辩论 {target}",
        },
      ],
    };

    const d = new Director(debateDag, { provider: "deepseek", llm: debateMock });
    await d.advance(target, [], [], async () => {});

    // 4 invocations: 2 rounds * 2 agents
    expect(prompts.length).toBe(4);

    // Round 0, agentA: no prior debate history
    expect(prompts[0]).not.toContain("对方观点");
    // Round 0, agentB: should see agentA's conclusion
    expect(prompts[1]).toContain("对方观点");
    expect(prompts[1]).toContain("agentA-结论");
    // Round 1, agentA: should see agentB's conclusion
    expect(prompts[2]).toContain("agentB-结论");
    // Round 1, agentB: should see both
    expect(prompts[3]).toContain("agentA-结论");
    expect(prompts[3]).toContain("agentB-结论");
  });
});
