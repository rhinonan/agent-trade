import { describe, it, expect, beforeEach } from "vitest";
import { ChatPromptTemplate, SystemMessagePromptTemplate } from "@langchain/core/prompts";
import { getRoleLoader, resetRoleLoader } from "../../role-loader/loader.js";
import { runWorkflow } from "../runner.js";
import type { WorkflowYaml } from "../../role-loader/schema.js";
import { FakeToolCallingChatModel } from "../../llm/__tests__/test-utils.js";

/**
 * Pre-load a test agent into the singleton RoleLoader so that
 * ensureAgentsLoaded() (inside runWorkflow) sees agents already
 * present and skips the filesystem scan of roles/agents/.
 */
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

describe("runWorkflow", () => {
  beforeEach(() => {
    resetRoleLoader();
  });

  it("runs a single-node workflow end-to-end with a fake LLM", async () => {
    seedTestAgent("qa", "QATester");

    const wf: WorkflowYaml = {
      name: "qa-test",
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
        }),
      }),
    });

    // Findings are keyed by agent ID, not node ID (buildAgentNode uses compiled.id)
    expect(result.findings).toHaveProperty("qa");
    const askOutput = result.findings.qa as Record<string, unknown>;
    expect(askOutput.conclusion).toBe("买");
    expect(askOutput.confidence).toBe(0.87);
    expect(askOutput.sentiment).toBe("bullish");
    expect(result.stop_reason).toBe("");
  });

  it("passes callbacks for each node", async () => {
    seedTestAgent("t1", "T1");
    seedTestAgent("t2", "T2");

    const wf: WorkflowYaml = {
      name: "parallel-test",
      nodes: [
        {
          id: "a",
          agent: "t1",
          type: "standard" as const,
          prompt: "A",
          depends_on: [],
        },
        {
          id: "b",
          agent: "t2",
          type: "standard" as const,
          prompt: "B",
          depends_on: [],
        },
      ],
    };

    const starts: string[] = [];
    const ends: string[] = [];

    await runWorkflow(
      wf,
      "target",
      { llm: new FakeToolCallingChatModel({ response: "{}" }) },
      {
        onNodeStart: async (nodeId) => {
          starts.push(nodeId);
        },
        onNodeEnd: async (nodeId) => {
          ends.push(nodeId);
        },
      },
    );

    // Both nodes should have triggered start and end
    expect(starts.sort()).toEqual(["a", "b"]);
    expect(ends.sort()).toEqual(["a", "b"]);
  });

  it("throws when an agent referenced in the workflow is not loaded", async () => {
    // No agents seeded — runWorkflow will scan roles/agents/ if empty,
    // but the workflow references a non-existent agent id.
    // We seed a different agent so the loader is non-empty (skip scan)
    // but the workflow references an unknown one.
    seedTestAgent("known", "Known");

    const wf: WorkflowYaml = {
      name: "bad-wf",
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
