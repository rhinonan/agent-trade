import { describe, it, expect, beforeEach } from "vitest";
import { ChatPromptTemplate, SystemMessagePromptTemplate } from "@langchain/core/prompts";
import { getRoleLoader, resetRoleLoader } from "@/lib/role-loader/loader.js";
import { runWorkflow } from "@/lib/langgraph/runner.js";
import type { WorkflowYaml } from "@/lib/role-loader/schema.js";
import { FakeToolCallingChatModel } from "@/lib/llm/__tests__/test-utils.js";

/** Pre-load a test agent into the singleton RoleLoader */
function seedTestAgent(id: string, name: string) {
  const loader = getRoleLoader();
  (loader as any).agents.set(id, {
    id,
    name,
    systemPrompt: ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(`你是${name}`),
    ]),
    tools: [],
    maxToolSteps: 3,
  });
}

describe("smoke test -- LangGraph engine pipeline", () => {
  beforeEach(() => {
    resetRoleLoader();
  });

  it("runs a single-node workflow end-to-end with a fake LLM", async () => {
    seedTestAgent("qa", "QATester");

    const wf: WorkflowYaml = {
      name: "qa-test",
      version: "1",
      nodes: [
        {
          id: "ask",
          agent: "qa",
          type: "standard" as const,
          prompt: "分析 {{target}}",
          depends_on: [],
        },
      ],
    };

    const result = await runWorkflow(wf, "000001", {
      llm: new FakeToolCallingChatModel({
        response: JSON.stringify({
          conclusion: "买",
          confidence: 0.87,
          sentiment: "bullish",
          reasoning: ["理由1", "理由2"],
        }),
      }),
    });

    expect(result.findings).toHaveProperty("qa");
    const askOutput = result.findings.qa as Record<string, unknown>;
    expect(askOutput.conclusion).toBe("买");
    expect(askOutput.confidence).toBe(0.87);
    expect(askOutput.sentiment).toBe("bullish");
    expect(result.stop_reason).toBe("");
  });

  it("runs a multi-node parallel workflow", async () => {
    seedTestAgent("t1", "T1");
    seedTestAgent("t2", "T2");
    seedTestAgent("judge", "裁判");

    const wf: WorkflowYaml = {
      name: "multi-test",
      version: "1",
      nodes: [
        {
          id: "a",
          agent: "t1",
          type: "standard" as const,
          prompt: "A分析 {{target}}",
          depends_on: [],
        },
        {
          id: "b",
          agent: "t2",
          type: "standard" as const,
          prompt: "B分析 {{target}}",
          depends_on: [],
        },
        {
          id: "final",
          agent: "judge",
          type: "standard" as const,
          prompt: "综合 {{target}}",
          depends_on: ["a", "b"],
        },
      ],
    };

    const result = await runWorkflow(wf, "600519", {
      llm: new FakeToolCallingChatModel({
        response: JSON.stringify({
          conclusion: "综合结论",
          confidence: 0.8,
          sentiment: "bullish",
        }),
      }),
    });

    // All three nodes should produce findings
    expect(result.findings).toHaveProperty("t1");
    expect(result.findings).toHaveProperty("t2");
    expect(result.findings).toHaveProperty("judge");
    expect(result.stop_reason).toBe("");
  });

  it("throws when an agent is not loaded", async () => {
    seedTestAgent("known", "Known");

    const wf: WorkflowYaml = {
      name: "bad-wf",
      version: "1",
      nodes: [
        {
          id: "x",
          agent: "ghost",
          type: "standard" as const,
          prompt: "X",
          depends_on: [],
        },
      ],
    };

    await expect(
      runWorkflow(wf, "target", {
        llm: new FakeToolCallingChatModel({ response: "{}" }),
      }),
    ).rejects.toThrow(/ghost/);
  });
});
