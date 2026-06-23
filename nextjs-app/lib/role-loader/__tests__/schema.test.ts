// nextjs-app/lib/role-loader/__tests__/schema.test.ts
import { describe, it, expect } from "vitest";
import { AgentYamlSchema, WorkflowYamlSchema } from "../schema.js";

const validAgent = {
  id: "test-agent",
  name: "测试分析师",
  system_prompt: "你是一个测试分析师。分析 {{target}}。",
  tools: ["kline"],
  output_schema: {
    conclusion: { type: "string", description: "结论" },
    confidence: { type: "number", min: 0, max: 1 },
  },
};

describe("AgentYamlSchema", () => {
  it("validates a minimal agent", () => {
    const result = AgentYamlSchema.safeParse({
      id: "minimal",
      name: "最小",
      system_prompt: "你好",
    });
    expect(result.success).toBe(true);
  });

  it("validates a full agent with tools and output_schema", () => {
    const result = AgentYamlSchema.safeParse(validAgent);
    expect(result.success).toBe(true);
  });

  it("rejects agent without id", () => {
    const result = AgentYamlSchema.safeParse({ name: "x", system_prompt: "y" });
    expect(result.success).toBe(false);
  });

  it("rejects agent with empty id", () => {
    const result = AgentYamlSchema.safeParse({ id: "", name: "x", system_prompt: "y" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid output_schema type", () => {
    const result = AgentYamlSchema.safeParse({
      ...validAgent,
      output_schema: { x: { type: "invalid_type" } },
    });
    expect(result.success).toBe(false);
  });
});

const validWorkflow = {
  name: "test-wf",
  nodes: [
    { id: "step1", agent: "test-agent", prompt: "分析 {{target}}" },
    { id: "step2", agent: "judge", depends_on: ["step1"], prompt: "综合" },
  ],
};

describe("WorkflowYamlSchema", () => {
  it("validates a simple linear workflow", () => {
    const result = WorkflowYamlSchema.safeParse(validWorkflow);
    expect(result.success).toBe(true);
  });

  it("rejects workflow with duplicate node ids", () => {
    const result = WorkflowYamlSchema.safeParse({
      name: "bad",
      nodes: [
        { id: "a", agent: "x", prompt: "1" },
        { id: "a", agent: "y", prompt: "2" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects depends_on referencing non-existent node", () => {
    const result = WorkflowYamlSchema.safeParse({
      name: "bad",
      nodes: [
        { id: "a", agent: "x", depends_on: ["nonexistent"], prompt: "1" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("validates debate workflow", () => {
    const debateWf = {
      name: "debate-wf",
      nodes: [
        { id: "init1", agent: "x", prompt: "start" },
        {
          id: "debate",
          type: "debate",
          depends_on: ["init1"],
          participants: [
            { agent: "x", role: "bull", first: true },
            { agent: "x", role: "bear" },
          ],
          max_rounds: 5,
          stop_when: { field: "yield", condition: "any" },
          prompt_template: "你是{{role}}方，第{{round}}轮",
        },
        { id: "judge", agent: "judge", depends_on: ["debate"], prompt: "裁决" },
      ],
    };
    const result = WorkflowYamlSchema.safeParse(debateWf);
    expect(result.success).toBe(true);
  });
});
