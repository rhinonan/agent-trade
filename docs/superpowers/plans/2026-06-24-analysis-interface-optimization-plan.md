# Analysis Interface Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time tool call visualization, typewriter text animation, and chat-bubble-style progressive reveal to the analysis live interface.

**Architecture:** Backend gains 4 new Socket.IO events (`agent:thinking`, `agent:tool_call`, `agent:tool_result`, `agent:writing`). Tool call callbacks are threaded through `runWorkflow → compileWorkflow → buildStateGraph → buildAgentNode`. The `AgentExecutor` enables `returnIntermediateSteps: true` and the callback fires tool events in real-time. Frontend `useAnalysisSocket` accumulates per-agent message streams; `AgentBubble` composes `ThinkingIndicator → ToolCallCard × N → TypewriterText` with a detail/simple view toggle.

**Tech Stack:** Next.js 15, React 18, TypeScript, Socket.IO, LangChain/LangGraph, Tailwind CSS v4, Vitest

## Global Constraints

- Backend event names: `agent:thinking`, `agent:tool_call`, `agent:tool_result`, `agent:writing`
- Frontend typewriter speed: 30-50 chars/sec, with natural punctuation pauses
- No new third-party animation libraries (CSS + requestAnimationFrame only)
- Backward compatible: existing `node:*` and `step:*` events remain functional
- Hover on ToolCallCard reveals full JSON result in a tooltip
- Detail/simple toggle on AgentBubble — detail mode (default) shows tool calls, simple hides them

---

### Task 1: Add new Socket.IO event types

**Files:**
- Modify: `lib/socket/events.ts`

**Interfaces:**
- Produces: `WS_EVENTS.AGENT_THINKING`, `WS_EVENTS.AGENT_TOOL_CALL`, `WS_EVENTS.AGENT_TOOL_RESULT`, `WS_EVENTS.AGENT_WRITING` constants; `AgentThinkingPayload`, `AgentToolCallPayload`, `AgentToolResultPayload`, `AgentWritingPayload` interfaces

- [ ] **Step 1: Add event constants and payload interfaces**

In `lib/socket/events.ts`, after the `DEBATE_YIELD` line, add:

```typescript
  // Server emits — agent-level granular events (tool calls, thinking, writing)
  AGENT_THINKING: "agent:thinking",
  AGENT_TOOL_CALL: "agent:tool_call",
  AGENT_TOOL_RESULT: "agent:tool_result",
  AGENT_WRITING: "agent:writing",
```

After the existing `DebateYieldPayload` interface, add:

```typescript
export interface AgentThinkingPayload {
  nodeId: string;
  agentName: string;
}

export interface AgentToolCallPayload {
  nodeId: string;
  agentName: string;
  tool: string;
  args: Record<string, unknown>;
  ts: number;
}

export interface AgentToolResultPayload {
  nodeId: string;
  agentName: string;
  tool: string;
  result: string;
  ts: number;
}

export interface AgentWritingPayload {
  nodeId: string;
  agentName: string;
  conclusion: string;
  reasoning: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors introduced by events.ts

- [ ] **Step 3: Commit**

```bash
git add lib/socket/events.ts
git commit -m "feat: add agent-level granular Socket.IO event types"
```

---

### Task 2: Thread tool-call callbacks through LangGraph layers

**Files:**
- Modify: `lib/langgraph/runner.ts:19-23` (WorkflowRunCallbacks)
- Modify: `lib/langgraph/compiler.ts:7-23` (CompiledWorkflow, compileWorkflow signature)
- Modify: `lib/langgraph/builder.ts:21-50` (buildStateGraph signature)

**Interfaces:**
- Consumes: Task 1 event payload interfaces
- Produces: `WorkflowRunCallbacks.onToolCall?`, `WorkflowRunCallbacks.onToolResult?`, `WorkflowRunCallbacks.onAgentWriting?`; updated `compileWorkflow` and `buildStateGraph` signatures with callbacks parameter

- [ ] **Step 1: Extend WorkflowRunCallbacks in runner.ts**

Replace lines 19-23:

```typescript
export interface WorkflowRunCallbacks {
  onNodeStart?(nodeId: string, agentName: string): Promise<void>;
  onNodeEnd?(nodeId: string, result: unknown): Promise<void>;
  onStreamChunk?(chunk: string): Promise<void>;
  onToolCall?(nodeId: string, agentName: string, tool: string, args: Record<string, unknown>): Promise<void>;
  onToolResult?(nodeId: string, agentName: string, tool: string, result: string): Promise<void>;
  onAgentWriting?(nodeId: string, agentName: string, conclusion: string, reasoning: string): Promise<void>;
}
```

- [ ] **Step 2: Pass callbacks through runWorkflow → compileWorkflow**

In `runner.ts` line 130, update the `compileWorkflow` call:

```typescript
const compiled = compileWorkflow(workflow, loader, llmFactory, dataClient, {
  onToolCall: callbacks.onToolCall,
  onToolResult: callbacks.onToolResult,
  onAgentWriting: callbacks.onAgentWriting,
});
```

- [ ] **Step 3: Update compiler.ts signature and pass-through**

Replace the entire file content. Keep lines 1-5 imports, replace the interfaces and function:

```typescript
import type { WorkflowYaml } from "../role-loader/schema.js";
import type { RoleLoader } from "../role-loader/loader.js";
import { buildStateGraph } from "./builder.js";
import type { Runnable } from "@langchain/core/runnables";
import type { AStockClient } from "../data-sdk/client.js";

export interface CompiledWorkflow {
  name: string;
  graph: ReturnType<typeof buildStateGraph>;
}

export interface AgentNodeCallbacks {
  onToolCall?(nodeId: string, agentName: string, tool: string, args: Record<string, unknown>): Promise<void>;
  onToolResult?(nodeId: string, agentName: string, tool: string, result: string): Promise<void>;
  onAgentWriting?(nodeId: string, agentName: string, conclusion: string, reasoning: string): Promise<void>;
}

type LLMFactory = () => Runnable;

/**
 * Top-level compiler: WorkflowYaml → CompiledWorkflow.
 * Variable {{target}} is resolved at invocation time, not compile time.
 */
export function compileWorkflow(
  workflow: WorkflowYaml,
  loader: RoleLoader,
  llmFactory: LLMFactory,
  dataClient: AStockClient,
  agentCallbacks?: AgentNodeCallbacks,
): CompiledWorkflow {
  return {
    name: workflow.name,
    graph: buildStateGraph(workflow, loader, llmFactory, dataClient, agentCallbacks),
  };
}
```

- [ ] **Step 4: Update builder.ts signature and pass through to buildAgentNode**

In `builder.ts`, update the `buildStateGraph` function signature (line 21-26):

```typescript
export function buildStateGraph(
  workflow: WorkflowYaml,
  loader: RoleLoader,
  llmFactory: LLMFactory,
  dataClient: AStockClient,
  agentCallbacks?: import("./compiler.js").AgentNodeCallbacks,
) {
```

Update the `buildAgentNode` call on line 49:

```typescript
graph.addNode(node.id, buildAgentNode(agent, prompt, llmFactory, dataClient, node.id, agentCallbacks));
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors from runner/compiler/builder (nodes.ts will have an error about missing params — that's for Task 3)

- [ ] **Step 6: Commit**

```bash
git add lib/langgraph/runner.ts lib/langgraph/compiler.ts lib/langgraph/builder.ts
git commit -m "feat: thread tool-call callbacks through LangGraph compilation layers"
```

---

### Task 3: Enable intermediateSteps in AgentExecutor and emit tool events

**Files:**
- Modify: `lib/langgraph/nodes.ts:188-296` (buildAgentNode signature and body)

**Interfaces:**
- Consumes: `AgentNodeCallbacks` from compiler.ts; Task 1 payload interfaces
- Produces: Updated `buildAgentNode` with `returnIntermediateSteps: true` and callback invocations

- [ ] **Step 1: Update buildAgentNode signature**

In `nodes.ts` line 188-193, add `nodeId` and `callbacks` parameters:

```typescript
export function buildAgentNode(
  compiled: CompiledAgent,
  taskPrompt: string,
  llmFactory: () => Runnable,
  dataClient: AStockClient,
  nodeId: string,
  callbacks?: import("./compiler.js").AgentNodeCallbacks,
) {
```

- [ ] **Step 2: Emit agent:thinking when node starts (tool path)**

After line 243 (`if (compiled.tools.length === 0) {`), at line 244 before the tool conversion code, add at the beginning of the tool-path block (inside the `else`):

Actually, let's add the thinking emit right after line 243, before the simple path. Insert after `const structuredTools = compiled.tools.map(...)` at line 245:
No — better: add at the top of the function body, after `const llm = llmFactory();` at line 195. Insert:

```typescript
    // Emit thinking event so frontend can show bouncing dots
    await callbacks?.onToolCall?.(
      nodeId,
      compiled.name ?? compiled.id,
      "__thinking__",
      {},
    );
```

Wait — we need a cleaner approach. Let me think again. The `__thinking__` hack is ugly. Let's use a dedicated callback. But we don't have an `onThinking` callback defined. Let me add one.

Actually, let's use the existing `onToolCall` callback with a special `__start__` tool name as a signal that the agent started. Or better — let me just not add a thinking callback. Instead, in `route.ts`, when `onNodeStart` fires, we'll emit `agent:thinking` there. That's cleaner.

So in `route.ts` `onNodeStart`, add:
```typescript
ns.to(sessionId).emit(WS_EVENTS.AGENT_THINKING, { nodeId, agentName });
```

This is simpler and keeps the node function clean. Let me note this for Task 4.

So for Task 3, I only need to:
1. Enable `returnIntermediateSteps: true`
2. Iterate intermediateSteps and call onToolCall/onToolResult callbacks
3. After executor completes, call onAgentWriting

- [ ] **Step 1: Enable returnIntermediateSteps and add tool call iteration**

In `nodes.ts`, replace line 268:

```typescript
      returnIntermediateSteps: false,
```

with:

```typescript
      returnIntermediateSteps: true,
```

- [ ] **Step 2: After executor.invoke, iterate intermediate steps and fire callbacks**

After line 271 (`const result = await executor.invoke({ input: resolvedPrompt });`), insert:

```typescript
    // Emit tool call/result events for real-time frontend display
    const intermediateSteps = (result as any).intermediateSteps as
      | { action: { tool: string; toolInput: Record<string, unknown> }; observation: string }[]
      | undefined;
    if (intermediateSteps && callbacks) {
      const agentName = compiled.id;
      for (const step of intermediateSteps) {
        await callbacks.onToolCall?.(
          nodeId,
          agentName,
          step.action.tool,
          step.action.toolInput,
        );
        await callbacks.onToolResult?.(
          nodeId,
          agentName,
          step.action.tool,
          typeof step.observation === "string"
            ? step.observation
            : JSON.stringify(step.observation),
        );
      }
    }
```

- [ ] **Step 3: After tool call iteration, emit agent writing event**

After the intermediateSteps block (still inside the tool path, before parsing outputText), insert:

```typescript
    // Emit writing event with full conclusion/reasoning for frontend typewriter
    if (callbacks) {
      const agentName = compiled.id;
      let conclusion = "";
      let reasoning = "";
      try {
        const preParsed = JSON.parse(outputText);
        conclusion = preParsed.conclusion ?? outputText;
        reasoning = preParsed.reasoning ?? "";
      } catch {
        conclusion = outputText;
      }
      await callbacks.onAgentWriting?.(nodeId, agentName, conclusion, reasoning);
    }
```

- [ ] **Step 4: Also handle simple path (no tools) with writing event**

Insert the same writing emit after line 213 (`const response = await llm.invoke(messages);`), in the simple path. After line 218, add:

```typescript
      // Emit writing event for frontend typewriter (simple path)
      if (callbacks) {
        const agentName = compiled.id;
        let conclusion = "";
        let reasoning = "";
        const text = typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);
        try {
          const preParsed = JSON.parse(text);
          conclusion = preParsed.conclusion ?? text;
          reasoning = preParsed.reasoning ?? "";
        } catch {
          conclusion = text;
        }
        await callbacks.onAgentWriting?.(nodeId, agentName, conclusion, reasoning);
      }
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add lib/langgraph/nodes.ts
git commit -m "feat: enable intermediateSteps and emit tool call/writing events from AgentExecutor"
```

---

### Task 4: Wire Socket.IO emissions in the API route

**Files:**
- Modify: `app/api/analyze/route.ts:116-185` (onNodeStart and onNodeEnd callbacks in runAnalysis)

**Interfaces:**
- Consumes: Task 1 event constants and payloads; Task 2 callback signatures
- Produces: Working real-time event pipeline from AgentExecutor → Socket.IO → frontend

- [ ] **Step 1: Add agent:thinking emit in onNodeStart**

In `route.ts`, inside `onNodeStart` (after the existing `NODE_START` and `STEP_START` emits, around line 135), add:

```typescript
          // Emit agent:thinking for frontend typewriter/bubble UI
          ns.to(sessionId).emit(WS_EVENTS.AGENT_THINKING, {
            nodeId,
            agentName,
          });
```

- [ ] **Step 2: Add tool/result/writing callbacks to runWorkflow call**

In `route.ts`, in the `runWorkflow` call's `callbacks` object (starting around line 115), add after the `onNodeEnd` block (after line 185, before the `},` that closes the callbacks object):

```typescript
        onToolCall: async (nodeId, agentName, tool, args) => {
          ns.to(sessionId).emit(WS_EVENTS.AGENT_TOOL_CALL, {
            nodeId,
            agentName,
            tool,
            args,
            ts: Date.now(),
          });
        },
        onToolResult: async (nodeId, agentName, tool, result) => {
          ns.to(sessionId).emit(WS_EVENTS.AGENT_TOOL_RESULT, {
            nodeId,
            agentName,
            tool,
            result,
            ts: Date.now(),
          });
        },
        onAgentWriting: async (nodeId, agentName, conclusion, reasoning) => {
          ns.to(sessionId).emit(WS_EVENTS.AGENT_WRITING, {
            nodeId,
            agentName,
            conclusion,
            reasoning,
          });
        },
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add app/api/analyze/route.ts
git commit -m "feat: wire agent tool/writing events to Socket.IO in API route"
```

---

### Task 5: Create ThinkingIndicator component

**Files:**
- Create: `components/analysis/ThinkingIndicator.tsx`

**Interfaces:**
- Produces: `<ThinkingIndicator />` — renders three bouncing dots in chat-bubble style

- [ ] **Step 1: Write the component**

```typescript
"use client";

/**
 * Three bouncing dots indicating an agent is "thinking".
 * Chat-bubble style — mimics ChatGPT/Claude's typing indicator.
 */
export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 py-3 px-4" aria-label="Agent is thinking">
      <span className="dot-typing-bounce w-2 h-2 bg-zinc-500 rounded-full" />
      <span className="dot-typing-bounce w-2 h-2 bg-zinc-500 rounded-full" style={{ animationDelay: "0.2s" }} />
      <span className="dot-typing-bounce w-2 h-2 bg-zinc-500 rounded-full" style={{ animationDelay: "0.4s" }} />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/analysis/ThinkingIndicator.tsx
git commit -m "feat: add ThinkingIndicator component with bouncing dots"
```

---

### Task 6: Create TypewriterText component

**Files:**
- Create: `components/analysis/TypewriterText.tsx`

**Interfaces:**
- Produces: `useTypewriter(text, speed)` hook; `<TypewriterText text onDone />` component with blinking cursor

- [ ] **Step 1: Write the useTypewriter hook and TypewriterText component**

```typescript
"use client";
import { useState, useEffect, useRef, useCallback } from "react";

export interface TypewriterTextProps {
  text: string;
  /** Characters per second. Default 40. */
  speed?: number;
  /** Called when animation finishes. */
  onDone?: () => void;
  /** Additional CSS class for the text element. */
  className?: string;
}

/**
 * Hook: drives character-by-character typewriter animation.
 * Uses requestAnimationFrame + batch updates (3-5 chars per frame)
 * to avoid excessive React re-renders.
 */
function useTypewriter(text: string, speed: number) {
  const [displayed, setDisplayed] = useState("");
  const [isDone, setIsDone] = useState(false);
  const rafRef = useRef<number | null>(null);
  const idxRef = useRef(0);

  useEffect(() => {
    // Reset when text changes
    idxRef.current = 0;
    setDisplayed("");
    setIsDone(false);

    if (!text) {
      setIsDone(true);
      return;
    }

    const BATCH = 4; // chars per frame at ~60fps ≈ 240 chars/sec effective
    const baseDelay = 1000 / speed; // ms per char

    const tick = () => {
      const i = idxRef.current;
      if (i >= text.length) {
        setIsDone(true);
        return;
      }

      const next = Math.min(i + BATCH, text.length);
      setDisplayed(text.slice(0, next));
      idxRef.current = next;

      // Account for punctuation pauses
      let extraPause = 0;
      for (let j = i; j < next && j < text.length; j++) {
        const ch = text[j];
        if (ch === "\n" || ch === "。" || ch === "！" || ch === "？") {
          extraPause += baseDelay * 2;
        } else if (ch === "，" || ch === "," || ch === "、") {
          extraPause += baseDelay;
        }
      }

      rafRef.current = window.setTimeout(
        () => (rafRef.current = window.setTimeout(tick, 0)),
        baseDelay * BATCH + extraPause,
      ) as unknown as number;
    };

    rafRef.current = window.setTimeout(tick, 0) as unknown as number;

    return () => {
      if (rafRef.current !== null) {
        clearTimeout(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [text, speed]);

  return { displayed, isDone };
}

/**
 * Renders text with a typewriter character-by-character effect
 * and a blinking cursor that disappears when done.
 */
export function TypewriterText({
  text,
  speed = 40,
  onDone,
  className = "",
}: TypewriterTextProps) {
  const { displayed, isDone } = useTypewriter(text, speed);
  const prevDone = useRef(false);

  useEffect(() => {
    if (isDone && !prevDone.current) {
      prevDone.current = true;
      onDone?.();
    }
  }, [isDone, onDone]);

  if (!text) return null;

  return (
    <span className={className}>
      {displayed}
      {!isDone && (
        <span className="blink-cursor inline-block w-[2px] h-[1em] bg-zinc-400 align-middle ml-0.5" />
      )}
    </span>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/analysis/TypewriterText.tsx
git commit -m "feat: add TypewriterText component with character-by-character animation"
```

---

### Task 7: Create ToolCallCard component

**Files:**
- Create: `components/analysis/ToolCallCard.tsx`

**Interfaces:**
- Produces: `<ToolCallCard tool args result ts isError />` with collapsible result and hover-to-expand JSON detail

- [ ] **Step 1: Write the ToolCallCard component**

```typescript
"use client";
import { useState } from "react";

const TOOL_ICONS: Record<string, string> = {
  get_kline: "📊",
  get_kline_technicals: "📊",
  calc_indicators: "📈",
  calc_rsi: "📈",
  calc_macd: "📈",
  get_fund_flow: "💰",
  get_news: "📰",
  get_financials: "📋",
  search_web: "🌐",
  default: "🔧",
};

export interface ToolCallCardProps {
  tool: string;
  args: Record<string, unknown>;
  result?: string;
  ts: number;
  isError?: boolean;
  collapsed?: boolean;
}

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args).slice(0, 3);
  return entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
}

function formatResultPreview(result: string): string {
  if (result.length <= 100) return result;
  return result.slice(0, 100) + "…";
}

export function ToolCallCard({
  tool,
  args,
  result,
  ts,
  isError = false,
  collapsed = false,
}: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(!collapsed);
  const [showFullResult, setShowFullResult] = useState(false);
  const icon = TOOL_ICONS[tool] ?? TOOL_ICONS.default;

  return (
    <div
      className={`text-xs py-1.5 px-3 border-l-2 ${
        isError
          ? "border-l-red-500 bg-red-950/10"
          : result
            ? "border-l-emerald-600 bg-emerald-950/5"
            : "border-l-amber-500 bg-amber-950/5"
      }`}
    >
      <button
        type="button"
        className="flex items-center gap-1.5 w-full text-left cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-zinc-400">
          {expanded ? "▼" : "▶"}
        </span>
        <span className="mr-1">{icon}</span>
        <span className="text-zinc-300 font-medium">{tool}</span>
        <span className="text-zinc-600">
          ({formatArgs(args)})
        </span>
        {!result && !isError && (
          <span className="ml-auto text-amber-500 animate-pulse text-[10px]">
            running…
          </span>
        )}
        {isError && (
          <span className="ml-auto text-red-400 text-[10px]">failed</span>
        )}
      </button>

      {expanded && result && (
        <div className="mt-1 ml-5 relative group">
          <p
            className={`text-zinc-500 leading-relaxed ${isError ? "text-red-400" : ""}`}
            onMouseEnter={() => setShowFullResult(true)}
            onMouseLeave={() => setShowFullResult(false)}
          >
            {formatResultPreview(result)}
          </p>
          {/* Hover tooltip with full JSON */}
          {showFullResult && result.length > 100 && (
            <div className="absolute left-0 bottom-full mb-1 z-50 max-w-md p-2 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl">
              <pre className="text-[11px] text-zinc-300 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                {result}
              </pre>
            </div>
          )}
        </div>
      )}
      {expanded && !result && !isError && (
        <p className="mt-1 ml-5 text-zinc-600 italic">等待结果…</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add components/analysis/ToolCallCard.tsx
git commit -m "feat: add ToolCallCard component with hover JSON detail"
```

---

### Task 8: Refactor useAnalysisSocket hook with agentStreams

**Files:**
- Modify: `hooks/useAnalysisSocket.ts`

**Interfaces:**
- Consumes: Task 1 event constants and payload interfaces
- Produces: `AgentStream`, `ToolCallEvent`, `ToolResultEvent` types; `agentStreams` Map in hook return; all existing return values preserved

- [ ] **Step 1: Add new types after existing interfaces**

After line 46 (`DebateYieldEvent` interface), add:

```typescript
export interface ToolCallEvent {
  tool: string;
  args: Record<string, unknown>;
  ts: number;
}

export interface ToolResultEvent {
  tool: string;
  result: string;
  ts: number;
  isError?: boolean;
}

export type AgentStreamStatus =
  | "thinking"
  | "calling_tool"
  | "writing"
  | "done";

export interface AgentStream {
  nodeId: string;
  agentName: string;
  status: AgentStreamStatus;
  toolCalls: ToolCallEvent[];
  toolResults: Map<string, ToolResultEvent>;
  conclusion: string;
  reasoning: string;
  finding: Finding | null;
  startedAt: number;
}
```

- [ ] **Step 2: Add agentStreams state to the hook**

After line 56 (`const [yields, ...]`), add:

```typescript
  const [agentStreams, setAgentStreams] = useState<
    Map<string, AgentStream>
  >(new Map());
```

- [ ] **Step 3: Add event listeners for agent:* events**

After the `DEBATE_YIELD` handler (after line 254), add:

```typescript
    // —— Agent-level granular events ——

    socket.on(WS_EVENTS.AGENT_THINKING, (payload: {
      nodeId: string;
      agentName: string;
    }) => {
      setAgentStreams((prev) => {
        const next = new Map(prev);
        if (!next.has(payload.nodeId)) {
          next.set(payload.nodeId, {
            nodeId: payload.nodeId,
            agentName: payload.agentName,
            status: "thinking",
            toolCalls: [],
            toolResults: new Map(),
            conclusion: "",
            reasoning: "",
            finding: null,
            startedAt: Date.now(),
          });
        } else {
          const existing = next.get(payload.nodeId)!;
          next.set(payload.nodeId, {
            ...existing,
            agentName: payload.agentName,
            status: "thinking",
          });
        }
        return next;
      });
    });

    socket.on(WS_EVENTS.AGENT_TOOL_CALL, (payload: {
      nodeId: string;
      agentName: string;
      tool: string;
      args: Record<string, unknown>;
      ts: number;
    }) => {
      setAgentStreams((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.nodeId);
        if (existing) {
          next.set(payload.nodeId, {
            ...existing,
            agentName: payload.agentName,
            status: "calling_tool",
            toolCalls: [
              ...existing.toolCalls,
              { tool: payload.tool, args: payload.args, ts: payload.ts },
            ],
          });
        }
        return next;
      });
    });

    socket.on(WS_EVENTS.AGENT_TOOL_RESULT, (payload: {
      nodeId: string;
      agentName: string;
      tool: string;
      result: string;
      ts: number;
    }) => {
      setAgentStreams((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.nodeId);
        if (existing) {
          const newResults = new Map(existing.toolResults);
          newResults.set(payload.tool, {
            tool: payload.tool,
            result: payload.result,
            ts: payload.ts,
          });
          next.set(payload.nodeId, {
            ...existing,
            toolResults: newResults,
          });
        }
        return next;
      });
    });

    socket.on(WS_EVENTS.AGENT_WRITING, (payload: {
      nodeId: string;
      agentName: string;
      conclusion: string;
      reasoning: string;
    }) => {
      setAgentStreams((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.nodeId);
        if (existing) {
          next.set(payload.nodeId, {
            ...existing,
            agentName: payload.agentName,
            status: "writing",
            conclusion: payload.conclusion,
            reasoning: payload.reasoning,
          });
        }
        return next;
      });
    });
```

- [ ] **Step 4: Update hook return value**

Replace line 270:

```typescript
  return { connected, findings, steps, nodes, debateRounds, yields, status };
```

with:

```typescript
  return { connected, findings, steps, nodes, debateRounds, yields, status, agentStreams };
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add hooks/useAnalysisSocket.ts
git commit -m "feat: add agentStreams state management to useAnalysisSocket"
```

---

### Task 9: Refactor AgentBubble for chat-bubble streaming UI

**Files:**
- Modify: `components/analysis/AgentBubble.tsx`

**Interfaces:**
- Consumes: `AgentStream` from Task 8; `ThinkingIndicator` from Task 5; `TypewriterText` from Task 6; `ToolCallCard` from Task 7
- Produces: Updated `<AgentBubble>` accepting `AgentStream`, with detail/simple toggle and animated reveal

- [ ] **Step 1: Rewrite AgentBubble**

Replace the entire file:

```typescript
"use client";
import { useState, useMemo } from "react";
import type { AgentStream } from "@/hooks/useAnalysisSocket";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { TypewriterText } from "./TypewriterText";
import { ToolCallCard } from "./ToolCallCard";

interface AgentBubbleProps {
  stream: AgentStream;
  /** Called when typewriter finishes and agent is fully done. */
  onRevealDone?: () => void;
}

export function AgentBubble({ stream, onRevealDone }: AgentBubbleProps) {
  const [showTools, setShowTools] = useState(true); // toggle: detail vs simple
  const [conclusionDone, setConclusionDone] = useState(false);
  const [reasoningDone, setReasoningDone] = useState(false);

  const isFullyDone = conclusionDone && (reasoningDone || !stream.reasoning);

  // Derive sentiment color from finding (if available)
  const sentimentColor = useMemo(() => {
    const s = stream.finding?.sentiment;
    if (!s) {
      // Default to a muted cyan while still writing, transition after
      return isFullyDone ? "border-l-zinc-600" : "border-l-zinc-700";
    }
    return s === "bullish"
      ? "border-l-blue-500"
      : s === "bearish"
        ? "border-l-red-500"
        : "border-l-zinc-500";
  }, [stream.finding, isFullyDone]);

  return (
    <div
      className={`bg-zinc-900/80 rounded-lg border-l-4 transition-all duration-700 ${sentimentColor}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="font-medium text-sm text-zinc-300">
          {stream.agentName}
        </span>
        <button
          type="button"
          onClick={() => setShowTools(!showTools)}
          className="text-xs text-zinc-600 hover:text-zinc-400 cursor-pointer transition-colors"
        >
          {showTools ? "隐藏过程 ▲" : "展开过程 ▼"}
        </button>
      </div>

      <div className="px-4 pb-2">
        {/* Thinking indicator */}
        {(stream.status === "thinking" || stream.status === "calling_tool") &&
          stream.conclusion === "" && <ThinkingIndicator />}

        {/* Tool calls */}
        {showTools && stream.toolCalls.length > 0 && (
          <div className="space-y-0.5 mb-2">
            {stream.toolCalls.map((tc) => {
              const tr = stream.toolResults.get(tc.tool);
              return (
                <ToolCallCard
                  key={`${tc.tool}-${tc.ts}`}
                  tool={tc.tool}
                  args={tc.args}
                  result={tr?.result}
                  ts={tc.ts}
                  isError={tr?.isError}
                  collapsed={stream.toolCalls.length > 6}
                />
              );
            })}
          </div>
        )}

        {/* Conclusion with typewriter */}
        {stream.conclusion && (
          <div className="my-2">
            <p className="text-xs text-zinc-600 mb-1">结论</p>
            <TypewriterText
              text={stream.conclusion}
              speed={40}
              onDone={() => setConclusionDone(true)}
              className="text-zinc-300 text-sm leading-relaxed"
            />
          </div>
        )}

        {/* Reasoning with typewriter */}
        {stream.reasoning && conclusionDone && (
          <div className="mt-2">
            <p className="text-xs text-zinc-600 mb-1">推理</p>
            <TypewriterText
              text={stream.reasoning}
              speed={50}
              onDone={() => setReasoningDone(true)}
              className="text-zinc-500 text-sm leading-relaxed"
            />
          </div>
        )}

        {/* Completion indicator */}
        {isFullyDone && stream.finding && (
          <div className="flex items-center gap-2 mt-2 text-xs text-zinc-600">
            <span>
              {stream.finding.sentiment}
            </span>
            <span>·</span>
            <span>
              {(stream.finding.confidence * 100).toFixed(0)}% 信心度
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors (there may be a complaint in LiveDebatePanel about the changed props — that's expected, Task 10 fixes it)

- [ ] **Step 3: Commit**

```bash
git add components/analysis/AgentBubble.tsx
git commit -m "feat: refactor AgentBubble for chat-bubble streaming with typewriter and tool cards"
```

---

### Task 10: Adapt LiveDebatePanel for agentStreams

**Files:**
- Modify: `components/analysis/LiveDebatePanel.tsx`

**Interfaces:**
- Consumes: `agentStreams` Map from Task 8 hook; refactored `AgentBubble` from Task 9
- Produces: Updated panel rendering agentStreams entries as AgentBubble components

- [ ] **Step 1: Rewrite LiveDebatePanel**

Replace the entire file:

```typescript
"use client";
import { AgentBubble } from "./AgentBubble";
import type { AgentStream } from "@/hooks/useAnalysisSocket";

interface LiveDebatePanelProps {
  agentStreams: Map<string, AgentStream>;
  /** Whether the analysis is still running (to show conn status). */
  isRunning?: boolean;
}

export function LiveDebatePanel({
  agentStreams,
  isRunning,
}: LiveDebatePanelProps) {
  const entries = Array.from(agentStreams.values());

  return (
    <div className="space-y-3 py-4">
      {entries.length === 0 && isRunning && (
        <p className="text-zinc-600 text-center py-8">
          等待 Agent 分析结果...
        </p>
      )}
      {entries.length === 0 && !isRunning && (
        <p className="text-zinc-600 text-center py-8">
          暂无分析数据
        </p>
      )}
      {entries.map((stream) => (
        <AgentBubble
          key={stream.nodeId}
          stream={stream}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors (there will be an error in client.tsx about changed props — Task 11 fixes it)

- [ ] **Step 3: Commit**

```bash
git add components/analysis/LiveDebatePanel.tsx
git commit -m "feat: adapt LiveDebatePanel to use agentStreams instead of findings array"
```

---

### Task 11: Adapt client.tsx for new data structures

**Files:**
- Modify: `app/analyze/[id]/client.tsx`

**Interfaces:**
- Consumes: Updated `useAnalysisSocket` return (with `agentStreams`); updated `LiveDebatePanel` props

- [ ] **Step 1: Update AnalysisLiveClient to pass agentStreams**

Replace lines 8, 15:

Line 8 — destructure `agentStreams`:

```typescript
  const { connected, findings, steps, nodes, agentStreams, status } =
    useAnalysisSocket(sessionId);
```

Line 14-15 — update LiveDebatePanel usage:

```typescript
      <LiveDebatePanel
        agentStreams={agentStreams}
        isRunning={status === "running"}
      />
```

Keep the rest of the file (judgeFinding, status indicators) unchanged.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add app/analyze/[id]/client.tsx
git commit -m "feat: wire agentStreams through AnalysisLiveClient"
```

---

### Task 12: Add CSS animations for new components

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `.dot-typing-bounce`, `.blink-cursor`, `.slide-in-right` CSS classes used by Tasks 5, 6, 7, 9

- [ ] **Step 1: Add new keyframes and utility classes**

Append to `app/globals.css`:

```css
/* ── Chat Bubble Typing Indicator ── */

@keyframes dot-typing-bounce {
  0%, 60%, 100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-6px);
    opacity: 1;
  }
}

.dot-typing-bounce {
  animation: dot-typing-bounce 1.2s ease-in-out infinite;
}

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  .dot-typing-bounce {
    animation: none;
    opacity: 0.6;
  }
}

/* ── Blinking Cursor ── */

@keyframes blink-cursor {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.blink-cursor {
  animation: blink-cursor 1s step-end infinite;
}

@media (prefers-reduced-motion: reduce) {
  .blink-cursor {
    animation: none;
    opacity: 1;
  }
}

/* ── Slide-in Right (for tool cards) ── */

@keyframes slide-in-right {
  from {
    transform: translateX(-8px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

- [ ] **Step 2: Verify the app builds**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds (may have warnings but no errors)

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add dot-typing, blink-cursor, slide-in-right CSS animations"
```

---

### Task 13: Update hook tests for new events

**Files:**
- Modify: `hooks/useAnalysisSocket.test.ts`

**Interfaces:**
- Consumes: New event constants and state from Task 8

- [ ] **Step 1: Add test for agent:thinking initializes agentStream**

After the existing "step:error (no-op)" test (after line 294), add:

```typescript
  // --- agent:thinking ---

  it("initializes agentStream on agent:thinking", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    act(() => {
      getHandler("agent:thinking")({
        nodeId: "bull-analysis",
        agentName: "technical-analyst",
      });
    });

    const stream = result.current.agentStreams.get("bull-analysis");
    expect(stream).toBeDefined();
    expect(stream!.agentName).toBe("technical-analyst");
    expect(stream!.status).toBe("thinking");
    expect(stream!.toolCalls).toEqual([]);
  });

  // --- agent:tool_call ---

  it("appends tool call to agentStream on agent:tool_call", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    act(() => {
      getHandler("agent:thinking")({
        nodeId: "bull-analysis",
        agentName: "technical-analyst",
      });
    });

    act(() => {
      getHandler("agent:tool_call")({
        nodeId: "bull-analysis",
        agentName: "technical-analyst",
        tool: "get_kline",
        args: { code: "600519", period: "day" },
        ts: 1000,
      });
    });

    const stream = result.current.agentStreams.get("bull-analysis");
    expect(stream!.status).toBe("calling_tool");
    expect(stream!.toolCalls).toHaveLength(1);
    expect(stream!.toolCalls[0].tool).toBe("get_kline");
  });

  // --- agent:tool_result ---

  it("stores tool result on agent:tool_result", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    act(() => {
      getHandler("agent:thinking")({
        nodeId: "bull-analysis",
        agentName: "technical-analyst",
      });
    });

    act(() => {
      getHandler("agent:tool_call")({
        nodeId: "bull-analysis",
        agentName: "technical-analyst",
        tool: "get_kline",
        args: {},
        ts: 1000,
      });
    });

    act(() => {
      getHandler("agent:tool_result")({
        nodeId: "bull-analysis",
        agentName: "technical-analyst",
        tool: "get_kline",
        result: '{"data": [1,2,3]}',
        ts: 2000,
      });
    });

    const stream = result.current.agentStreams.get("bull-analysis");
    const tr = stream!.toolResults.get("get_kline");
    expect(tr).toBeDefined();
    expect(tr!.result).toBe('{"data": [1,2,3]}');
  });

  // --- agent:writing ---

  it("sets conclusion and reasoning on agent:writing", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    act(() => {
      getHandler("agent:thinking")({
        nodeId: "bull-analysis",
        agentName: "technical-analyst",
      });
    });

    act(() => {
      getHandler("agent:writing")({
        nodeId: "bull-analysis",
        agentName: "technical-analyst",
        conclusion: "该股短期内存在技术性反弹机会。",
        reasoning: "从多维度来看，均线呈多头排列。",
      });
    });

    const stream = result.current.agentStreams.get("bull-analysis");
    expect(stream!.status).toBe("writing");
    expect(stream!.conclusion).toBe("该股短期内存在技术性反弹机会。");
    expect(stream!.reasoning).toBe("从多维度来看，均线呈多头排列。");
  });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run hooks/useAnalysisSocket.test.ts 2>&1`
Expected: All tests pass (existing + new)

- [ ] **Step 3: Commit**

```bash
git add hooks/useAnalysisSocket.test.ts
git commit -m "test: add agent stream event tests (thinking, tool_call, tool_result, writing)"
```

---

### Task 14: Integration verification

**Files:**
- No file changes; verify end-to-end works

- [ ] **Step 1: Build the full project**

Run: `npx next build 2>&1 | tail -20`
Expected: Successful build

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run 2>&1`
Expected: All tests pass

- [ ] **Step 3: Start dev server and manually verify**

Run: `npm run dev`
Then open `/analyze`, start an analysis, and verify:
- Agent cards appear one by one with slide-in animation
- Thinking dots show before tool calls
- Tool calls appear in real-time with icons
- Hovering over tool result shows full JSON
- Conclusion text types out character by character
- Blinking cursor visible during typewriter
- Toggle "隐藏过程" / "展开过程" works
- Final sentiment badge shows when typewriter completes

- [ ] **Step 4: Final commit if any tweaks needed**

```bash
git add -A
git commit -m "chore: integration verification and final polish"
```
