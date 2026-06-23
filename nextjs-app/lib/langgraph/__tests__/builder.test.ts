import { describe, it, expect } from "vitest";
import { StateGraph } from "@langchain/langgraph";
import { ChatPromptTemplate, SystemMessagePromptTemplate } from "@langchain/core/prompts";
import { RoleLoader } from "../../role-loader/loader.js";
import { buildStateGraph } from "../builder.js";
import type { WorkflowYaml } from "../../role-loader/schema.js";
import { FakeToolCallingChatModel } from "../../llm/__tests__/test-utils.js";

// A simple workflow: one node, no depends_on
const simpleWorkflow: WorkflowYaml = {
  name: "simple",
  nodes: [
    { id: "step1", agent: "tech", type: "standard" as const, prompt: "分析 {{target}}", depends_on: [] },
  ],
};

function makeLoader(): RoleLoader {
  const loader = new RoleLoader();
  // Register a minimal agent manually (skip YAML parsing)
  (loader as any).agents.set("tech", {
    id: "tech",
    name: "技术分析师",
    systemPrompt: ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate("你是技术分析师"),
    ]),
    tools: [],
    maxToolSteps: 3,
  });
  return loader;
}

function makeFakeLLMFactory(response: string) {
  return () => new FakeToolCallingChatModel({ response });
}

describe("buildStateGraph", () => {
  it("builds a StateGraph from a single-node workflow", () => {
    const loader = makeLoader();
    const graph = buildStateGraph(simpleWorkflow, loader, makeFakeLLMFactory(JSON.stringify({
      conclusion: "测试结论",
      confidence: 0.8,
      sentiment: "bullish",
    })));

    expect(graph).toBeInstanceOf(StateGraph);
  });

  it("builds a DAG with parallel nodes and a depends_on sink", () => {
    const wf: WorkflowYaml = {
      name: "parallel-test",
      nodes: [
        { id: "a", agent: "tech", type: "standard" as const, prompt: "A", depends_on: [] },
        { id: "b", agent: "tech", type: "standard" as const, prompt: "B", depends_on: [] },
        { id: "c", agent: "tech", type: "standard" as const, prompt: "C", depends_on: ["a", "b"] },
      ],
    };

    const loader = makeLoader();
    const graph = buildStateGraph(wf, loader, makeFakeLLMFactory("{}"));
    expect(graph).toBeInstanceOf(StateGraph);
  });

  it("throws on unknown agent reference", () => {
    const wf: WorkflowYaml = {
      name: "bad",
      nodes: [{ id: "x", agent: "nonexistent", type: "standard" as const, prompt: "X", depends_on: [] }],
    };
    const loader = new RoleLoader(); // Empty loader
    expect(() => buildStateGraph(wf, loader, makeFakeLLMFactory("{}"))).toThrow(/nonexistent/);
  });
});
