# Agent Kernel Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade agent execution from single-shot LLM calls to ReAct (Thought→Action→Observation) loops with real tool use and deepened financial-domain prompts. Phase 1 lays the foundation (zero behavior change), Phase 2 pilots with TechnicalAnalystAgent, Phase 3-4 rolls out and cleans up.

**Architecture:** Three new modules — `lib/tools/` (lightweight ToolDefinition + ToolContext, no LangChain dependency), `lib/prompt/` (composable AgentPrompt sections with three depth tiers), `lib/engine/react.ts` (ReAct loop core: loop over LLM calls, execute tools, emit events). Existing primitives and Director get a `useReAct` flag; when false (default), behavior is unchanged.

**Tech Stack:** TypeScript 5.x, LangChain.js (`@langchain/core` messages), existing `createLLM` factory, existing `DataClient`, vitest with fake `BaseChatModel` pattern.

## Global Constraints

- Phase 1 must produce zero behavior change — all 32 agents, all existing tests pass
- `BaseAgent` interface keeps `analyze()` method and widens `tools` type to `StructuredTool[] | ToolDefinition[]` during Phases 1-3
- No new npm dependencies (zod, etc.) — use `@langchain/core` `DynamicStructuredTool` only if needed for bindTools; prefer raw tool schema formatting
- Agents without tools exit ReAct in exactly 1 step (final answer immediately)
- Tool errors must be caught and formatted as `{"error": "...", "tool": "..."}` -> `ToolMessage`, never crash the loop
- All existing vitest tests must stay green throughout; existing fake LLM pattern (`{ invoke() { return { content: "..." } } }`) must not break

---

### Task 1: Add `forcedSummary` to `Analysis` type

**Files:**
- Modify: `nextjs-app/lib/engine/types.ts:22-27`

**Interfaces:**
- Produces: `Analysis.forcedSummary?: boolean` — optional field, backward-compatible, set to `true` when ReAct loop hits `maxSteps` and forces a summary

- [ ] **Step 1: Add the field**

In `nextjs-app/lib/engine/types.ts`, change the `Analysis` interface:

```typescript
// OLD (lines 22-27)
export interface Analysis {
  conclusion: string;
  confidence: number;   // 0–1
  sentiment: "bullish" | "bearish" | "neutral";
  reasoning: string[];
  rawOutput?: string;
}

// NEW
export interface Analysis {
  conclusion: string;
  confidence: number;   // 0–1
  sentiment: "bullish" | "bearish" | "neutral";
  reasoning: string[];
  rawOutput?: string;
  forcedSummary?: boolean;  // true when ReAct loop hit maxSteps and forced a summary
}
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `cd nextjs-app && npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All tests pass (optional field doesn't break anything)

- [ ] **Step 3: Commit**

```bash
git add nextjs-app/lib/engine/types.ts
git commit -m "feat: add forcedSummary field to Analysis type"
```

---

### Task 2: Create `ToolDefinition` and `ToolContext` types

**Files:**
- Create: `nextjs-app/lib/tools/types.ts`

**Interfaces:**
- Produces: `ToolDefinition` — lightweight tool descriptor with `name`, `description`, `parameters` (JSON Schema object), `execute(params, ctx)` async method
- Produces: `ToolContext` — injected context: `dataClient: DataClient`, `target: AnalysisTarget`, `executionState: ExecutionContext`, `signal: AbortSignal`
- Produces: `PropertySchema` — JSON Schema property descriptor for tool parameters

- [ ] **Step 1: Create `lib/tools/types.ts`**

```typescript
import type { AnalysisTarget, ExecutionContext } from "../engine/types.js";
import type { DataClient } from "../data/client.js";

// ——— JSON Schema subset for tool parameters ———

export interface PropertySchema {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: PropertySchema;
  default?: unknown;
}

// ——— Tool Definition ———

export interface ToolDefinition {
  /** Unique tool identifier, used in function calling (e.g. "get-kline") */
  name: string;
  /** Natural-language description the LLM uses to decide when to call this tool */
  description: string;
  /** JSON Schema for the tool's parameters (OpenAI function-calling format) */
  parameters: {
    type: "object";
    properties: Record<string, PropertySchema>;
    required: string[];
  };
  /**
   * Execute the tool.
   * @returns JSON-serializable result string (data, or error object)
   */
  execute(params: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

// ——— Tool Context (injected at execution time) ———

export interface ToolContext {
  dataClient: DataClient;
  target: AnalysisTarget;
  /** Read-only snapshot of current workflow state */
  executionState: ExecutionContext;
  signal: AbortSignal;
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd nextjs-app && npx tsc --noEmit --pretty 2>&1 | head -5`
Expected: No errors (new file with no consumers is fine)

- [ ] **Step 3: Commit**

```bash
git add nextjs-app/lib/tools/types.ts
git commit -m "feat: add ToolDefinition and ToolContext types"
```

---

### Task 3: Create `buildSystemPrompt()` and `AgentPrompt`

**Files:**
- Create: `nextjs-app/lib/prompt/builder.ts`

**Interfaces:**
- Produces: `AgentPrompt` — interface with `identity`, `expertise`, `stance`, `methodology`, `outputFormat` string fields (all optional except `identity` and `outputFormat`)
- Produces: `buildSystemPrompt(agent, context)` — composes prompt sections from `getPromptForAgent(agentId)` + auto-generated tool descriptions
- Produces: `getPromptForAgent(agentId)` — registry lookup; returns default prompt or agent-specific prompt module
- Produces: `registerPrompt(agentId, prompt)` — allows prompt modules to register themselves
- Produces: `defaultPrompt` — fallback prompt matching current behavior (identity + stance + JSON format)

- [ ] **Step 1: Create `lib/prompt/builder.ts`**

```typescript
import type { BaseAgent, ExecutionContext } from "../engine/types.js";
import type { ToolDefinition } from "../tools/types.js";

// ——— AgentPrompt ———

export interface AgentPrompt {
  identity: string;
  expertise?: string;
  stance?: string;
  methodology?: string;
  outputFormat: string;
}

// ——— Prompt Registry ———

const promptRegistry = new Map<string, AgentPrompt>();

export function registerPrompt(agentIdPrefix: string, prompt: AgentPrompt): void {
  promptRegistry.set(agentIdPrefix, prompt);
}

export function getPromptForAgent(agentId: string): AgentPrompt | undefined {
  // Try exact match first, then prefix match (e.g. "technical-bull" → "technical")
  if (promptRegistry.has(agentId)) return promptRegistry.get(agentId);
  for (const [prefix, prompt] of promptRegistry) {
    if (agentId.startsWith(prefix)) return prompt;
  }
  return undefined;
}

// ——— Default prompt (mirrors current behavior in analyze.ts / director.ts) ———

export const defaultPrompt: AgentPrompt = {
  identity: "你是一个专业的A股市场分析师。",
  outputFormat: `请用中文回复。输出JSON格式：
{"conclusion":"你的分析结论","confidence":0.0-1.0（置信度）,"sentiment":"bullish"|"bearish"|"neutral","reasoning":["论据1","论据2","论据3"]}`,
};

// ——— Builder ———

/**
 * Build the full system prompt for an agent by composing AgentPrompt sections.
 * If the agent has `systemPrompt` set (string or function), that takes priority.
 */
export function buildSystemPrompt(
  agent: BaseAgent,
  _context: ExecutionContext,
): string {
  // Agent-level override takes priority
  if (typeof agent.systemPrompt === "string") return agent.systemPrompt;
  if (typeof agent.systemPrompt === "function") return agent.systemPrompt(_context);

  // Look up registered prompt
  const prompt = getPromptForAgent(agent.id) ?? defaultPrompt;

  // Auto-generate tool descriptions from agent.tools
  const tools = agent.tools as ToolDefinition[];
  const toolDesc =
    tools.length > 0
      ? `\n你可以使用以下工具获取实时数据：\n${tools
          .map((t) => `- ${t.name}: ${t.description}`)
          .join("\n")}\n\n使用工具时，请用中文描述你需要什么数据。`
      : "";

  return [
    prompt.identity,
    prompt.expertise,
    prompt.stance,
    prompt.methodology,
    toolDesc,
    prompt.outputFormat,
  ]
    .filter(Boolean)
    .join("\n\n");
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd nextjs-app && npx tsc --noEmit --pretty 2>&1 | head -5`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add nextjs-app/lib/prompt/builder.ts
git commit -m "feat: add buildSystemPrompt and AgentPrompt registry"
```

---

### Task 4: Create `runReActLoop()` core

**Files:**
- Create: `nextjs-app/lib/engine/react.ts`

**Interfaces:**
- Consumes: `ToolDefinition`, `ToolContext` from `../tools/types.js`
- Consumes: `buildSystemPrompt` from `../prompt/builder.js`
- Consumes: `createLLM`, `AnalyzeOptions` from `../llm/create-llm.js`
- Consumes: `parseLLMJson`, `parseSentiment` from `../llm/parse.js`
- Consumes: `Analysis`, `BaseAgent`, `AnalysisTarget`, `ExecutionContext` from `./types.js`
- Produces: `ReActOptions` — input options type
- Produces: `ReActEvent` — discriminated union of events (thought, action, observation, final, forced_summary)
- Produces: `runReActLoop(options: ReActOptions): Promise<Analysis>` — the core loop

- [ ] **Step 1: Create `lib/engine/react.ts`**

```typescript
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Analysis, BaseAgent, AnalysisTarget, ExecutionContext } from "./types.js";
import type { ToolDefinition, ToolContext } from "../tools/types.js";
import type { DataClient } from "../data/client.js";
import { buildSystemPrompt } from "../prompt/builder.js";
import { createLLM, type AnalyzeOptions } from "../llm/create-llm.js";
import { parseLLMJson, parseSentiment } from "../llm/parse.js";

// ——— Types ———

export interface ReActOptions {
  agent: BaseAgent;
  context: ExecutionContext;
  prompt: string;
  target: AnalysisTarget;
  dataClient?: DataClient;
  maxSteps?: number;
  toolTimeout?: number;
  llmOptions?: AnalyzeOptions;
  onEvent?: (event: ReActEvent) => void;
  signal?: AbortSignal;
}

export type ReActEvent =
  | { type: "thought"; step: number; content: string }
  | { type: "action"; step: number; toolName: string; params: Record<string, unknown> }
  | { type: "observation"; step: number; toolName: string; result: string }
  | { type: "final"; step: number; analysis: Analysis }
  | { type: "forced_summary"; step: number; analysis: Analysis };

// ——— Tool schema formatting (OpenAI function-calling format) ———

interface OpenAIToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function formatToolSchemas(tools: ToolDefinition[]): OpenAIToolDef[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as Record<string, unknown>,
    },
  }));
}

// ——— Tool execution with timeout ———

async function executeWithTimeout(
  tool: ToolDefinition,
  params: Record<string, unknown>,
  ctx: ToolContext,
  timeoutMs: number,
): Promise<string> {
  try {
    const result = await Promise.race([
      tool.execute(params, ctx),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool ${tool.name} timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: message, tool: tool.name });
  }
}

// ——— LLM response helpers ———

interface ToolCallFromLLM {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

function extractToolCalls(response: { tool_calls?: ToolCallFromLLM[]; content?: string | unknown[] }): ToolCallFromLLM[] {
  if (response.tool_calls && response.tool_calls.length > 0) {
    return response.tool_calls;
  }
  // Some providers put tool calls in additional_kwargs
  const ak = (response as Record<string, unknown>).additional_kwargs as Record<string, unknown> | undefined;
  if (ak?.tool_calls && Array.isArray(ak.tool_calls) && ak.tool_calls.length > 0) {
    return (ak.tool_calls as Array<Record<string, unknown>>).map((tc) => ({
      name: (tc.function as Record<string, string>)?.name ?? "unknown",
      args: JSON.parse((tc.function as Record<string, string>)?.arguments ?? "{}"),
      id: tc.id as string | undefined,
    }));
  }
  return [];
}

function getTextContent(response: { content?: string | unknown[] }): string {
  if (typeof response.content === "string") return response.content;
  if (Array.isArray(response.content)) {
    const textBlocks = response.content.filter(
      (block): block is { type: "text"; text: string } =>
        (block as Record<string, unknown>).type === "text",
    );
    return textBlocks.map((b) => b.text).join("\n");
  }
  return "";
}

// ——— Parse final analysis from LLM text ———

function parseAnalysis(text: string): Analysis {
  try {
    const parsed = parseLLMJson(text) as Record<string, unknown>;
    return {
      conclusion: (parsed.conclusion as string) ?? text.slice(0, 200),
      confidence: Math.max(0, Math.min(1, (parsed.confidence as number) ?? 0.5)),
      sentiment: parseSentiment(parsed.sentiment),
      reasoning: Array.isArray(parsed.reasoning)
        ? (parsed.reasoning as string[])
        : [(parsed.reasoning as string) ?? text.slice(0, 100)],
      rawOutput: text,
    };
  } catch {
    return {
      conclusion: text.slice(0, 200),
      confidence: 0.5,
      sentiment: "neutral",
      reasoning: [text.slice(0, 100)],
      rawOutput: text,
    };
  }
}

// ——— Core Loop ———

export async function runReActLoop(options: ReActOptions): Promise<Analysis> {
  const {
    agent,
    context,
    prompt,
    target,
    dataClient,
    maxSteps = 5,
    toolTimeout = 10_000,
    llmOptions = {},
    onEvent,
    signal,
  } = options;

  const tools = (agent.tools as ToolDefinition[]) ?? [];
  const systemPrompt = buildSystemPrompt(agent, context);
  const llm: BaseChatModel = createLLM(llmOptions);

  // Build message history
  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(systemPrompt),
    new HumanMessage(formatHumanPrompt(prompt, context)),
  ];

  let step = 0;

  while (step < maxSteps) {
    // Check cancellation
    if (signal?.aborted) {
      throw new Error("ReAct loop cancelled");
    }

    step++;

    // Bind tools if agent has them
    const llmForStep = tools.length > 0
      ? llm.bindTools(formatToolSchemas(tools))
      : llm;

    // Invoke LLM
    const response = await llmForStep.invoke(messages);

    // Check for tool calls
    const toolCalls = extractToolCalls(response);

    if (toolCalls.length > 0) {
      // — Tool call path —
      const aiMsg = new AIMessage({
        content: getTextContent(response),
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id ?? `call_${step}_${tc.name}`,
          name: tc.name,
          args: tc.args,
        })),
      });
      messages.push(aiMsg);

      // Build tool context
      const toolCtx: ToolContext = {
        dataClient: dataClient ?? ({} as DataClient),
        target,
        executionState: context,
        signal: signal ?? new AbortController().signal,
      };

      // Execute each tool call sequentially
      for (const tc of toolCalls) {
        const tool = tools.find((t) => t.name === tc.name);
        if (!tool) {
          messages.push(
            new ToolMessage({
              content: JSON.stringify({ error: `Unknown tool: ${tc.name}`, tool: tc.name }),
              tool_call_id: tc.id ?? `call_${step}_${tc.name}`,
            }),
          );
          continue;
        }

        onEvent?.({ type: "action", step, toolName: tc.name, params: tc.args });

        const result = await executeWithTimeout(tool, tc.args, toolCtx, toolTimeout);

        onEvent?.({ type: "observation", step, toolName: tc.name, result });

        messages.push(
          new ToolMessage({
            content: result,
            tool_call_id: tc.id ?? `call_${step}_${tc.name}`,
          }),
        );
      }

      // Continue loop — LLM sees tool results and decides next action
      continue;
    }

    // — Final answer path (no tool calls) —
    const text = getTextContent(response);
    // Also check for raw content as AIMessage attribute
    const finalText = text || (typeof (response as Record<string, unknown>).content === "string"
      ? (response as Record<string, unknown>).content as string
      : "");

    onEvent?.({ type: "thought", step, content: finalText.slice(0, 500) });

    const analysis = parseAnalysis(finalText);

    // If we had tool calls in previous steps, include observation summary in reasoning
    if (step > 1 && tools.length > 0) {
      onEvent?.({ type: "final", step, analysis });
    } else {
      onEvent?.({ type: "final", step, analysis });
    }

    return analysis;
  }

  // — Max steps reached, force summary —
  const observationTexts = messages
    .filter((m) => m instanceof ToolMessage)
    .map((m) => (m as ToolMessage).content as string)
    .join("\n");

  const forcePrompt = `你已完成了${maxSteps}步分析。以下是所有工具返回的数据：\n\n${observationTexts || "无数据"}\n\n请基于以上数据给出最终分析结论。${systemPrompt}`;

  const forceMessages = [
    new SystemMessage(forcePrompt),
    new HumanMessage(`请给出对 ${target.name ?? target.code} 的最终分析结论`),
  ];

  const forceResponse = await llm.invoke(forceMessages);
  const forceText = getTextContent(forceResponse);
  const analysis = parseAnalysis(forceText);
  analysis.forcedSummary = true;

  onEvent?.({ type: "forced_summary", step, analysis });

  return analysis;
}

// ——— Helpers ———

function formatHumanPrompt(prompt: string, context: ExecutionContext): string {
  const parts = [prompt];
  const prevFindings = context.findings;
  if (prevFindings.length > 0) {
    parts.push("\n\n已有的分析结论（供参考）：");
    for (const f of prevFindings) {
      parts.push(`- [${f.agent}]: ${f.analysis.conclusion} (置信度: ${f.analysis.confidence})`);
    }
  }
  return parts.join("\n");
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd nextjs-app && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors (or fix any type issues — this is new code, no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add nextjs-app/lib/engine/react.ts
git commit -m "feat: add runReActLoop core with tool execution and event emission"
```

---

### Task 5: Unit tests for `runReActLoop()`

**Files:**
- Create: `nextjs-app/lib/engine/__tests__/react.test.ts`

**Interfaces:**
- Consumes: `runReActLoop`, `ReActOptions`, `ReActEvent` from `../react.js`
- Consumes: `createContext` from `../context.js`
- Consumes: Existing `fakeAgent()` pattern from `analyze.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { runReActLoop, type ReActEvent } from "../react.js";
import { createContext } from "../context.js";
import type { BaseAgent, ExecutionContext, Analysis, AnalysisTarget } from "../types.js";
import type { ToolDefinition, ToolContext } from "../../tools/types.js";
import { registerPrompt } from "../../prompt/builder.js";

// ——— Test helpers ———

const testTarget: AnalysisTarget = { type: "stock", code: "600519", name: "茅台" };

function fakeAgent(overrides: Partial<BaseAgent> = {}): BaseAgent {
  return {
    id: "test-agent",
    name: "Test Agent",
    capabilities: ["test"],
    personality: { stance: "neutral" },
    tools: [],
    async analyze(_ctx: ExecutionContext): Promise<Analysis> {
      return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
    },
    ...overrides,
  };
}

/** Create a fake tool that returns preset data */
function fakeTool(name: string, result: string): ToolDefinition {
  return {
    name,
    description: `Fake tool: ${name}`,
    parameters: {
      type: "object",
      properties: {
        param1: { type: "string", description: "A parameter" },
      },
      required: [],
    },
    async execute(_params, _ctx) {
      return result;
    },
  };
}

// ——— Tests ———

describe("runReActLoop", () => {
  // Ensure a default prompt is registered so buildSystemPrompt works
  beforeEach(() => {
    registerPrompt("test-agent", {
      identity: "你是一个测试分析师。",
      outputFormat: '输出JSON：{"conclusion":"...","confidence":0.5,"sentiment":"neutral","reasoning":[]}',
    });
  });

  it("returns analysis after single LLM call when agent has no tools", async () => {
    const agent = fakeAgent();
    const ctx = createContext(testTarget, "测试分析");

    const events: ReActEvent[] = [];
    const analysis = await runReActLoop({
      agent,
      context: ctx,
      prompt: "分析 {target}",
      target: testTarget,
      maxSteps: 5,
      llmOptions: {
        llm: {
          async invoke(_msgs: unknown[]) {
            return new AIMessage({
              content: '{"conclusion":"测试结论","confidence":0.8,"sentiment":"bullish","reasoning":["理由1"]}',
            });
          },
          bindTools: () => ({
            async invoke(_msgs: unknown[]) {
              return new AIMessage({
                content: '{"conclusion":"测试结论","confidence":0.8,"sentiment":"bullish","reasoning":["理由1"]}',
              });
            },
          }),
        } as any,
      },
      onEvent: (e) => events.push(e),
    });

    expect(analysis.conclusion).toBe("测试结论");
    expect(analysis.confidence).toBe(0.8);
    expect(analysis.sentiment).toBe("bullish");
    expect(analysis.reasoning).toEqual(["理由1"]);
    expect(analysis.forcedSummary).toBeUndefined();
    expect(events.length).toBeGreaterThanOrEqual(2); // thought + final
    expect(events[events.length - 1].type).toBe("final");
  });

  it("loops: tool call then final answer", async () => {
    const toolExecuted = vi.fn().mockResolvedValue('{"data": [1, 2, 3]}');
    const agent = fakeAgent({
      id: "test-agent",
      tools: [
        {
          name: "get-data",
          description: "获取数据",
          parameters: {
            type: "object",
            properties: { symbol: { type: "string", description: "股票代码" } },
            required: ["symbol"],
          },
          execute: toolExecuted,
        },
      ] as any,
    });

    const ctx = createContext(testTarget, "测试分析");

    // First call returns tool_call, second returns final answer
    let callCount = 0;
    const events: ReActEvent[] = [];

    const analysis = await runReActLoop({
      agent,
      context: ctx,
      prompt: "分析 {target}",
      target: testTarget,
      maxSteps: 5,
      llmOptions: {
        llm: {
          bindTools: () => ({
            async invoke(_msgs: unknown[]) {
              callCount++;
              if (callCount === 1) {
                // First call: request tool
                return new AIMessage({
                  content: "我需要获取数据",
                  tool_calls: [
                    {
                      id: "call_1",
                      name: "get-data",
                      args: { symbol: "600519" },
                    },
                  ],
                });
              }
              // Second call: final answer
              return new AIMessage({
                content:
                  '{"conclusion":"数据驱动的结论","confidence":0.9,"sentiment":"bullish","reasoning":["基于数据"]}',
              });
            },
          }),
        } as any,
      },
      onEvent: (e) => events.push(e),
    });

    expect(callCount).toBe(2);
    expect(toolExecuted).toHaveBeenCalledTimes(1);
    expect(toolExecuted).toHaveBeenCalledWith(
      { symbol: "600519" },
      expect.any(Object), // ToolContext
    );
    expect(analysis.conclusion).toBe("数据驱动的结论");
    expect(analysis.confidence).toBe(0.9);

    // Verify events
    const actions = events.filter((e) => e.type === "action");
    const observations = events.filter((e) => e.type === "observation");
    expect(actions.length).toBe(1);
    expect(actions[0]).toMatchObject({ type: "action", toolName: "get-data" });
    expect(observations.length).toBe(1);
    expect(observations[0]).toMatchObject({ type: "observation", toolName: "get-data" });
  });

  it("hits maxSteps and forces summary", async () => {
    const agent = fakeAgent({
      tools: [
        fakeTool("loop-tool", '{"result": "ok"}'),
      ] as any,
    });

    const ctx = createContext(testTarget, "测试分析");

    // Always return tool call — never give final answer
    const events: ReActEvent[] = [];

    const analysis = await runReActLoop({
      agent,
      context: ctx,
      prompt: "分析 {target}",
      target: testTarget,
      maxSteps: 2,
      llmOptions: {
        llm: {
          bindTools: () => ({
            async invoke(_msgs: unknown[]) {
              return new AIMessage({
                content: "需要更多数据",
                tool_calls: [
                  {
                    id: "call_loop",
                    name: "loop-tool",
                    args: { param1: "x" },
                  },
                ],
              });
            },
          }),
        } as any,
      },
      onEvent: (e) => events.push(e),
    });

    expect(analysis.forcedSummary).toBe(true);
    // Should have forced summary event
    const forcedEvent = events.find((e) => e.type === "forced_summary");
    expect(forcedEvent).toBeDefined();
  });

  it("tool error is caught and converted to ToolMessage (does not crash loop)", async () => {
    const failingTool: ToolDefinition = {
      name: "failing-tool",
      description: "这个工具总是出错",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      async execute(_params, _ctx) {
        throw new Error("数据库连接失败");
      },
    };

    const agent = fakeAgent({
      tools: [failingTool] as any,
    });

    const ctx = createContext(testTarget, "测试分析");

    let callCount = 0;
    const analysis = await runReActLoop({
      agent,
      context: ctx,
      prompt: "分析 {target}",
      target: testTarget,
      maxSteps: 5,
      llmOptions: {
        llm: {
          bindTools: () => ({
            async invoke(_msgs: unknown[]) {
              callCount++;
              if (callCount === 1) {
                return new AIMessage({
                  content: "调用工具",
                  tool_calls: [
                    { id: "call_fail", name: "failing-tool", args: {} },
                  ],
                });
              }
              return new AIMessage({
                content:
                  '{"conclusion":"工具失败后的结论","confidence":0.4,"sentiment":"neutral","reasoning":["工具出错"]}',
              });
            },
          }),
        } as any,
      },
    });

    // Loop should NOT crash — error becomes ToolMessage, LLM sees it and recovers
    expect(callCount).toBe(2);
    expect(analysis.conclusion).toBe("工具失败后的结论");
  });

  it("replaces {target} placeholder in prompt", async () => {
    const agent = fakeAgent();
    const ctx = createContext(testTarget, "测试");
    let capturedMessages: unknown[] = [];

    await runReActLoop({
      agent,
      context: ctx,
      prompt: "请分析股票 {target} 的走势",
      target: testTarget,
      llmOptions: {
        llm: {
          async invoke(msgs: unknown[]) {
            capturedMessages = msgs;
            return new AIMessage({
              content:
                '{"conclusion":"ok","confidence":0.5,"sentiment":"neutral","reasoning":[]}',
            });
          },
          bindTools: () => ({
            async invoke(msgs: unknown[]) {
              capturedMessages = msgs;
              return new AIMessage({
                content:
                  '{"conclusion":"ok","confidence":0.5,"sentiment":"neutral","reasoning":[]}',
              });
            },
          }),
        } as any,
      },
    });

    const humanMsg = capturedMessages.find((m) => m instanceof HumanMessage) as HumanMessage;
    expect(humanMsg).toBeDefined();
    const content = typeof humanMsg.content === "string" ? humanMsg.content : "";
    expect(content).toContain("茅台");
    expect(content).not.toContain("{target}");
  });

  it("respects AbortSignal", async () => {
    const agent = fakeAgent();
    const ctx = createContext(testTarget, "测试");
    const controller = new AbortController();
    controller.abort();

    await expect(
      runReActLoop({
        agent,
        context: ctx,
        prompt: "分析",
        target: testTarget,
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled");
  });
});
```

- [ ] **Step 2: Run tests and verify they pass**

Run: `cd nextjs-app && npx vitest run lib/engine/__tests__/react.test.ts --reporter=verbose`
Expected: 6 tests pass

- [ ] **Step 3: Verify all existing tests still pass**

Run: `cd nextjs-app && npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All existing tests green — `runReActLoop` is not called by any existing code yet

- [ ] **Step 4: Commit**

```bash
git add nextjs-app/lib/engine/__tests__/react.test.ts
git commit -m "test: add unit tests for runReActLoop"
```

---

**Phase 1 checkpoint:** Foundation is complete. `runReActLoop` exists and is tested, but no production code calls it. All 32 agents unchanged, all existing tests pass.

---

### Task 6: Create K-line and indicator tools

**Files:**
- Create: `nextjs-app/lib/tools/kline.ts`
- Create: `nextjs-app/lib/tools/indicator.ts`
- Create: `nextjs-app/lib/tools/index.ts`

**Interfaces:**
- Consumes: `ToolDefinition`, `ToolContext` from `./types.js`
- Consumes: `DataClient` from `../data/client.js`
- Consumes: `KlineBar`, `MACDItem`, `IndicatorsResponse` from `../data/types.js`
- Produces: `klineTool` — fetches daily K-line data for the target stock
- Produces: `macdTool` — computes MACD indicator via data service
- Produces: `rsiTool` — fetches RSI indicator via data service
- Produces: `maTool` — fetches moving averages via data service

- [ ] **Step 1: Create `lib/tools/kline.ts`**

```typescript
import type { ToolDefinition, ToolContext } from "./types.js";

export const klineTool: ToolDefinition = {
  name: "get-kline",
  description:
    "获取股票日K线数据，返回开盘价、收盘价、最高价、最低价、成交量。适用于分析趋势、形态和支撑阻力位。",
  parameters: {
    type: "object",
    properties: {
      count: {
        type: "number",
        description: "返回的K线条数，默认120条（约半年交易日）",
        default: 120,
      },
      period: {
        type: "string",
        description: "K线周期",
        enum: ["daily", "weekly", "monthly"],
        default: "daily",
      },
    },
    required: [],
  },
  async execute(params, ctx) {
    const count = (params.count as number) ?? 120;
    const period = ((params.period as string) ?? "daily") as
      | "daily"
      | "weekly"
      | "monthly";
    const res = await ctx.dataClient.kline.get({
      symbol: ctx.target.code,
      period,
      count,
    });
    // Return a concise summary — full bars would be too large for context
    const recent = res.bars.slice(-20);
    const summary = {
      symbol: res.symbol,
      period: res.period,
      totalBars: res.bars.length,
      recent20Bars: recent.map((b) => ({
        date: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      })),
      latest: recent.length > 0
        ? {
            date: recent[recent.length - 1].date,
            close: recent[recent.length - 1].close,
            volume: recent[recent.length - 1].volume,
          }
        : null,
    };
    return JSON.stringify(summary);
  },
};
```

- [ ] **Step 2: Create `lib/tools/indicator.ts`**

```typescript
import type { ToolDefinition, ToolContext } from "./types.js";

export const macdTool: ToolDefinition = {
  name: "calc-macd",
  description:
    "计算MACD指标，返回DIF、DEA和柱状值(MACD histogram)。用于判断趋势方向、金叉死叉信号和背离。",
  parameters: {
    type: "object",
    properties: {
      fast: { type: "number", description: "快线EMA周期，默认12", default: 12 },
      slow: { type: "number", description: "慢线EMA周期，默认26", default: 26 },
      signal: { type: "number", description: "信号线EMA周期，默认9", default: 9 },
    },
    required: [],
  },
  async execute(params, ctx) {
    const res = await ctx.dataClient.kline.indicators({
      symbol: ctx.target.code,
      names: ["MACD"],
      count: 120,
    });
    const macdData = res.indicators?.macd ?? [];
    // Return recent 50 items + key signals
    const recent = macdData.slice(-50);
    const latest = recent.length > 0 ? recent[recent.length - 1] : null;
    const prev = recent.length > 1 ? recent[recent.length - 2] : null;

    let signal = "neutral";
    if (latest && prev) {
      // Check for golden cross (DIF crosses above DEA)
      if (
        prev.dif != null && prev.dea != null &&
        latest.dif != null && latest.dea != null
      ) {
        if (prev.dif <= prev.dea && latest.dif > latest.dea) signal = "golden_cross";
        else if (prev.dif >= prev.dea && latest.dif < latest.dea) signal = "death_cross";
      }
    }

    return JSON.stringify({
      symbol: ctx.target.code,
      signal,
      latest: latest
        ? { dif: latest.dif, dea: latest.dea, histogram: latest.histogram }
        : null,
      recent50: recent.map((item) => ({
        dif: item.dif,
        dea: item.dea,
        histogram: item.histogram,
      })),
    });
  },
};

export const rsiTool: ToolDefinition = {
  name: "calc-rsi",
  description:
    "计算RSI相对强弱指标(14日)，返回数值序列。RSI>70为超买，RSI<30为超卖。",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.kline.indicators({
      symbol: ctx.target.code,
      names: ["RSI"],
      count: 120,
    });
    const rsiData = (res.indicators?.rsi ?? []).filter(
      (v): v is number => v != null,
    );
    const latest = rsiData.length > 0 ? rsiData[rsiData.length - 1] : null;
    const recent20 = rsiData.slice(-20);

    let zone = "neutral";
    if (latest != null) {
      if (latest > 70) zone = "overbought";
      else if (latest < 30) zone = "oversold";
    }

    return JSON.stringify({
      symbol: ctx.target.code,
      latest,
      zone,
      recent20,
    });
  },
};

export const maTool: ToolDefinition = {
  name: "calc-ma",
  description:
    "计算移动平均线(MA)，返回5/10/20/60日均线值。用于判断趋势方向和均线排列(多头/空头排列)。",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.kline.indicators({
      symbol: ctx.target.code,
      names: ["MA"],
      count: 120,
    });
    const maData = res.indicators?.ma ?? {};
    // Get latest values for each MA period
    const latest: Record<string, number | null> = {};
    for (const [period, values] of Object.entries(maData)) {
      const arr = values.filter((v): v is number => v != null);
      latest[period] = arr.length > 0 ? arr[arr.length - 1] : null;
    }

    // Determine alignment
    const periods = ["5", "10", "20", "60"];
    const alignmentValues = periods.map((p) => latest[p]).filter((v): v is number => v != null);
    let alignment = "unknown";
    if (alignmentValues.length >= 3) {
      const sorted = [...alignmentValues].sort((a, b) => b - a);
      if (JSON.stringify(alignmentValues) === JSON.stringify(sorted)) {
        alignment = "bullish_alignment";
      } else if (
        JSON.stringify(alignmentValues) ===
        JSON.stringify([...alignmentValues].sort((a, b) => a - b))
      ) {
        alignment = "bearish_alignment";
      }
    }

    return JSON.stringify({
      symbol: ctx.target.code,
      latest,
      alignment,
    });
  },
};
```

- [ ] **Step 3: Create `lib/tools/index.ts`**

```typescript
export { klineTool } from "./kline.js";
export { macdTool, rsiTool, maTool } from "./indicator.js";
export type { ToolDefinition, ToolContext, PropertySchema } from "./types.js";
```

- [ ] **Step 4: Write unit tests for tools**

Create `nextjs-app/lib/tools/__tests__/tools.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { klineTool } from "../kline.js";
import { macdTool, rsiTool, maTool } from "../indicator.js";
import type { ToolContext } from "../types.js";
import type { DataClient } from "../../data/client.js";

function mockCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    dataClient: {
      kline: {
        get: vi.fn().mockResolvedValue({
          symbol: "600519",
          period: "daily",
          adjust: "qfq",
          count: 120,
          bars: [
            { date: "2026-06-22", open: 1700, high: 1720, low: 1690, close: 1715, volume: 5000000 },
            { date: "2026-06-19", open: 1690, high: 1710, low: 1685, close: 1700, volume: 4500000 },
          ],
        }),
        indicators: vi.fn().mockResolvedValue({
          symbol: "600519",
          indicators: {
            macd: [
              { index: 0, dif: 5.2, dea: 4.8, histogram: 0.4 },
              { index: 1, dif: 6.1, dea: 5.1, histogram: 1.0 },
            ],
            rsi: [55, 58, 62, 60],
            ma: { "5": [1700, 1705], "10": [1690, 1695], "20": [1680, 1685] },
          },
        }),
      },
    } as unknown as DataClient,
    target: { type: "stock", code: "600519", name: "茅台" },
    executionState: {
      target: { type: "stock", code: "600519", name: "茅台" },
      task: "test",
      findings: [],
      debateRounds: [],
      workflowName: "test",
      startedAt: Date.now(),
    },
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("klineTool", () => {
  it("fetches and summarizes K-line data", async () => {
    const ctx = mockCtx();
    const result = await klineTool.execute({ count: 20 }, ctx);
    const parsed = JSON.parse(result);
    expect(parsed.symbol).toBe("600519");
    expect(parsed.recent20Bars).toHaveLength(2);
    expect(parsed.latest.close).toBe(1715);
  });

  it("uses default count of 120 when not specified", async () => {
    const ctx = mockCtx();
    await klineTool.execute({}, ctx);
    expect(ctx.dataClient.kline.get).toHaveBeenCalledWith(
      expect.objectContaining({ count: 120 }),
    );
  });
});

describe("macdTool", () => {
  it("returns MACD data with signal detection", async () => {
    const ctx = mockCtx();
    const result = await macdTool.execute({}, ctx);
    const parsed = JSON.parse(result);
    expect(parsed.symbol).toBe("600519");
    expect(parsed.latest.dif).toBe(6.1);
    expect(parsed.signal).toBeDefined();
  });
});

describe("rsiTool", () => {
  it("returns RSI data with zone classification", async () => {
    const ctx = mockCtx();
    const result = await rsiTool.execute({}, ctx);
    const parsed = JSON.parse(result);
    expect(parsed.latest).toBe(60);
    expect(parsed.zone).toBe("neutral");
  });
});

describe("maTool", () => {
  it("returns MA data with alignment detection", async () => {
    const ctx = mockCtx();
    const result = await maTool.execute({}, ctx);
    const parsed = JSON.parse(result);
    expect(parsed.latest).toBeDefined();
    expect(parsed.alignment).toBeDefined();
  });
});
```

- [ ] **Step 5: Run tool tests**

Run: `cd nextjs-app && npx vitest run lib/tools/__tests__/tools.test.ts --reporter=verbose`
Expected: 5 tests pass

- [ ] **Step 6: Commit**

```bash
git add nextjs-app/lib/tools/kline.ts nextjs-app/lib/tools/indicator.ts nextjs-app/lib/tools/index.ts nextjs-app/lib/tools/__tests__/tools.test.ts
git commit -m "feat: add K-line, MACD, RSI, and MA tools for technical analysis"
```

---

### Task 7: Create technical analyst prompt module

**Files:**
- Create: `nextjs-app/lib/prompt/technical.ts`

**Interfaces:**
- Consumes: `registerPrompt`, `AgentPrompt` from `./builder.js`
- Produces: Side-effect — registers "technical" prompt with the builder registry

- [ ] **Step 1: Create `lib/prompt/technical.ts`**

```typescript
import { registerPrompt, type AgentPrompt } from "./builder.js";

// ——— Technical Analysis Agent Prompt (Standard tier, ~800 tokens) ———

const technicalBullPrompt: AgentPrompt = {
  identity:
    "你是一位资深的技术面分析师，拥有15年A股实战经验。你擅长从K线图、技术指标、量价关系中发掘做多机会。你的分析风格冷静、严谨、基于数据，但整体偏乐观——你相信市场趋势的力量，擅长识别趋势启动的早期信号。",
  expertise: `## 你的核心能力

1. **趋势分析**：你精通道氏理论，懂得从大周期到小周期逐级确认趋势方向。上升趋势=高点和低点不断抬高，下跌趋势反之。
2. **形态识别**：你能识别经典反转形态（头肩顶/底、双顶/底、圆弧顶/底）、持续形态（旗形、三角形、矩形），并评估形态的可靠性。
3. **量价分析**：你深谙"量在价先"的A股规律——放量突破是有效信号，缩量上涨需警惕，放量滞涨是顶部信号。
4. **指标运用**：你熟练使用MACD（金叉/死叉/背离）、RSI（超买超卖/背离）、均线系统（多头排列/空头排列/金叉死叉）、布林带（收窄放量突破），但从不依赖单一指标。
5. **支撑阻力**：你能从前期高/低点、整数关口、均线位置、筹码密集区识别关键的支撑和阻力位。`,
  stance: `## 你的立场（看多）

作为一名多头技术分析师，你倾向于：
- 寻找趋势反转和趋势延续的做多信号
- 关注支撑位的买入机会
- 重视量价配合的突破信号
- 但你不是盲目唱多——如果技术面确实偏空，你会诚实指出风险`,
  methodology: `## 你的分析框架

请按以下步骤进行技术分析：
1. **大趋势判断**（日线/周线级别）：当前处于上升趋势、下降趋势还是震荡？趋势的强度和持续性如何？
2. **中期信号识别**（日线级别）：最近的K线形态、MACD状态、均线排列释放了什么信号？
3. **量价验证**：近期的价格变动是否有成交量配合？是否存在量价背离？
4. **关键位分析**：当前价格距离最近的支撑位和阻力位各有多远？突破哪一个更有可能？
5. **综合研判**：综合以上因素，给出你的多空判断、置信度和3条核心理由。`,
  outputFormat: `## 输出格式

请严格按以下JSON格式输出，使用中文：
{"conclusion":"综合技术面分析结论（2-3句话）","confidence":0.0-1.0,"sentiment":"bullish"|"bearish"|"neutral","reasoning":["论据1","论据2","论据3"]}

- conclusion: 你的核心判断，包含关键的技术信号
- confidence: 你对判断的信心，0.0=完全不确定，1.0=极度确定
- sentiment: bullish=看多，bearish=看空，neutral=中性
- reasoning: 3条具体的技术面理由，每条应包含具体指标数值或形态描述`,
};

const technicalBearPrompt: AgentPrompt = {
  ...technicalBullPrompt,
  stance: `## 你的立场（看空）

作为一名空头技术分析师，你倾向于：
- 寻找趋势走弱和见顶的做空信号
- 关注阻力位的卖出机会
- 重视量价背离和高位放量滞涨的风险信号
- 但你不是盲目唱空——如果技术面确实强势，你会承认上涨趋势`,
};

const technicalNeutralPrompt: AgentPrompt = {
  ...technicalBullPrompt,
  stance: `## 你的立场（中性）

作为一名客观的技术分析师，你：
- 同时关注做多和做空信号，不预设立场
- 评估多空双方的力量对比
- 给出最客观的技术面判断`,
};

// ——— Register prompts ———
// All technical-* agents match the "technical" prefix

registerPrompt("technical", technicalBullPrompt); // fallback for any technical-* agent
registerPrompt("technical-bull", technicalBullPrompt);
registerPrompt("technical-bear", technicalBearPrompt);
registerPrompt("technical-neutral", technicalNeutralPrompt);

export { technicalBullPrompt, technicalBearPrompt, technicalNeutralPrompt };
```

- [ ] **Step 2: Verify compilation**

Run: `cd nextjs-app && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

- [ ] **Step 3: Write snapshot test for prompt output**

Create `nextjs-app/lib/prompt/__tests__/builder.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildSystemPrompt,
  registerPrompt,
  getPromptForAgent,
  defaultPrompt,
} from "../builder.js";
import type { BaseAgent, ExecutionContext, Analysis } from "../../engine/types.js";
import { createContext } from "../../engine/context.js";

// Import technical prompt module to trigger registration side-effect
import "../technical.js";

function fakeAgent(overrides: Partial<BaseAgent> = {}): BaseAgent {
  return {
    id: "test-agent",
    name: "Test",
    capabilities: [],
    personality: { stance: "neutral" },
    tools: [],
    async analyze(_ctx: ExecutionContext): Promise<Analysis> {
      return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
    },
    ...overrides,
  };
}

describe("buildSystemPrompt", () => {
  it("uses default prompt when no agent-specific prompt is registered", () => {
    const agent = fakeAgent({ id: "unknown-agent" });
    const ctx = createContext(
      { type: "stock", code: "000001", name: "平安银行" },
      "test",
    );
    const prompt = buildSystemPrompt(agent, ctx);
    expect(prompt).toContain(defaultPrompt.identity);
    expect(prompt).toContain(defaultPrompt.outputFormat);
  });

  it("returns agent.systemPrompt string override when set", () => {
    const agent = fakeAgent({
      id: "test",
      systemPrompt: "自定义系统提示词",
    });
    const ctx = createContext({ type: "stock", code: "x" }, "test");
    expect(buildSystemPrompt(agent, ctx)).toBe("自定义系统提示词");
  });

  it("uses registered technical prompt for technical-bull agent", () => {
    const agent = fakeAgent({
      id: "technical-bull",
      personality: { stance: "bullish" },
    });
    const ctx = createContext(
      { type: "stock", code: "600519", name: "茅台" },
      "test",
    );
    const prompt = buildSystemPrompt(agent, ctx);
    expect(prompt).toContain("技术面分析师");
    expect(prompt).toContain("道氏理论");
    expect(prompt).toContain("看多");
  });

  it("includes tool descriptions when agent has tools", () => {
    const agent = fakeAgent({
      id: "technical-bull",
      tools: [
        {
          name: "get-kline",
          description: "获取K线数据",
          parameters: { type: "object", properties: {}, required: [] },
          execute: async () => "{}",
        },
      ] as any,
    });
    const ctx = createContext(
      { type: "stock", code: "600519", name: "茅台" },
      "test",
    );
    const prompt = buildSystemPrompt(agent, ctx);
    expect(prompt).toContain("get-kline");
    expect(prompt).toContain("获取K线数据");
  });
});

describe("getPromptForAgent", () => {
  it("returns undefined for unregistered agent", () => {
    expect(getPromptForAgent("nonexistent")).toBeUndefined();
  });

  it("finds by prefix match: technical-bear matches technical", () => {
    const prompt = getPromptForAgent("technical-bear");
    expect(prompt).toBeDefined();
    expect(prompt!.identity).toContain("技术面分析师");
  });
});
```

- [ ] **Step 4: Run prompt tests**

Run: `cd nextjs-app && npx vitest run lib/prompt/__tests__/builder.test.ts --reporter=verbose`
Expected: 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add nextjs-app/lib/prompt/technical.ts nextjs-app/lib/prompt/__tests__/builder.test.ts
git commit -m "feat: add technical analyst prompt module with Standard-tier depth"
```

---

### Task 8: Wire `useReAct` into `executeAnalyze` primitive

**Files:**
- Modify: `nextjs-app/lib/engine/primitives/analyze.ts`

**Interfaces:**
- Consumes: `runReActLoop` from `../react.js`
- Produces: `executeAnalyze` now accepts an optional `engineOptions: { useReAct?: boolean }` parameter (default false)

- [ ] **Step 1: Modify `executeAnalyze` to support ReAct path**

In `nextjs-app/lib/engine/primitives/analyze.ts`, add a ReAct path behind a flag while keeping the existing code path intact:

```typescript
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentRegistry } from "../registry.js";
import type { AgentMatch, ExecutionContext, WorkflowStep, Analysis } from "../types.js";
import { addFinding } from "../context.js";
import { createLLM, type AnalyzeOptions } from "../../llm/create-llm.js";
import { parseLLMJson, parseSentiment } from "../../llm/parse.js";
import { runReActLoop } from "../react.js";

export interface EngineOptions {
  /** Enable ReAct loop for tool-using agents. Default: false */
  useReAct?: boolean;
}

export async function executeAnalyze(
  step: WorkflowStep,
  registry: AgentRegistry,
  context: ExecutionContext,
  options: AnalyzeOptions = {},
  engineOptions: EngineOptions = {},
): Promise<ExecutionContext> {
  const match: AgentMatch | undefined = Array.isArray(step.agent)
    ? step.agent[0]
    : (step.agent ?? undefined);
  if (!match) throw new Error(`Analyze step "${step.id}" requires an agent match`);

  const agents = registry.match(match, { min: 1, max: 1 });
  if (agents.length === 0) {
    throw new Error(
      `No agent found for step "${step.id}" matching ${JSON.stringify(match)}`,
    );
  }
  const agent = agents[0];

  const prompt = (step.prompt ?? "分析 {target}").replace(
    "{target}",
    context.target.name ?? context.target.code,
  );

  // ——— ReAct path (NEW) ———
  if (engineOptions.useReAct) {
    const analysis = await runReActLoop({
      agent,
      context,
      prompt,
      target: context.target,
      maxSteps: (agent as any).maxReActSteps ?? 5,
      llmOptions: options,
    });
    return addFinding(context, step.id, agent.id, analysis);
  }

  // ——— Legacy path (unchanged) ———
  const llm = createLLM(options);
  const messages = [
    new SystemMessage(buildSystemPrompt(agent.personality.stance)),
    new HumanMessage(formatPromptWithContext(prompt, context)),
  ];

  const response = await llm.invoke(messages);
  const text =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);
  const analysis = parseAnalysis(text, agent.id);

  return addFinding(context, step.id, agent.id, analysis);
}

// ... keep existing helper functions (buildSystemPrompt, formatPromptWithContext, parseAnalysis) unchanged ...
```

(Show only the changed `executeAnalyze` function — the three helper functions at the bottom of the file stay exactly as they are.)

- [ ] **Step 2: Run existing analyze tests — must still pass**

Run: `cd nextjs-app && npx vitest run lib/engine/primitives/__tests__/analyze.test.ts --reporter=verbose`
Expected: 3 tests pass (all legacy path, `useReAct` defaults to false)

- [ ] **Step 3: Add a test for ReAct path in analyze primitive**

Add to the existing test file or create a new test block in the same file. Add this test case inside the `describe("executeAnalyze")` block:

```typescript
it("uses ReAct loop when engineOptions.useReAct is true", async () => {
  const registry = new AgentRegistry();
  registry.register(
    fakeAgent({
      id: "react-agent",
      tools: [
        {
          name: "test-tool",
          description: "test",
          parameters: { type: "object", properties: {}, required: [] },
          execute: async () => '{"ok": true}',
        },
      ] as any,
    }),
  );

  const ctx = createContext(
    { type: "stock", code: "600519", name: "茅台" },
    "test",
  );

  const step: WorkflowStep = {
    id: "react-step",
    type: "analyze",
    agent: { id: "react-agent" },
    prompt: "分析 {target}",
  };

  let callCount = 0;
  class ReActTestModel {
    bindTools() { return this; }
    async invoke(_msgs: unknown[]) {
      callCount++;
      if (callCount === 1) {
        return {
          content: "需要数据",
          tool_calls: [{ id: "c1", name: "test-tool", args: {} }],
        };
      }
      return {
        content:
          '{"conclusion":"结论","confidence":0.7,"sentiment":"neutral","reasoning":["理由"]}',
      };
    }
  }

  const result = await executeAnalyze(step, registry, ctx, {
    llm: new ReActTestModel() as any,
  }, { useReAct: true });

  expect(callCount).toBe(2);
  expect(result.findings).toHaveLength(1);
  expect(result.findings[0].step).toBe("react-step");
  expect(result.findings[0].agent).toBe("react-agent");
});
```

- [ ] **Step 4: Run tests**

Run: `cd nextjs-app && npx vitest run lib/engine/primitives/__tests__/analyze.test.ts --reporter=verbose`
Expected: 4 tests pass (3 original + 1 new ReAct test)

- [ ] **Step 5: Run all tests**

Run: `cd nextjs-app && npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add nextjs-app/lib/engine/primitives/analyze.ts nextjs-app/lib/engine/primitives/__tests__/analyze.test.ts
git commit -m "feat: add useReAct flag to executeAnalyze primitive"
```

---

### Task 9: Wire `runReActLoop` into `Director.invokeAgent()`

**Files:**
- Modify: `nextjs-app/lib/chat/director.ts`

**Interfaces:**
- Consumes: `runReActLoop` from `../engine/react.js`
- Modifies: `Director.invokeAgent()` — when agent has `tools.length > 0`, uses ReAct loop instead of direct LLM call

- [ ] **Step 1: Modify `Director.invokeAgent()`**

The Director's `invokeAgent` method currently does direct `llm.invoke()`. We add a ReAct path:

In `nextjs-app/lib/chat/director.ts`, add import at top:

```typescript
import { runReActLoop } from "../engine/react.js";
import type { ToolDefinition } from "../tools/types.js";
```

Then modify `invokeAgent` method (lines 227-291). Replace the method body:

```typescript
private async invokeAgent(
  agentId: string,
  prompt: string,
  target: AnalysisTarget,
  findings: Finding[],
  history: { senderId: string; senderName: string; content: string }[],
  onMessage: (msg: PendingMessage) => Promise<void>,
  step?: WorkflowStep,
): Promise<{ conclusion: string }> {
  // Check if agent has tools — if so, use ReAct
  const agent = this.registry?.get(agentId);
  const tools = (agent?.tools as ToolDefinition[]) ?? [];

  if (tools.length > 0 && agent) {
    return this.invokeAgentWithReAct(
      agent, agentId, prompt, target, findings, history, onMessage, step,
    );
  }

  // ——— Legacy path (unchanged for agents without tools) ———
  const llm = createLLM(this.options);
  const historyText = history
    .map((h) => `[${h.senderName}]: ${h.content}`)
    .join("\n");
  const allFindingsText = findings
    .map(
      (f) =>
        `[${f.agent}](${f.analysis.sentiment}): ${f.analysis.conclusion}`,
    )
    .join("\n");

  const systemPrompt = `你是${agentId}。请用中文回复。${step?.prompt ? `任务：${step.prompt.replace("{target}", target.name ?? target.code)}` : ""}
输出JSON格式：{"conclusion":"你的结论","confidence":0.0-1.0,"sentiment":"bullish|bearish|neutral","reasoning":["论据1","论据2","论据3"]}`;

  const messages = [
    new SystemMessage(systemPrompt),
    new HumanMessage(
      `${prompt}${historyText ? `\n\n对话历史：\n${historyText}` : ""}${allFindingsText ? `\n\n已有分析结论：\n${allFindingsText}` : ""}`,
    ),
  ];

  const response = await llm.invoke(messages);
  const text =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  let conclusion = text.slice(0, 200);

  try {
    const parsed = parseLLMJson(text) as Record<string, unknown>;
    conclusion =
      (parsed.conclusion as string) ?? text.slice(0, 200);
    await onMessage({
      role: "agent",
      senderId: agentId,
      senderName: agentId,
      content: text,
      metadata: {
        type: "analysis",
        stepId: step?.id,
        isWorkflowStep: true,
        analysis: {
          conclusion,
          confidence: Math.max(
            0,
            Math.min(1, (parsed.confidence as number) ?? 0.5),
          ),
          sentiment: parseSentiment(parsed.sentiment),
          reasoning: Array.isArray(parsed.reasoning)
            ? (parsed.reasoning as string[])
            : [(parsed.reasoning as string) ?? ""],
          rawOutput: text,
        },
      },
    });
  } catch {
    await onMessage({
      role: "agent",
      senderId: agentId,
      senderName: agentId,
      content: text,
      metadata: {
        type: "analysis",
        stepId: step?.id,
        isWorkflowStep: true,
      },
    });
  }

  return { conclusion };
}

/** New method: ReAct-based agent invocation */
private async invokeAgentWithReAct(
  agent: import("../engine/types.js").BaseAgent,
  agentId: string,
  prompt: string,
  target: AnalysisTarget,
  findings: Finding[],
  history: { senderId: string; senderName: string; content: string }[],
  onMessage: (msg: PendingMessage) => Promise<void>,
  step?: WorkflowStep,
): Promise<{ conclusion: string }> {
  // Build a minimal ExecutionContext for the ReAct loop
  const context: import("../engine/types.js").ExecutionContext = {
    target,
    task: prompt,
    findings,
    debateRounds: [],
    workflowName: this.dag.name,
    startedAt: Date.now(),
  };

  const analysis = await runReActLoop({
    agent,
    context,
    prompt,
    target,
    maxSteps: (agent as any).maxReActSteps ?? 5,
    llmOptions: this.options,
    onEvent: async (event) => {
      if (event.type === "thought") {
        await onMessage({
          role: "agent",
          senderId: agentId,
          senderName: agent?.name ?? agentId,
          content: `💭 ${event.content.slice(0, 300)}`,
          metadata: { type: "analysis", stepId: step?.id, isWorkflowStep: true },
        });
      } else if (event.type === "action") {
        await onMessage({
          role: "system",
          senderId: agentId,
          senderName: agent?.name ?? agentId,
          content: `🔧 调用工具: ${event.toolName}(${JSON.stringify(event.params)})`,
          metadata: { type: "analysis", stepId: step?.id, isWorkflowStep: true },
        });
      } else if (event.type === "observation") {
        await onMessage({
          role: "system",
          senderId: agentId,
          senderName: agent?.name ?? agentId,
          content: `📊 ${event.toolName} 返回: ${event.result.slice(0, 200)}`,
          metadata: { type: "analysis", stepId: step?.id, isWorkflowStep: true },
        });
      } else if (event.type === "final" || event.type === "forced_summary") {
        await onMessage({
          role: "agent",
          senderId: agentId,
          senderName: agent?.name ?? agentId,
          content: event.analysis.rawOutput ?? event.analysis.conclusion,
          metadata: {
            type: "analysis",
            stepId: step?.id,
            isWorkflowStep: true,
            analysis: event.analysis,
          },
        });
      }
    },
  });

  return { conclusion: analysis.conclusion };
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd nextjs-app && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors (may need minor type adjustments)

- [ ] **Step 3: Run existing director/session tests**

Run: `cd nextjs-app && npx vitest run --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|Tests)"`
Expected: All tests pass (agents without tools still use legacy path)

- [ ] **Step 4: Commit**

```bash
git add nextjs-app/lib/chat/director.ts
git commit -m "feat: wire runReActLoop into Director for tool-using agents"
```

---

### Task 10: Update `TechnicalAnalystAgent` with tools and prompt

**Files:**
- Modify: `nextjs-app/lib/agents/technical.ts`

**Interfaces:**
- Consumes: `klineTool`, `macdTool`, `rsiTool`, `maTool` from `../../tools/index.js`
- Consumes: Trigger side-effect import of `../../prompt/technical.js` to register prompts
- Modifies: `TechnicalAnalystAgent.tools` — from `[]` to `[klineTool, macdTool, rsiTool, maTool]`
- Modifies: `TechnicalAnalystAgent` to import prompt module

- [ ] **Step 1: Add imports and tools to technical agent**

In `nextjs-app/lib/agents/technical.ts`:

```typescript
import type { AgentPersona, ExecutionContext, Analysis } from "../engine/types.js";
import type { StructuredTool } from "@langchain/core/tools";
import { BaseAgent } from "../engine/types.js";
import { klineTool, macdTool, rsiTool, maTool } from "../tools/index.js";
import type { ToolDefinition } from "../tools/types.js";
// Import prompt module to trigger registration side-effect
import "../prompt/technical.js";

export class TechnicalAnalystAgent implements BaseAgent {
  id: string;
  name = "技术面分析师";
  capabilities: string[] = [];
  personality: AgentPersona;
  tools: (StructuredTool | ToolDefinition)[] = [klineTool, macdTool, rsiTool, maTool];
  canCritique = true;
  canDebate = true;
  layer?: string = "analysis";

  constructor(config: { id: string; personality: AgentPersona }) {
    this.id = config.id;
    this.personality = config.personality;
    // Include stance in capabilities so workflow matching works
    this.capabilities = ["technical", config.personality.stance];
  }

  async analyze(_context: ExecutionContext): Promise<Analysis> {
    // The actual LLM interaction happens in executeAnalyze primitive or Director.
    // This method exists for interface compliance but is not called directly.
    return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
  }
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd nextjs-app && npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

- [ ] **Step 3: Run all tests**

Run: `cd nextjs-app && npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All tests pass (existing agents still use legacy path; `useReAct` defaults to false)

- [ ] **Step 4: Commit**

```bash
git add nextjs-app/lib/agents/technical.ts
git commit -m "feat: equip TechnicalAnalystAgent with K-line/MACD/RSI/MA tools and deepened prompt"
```

---

### Task 11: Integration test — bull-bear workflow with ReAct pilot

**Files:**
- Modify: `nextjs-app/lib/engine/__tests__/` (create `react-integration.test.ts`)

**Interfaces:**
- Consumes: `AgentRegistry`, `executeAnalyze`, `createContext`, workflow definitions, `TechnicalAnalystAgent`

- [ ] **Step 1: Create integration test**

Create `nextjs-app/lib/engine/__tests__/react-integration.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../registry.js";
import { createContext } from "../context.js";
import { executeAnalyze } from "../primitives/analyze.js";
import { executePanel } from "../primitives/panel.js";
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
    const judge = new JudgeAgent({ id: "judge", personality: { stance: "neutral" } });

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

    // Step 2: Judge synthesis (no tools — uses legacy path, but ReAct with 0 tools = 1 step)
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
```

- [ ] **Step 2: Run integration test**

Run: `cd nextjs-app && npx vitest run lib/engine/__tests__/react-integration.test.ts --reporter=verbose`
Expected: 1 test passes

- [ ] **Step 3: Run full test suite**

Run: `cd nextjs-app && npx vitest run --reporter=verbose 2>&1 | tail -30`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add nextjs-app/lib/engine/__tests__/react-integration.test.ts
git commit -m "test: add integration test for bull-bear workflow with ReAct pilot"
```

---

**Phase 2 checkpoint complete.** `technical-bull` agent uses ReAct with tools and deepened prompts. All other agents unchanged.

---

### Task 12: Remaining rollout (Phase 3-4 summary)

This is a summary task. Each sub-batch follows the pattern established in Tasks 6-10: create prompt module → create tools → wire into agent class.

**Batch 1 (technical-bear, technical-neutral):**
- Already done in Task 7 (prompts registered for all three stances)
- `technical-bear` and `technical-neutral` agent constructors in `index.ts` already create `TechnicalAnalystAgent` instances with their stances — they inherit the tools from Task 10 automatically
- Verify: `cd nextjs-app && npx vitest run --reporter=verbose 2>&1 | tail -5`

**Batch 2 (financial-bull/bear/neutral):**
- Create `lib/tools/financial.ts` with `get-financial-summary` and `get-valuation` tools
- Create `lib/prompt/financial.ts` with Standard-tier financial analysis prompt
- Update `FinancialReportAgent` in `lib/agents/fundamental.ts` to import tools and prompt

**Batch 3 (valuation, pattern, event-driven, volume):**
- Create tools for each domain
- Create prompt modules at Standard tier
- Update agent classes

**Batch 4 (perception layer):**
- Light-tier prompts only (~200 tokens)
- Data-fetching tools as needed
- Update agent classes

**Batch 5 (decision layer):**
- Deep-tier prompts (~2000 tokens)
- Composite-analysis tools
- Update agent classes

**Batch 6 (execution layer):**
- Light-tier prompts
- Minimal tools

**Phase 4 cleanup:**
1. Remove `useReAct` flag — all paths call `runReActLoop`
2. Remove legacy `buildSystemPrompt` from `analyze.ts` and `director.ts`
3. Remove `BaseAgent.analyze()` method
4. Remove `StructuredTool` import/type widening
