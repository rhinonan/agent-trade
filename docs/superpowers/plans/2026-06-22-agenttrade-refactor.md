# AgentTrade Architecture Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge 6 TypeScript packages + NestJS server + Vue SPA into a single Next.js SSR application with React + shadcn/ui, Socket.IO real-time, and extract Python data service to a separate repo.

**Architecture:** Single Next.js App Router application with custom server for Socket.IO. All engine/agent/workflow logic lives in `lib/`. Python `d2-data` extracted to independent repository, consumed via HTTP from `lib/data/`.

**Tech Stack:** Next.js (App Router), React 18, TypeScript 5.x strict, shadcn/ui + Tailwind CSS 4, Socket.IO, LangChain.js, SQLite (better-sqlite3), Vitest

## Global Constraints

- TypeScript `strict: true`, ESM (`"type": "module"`), no `any` without explicit cast
- ExecutionContext is immutable — `addFinding()`, `addDebateRound()` return new objects
- LLM calls always through `createLLM()` abstraction, never direct SDK calls
- Python service is pure data layer, no agent logic
- Socket.IO namespace: `/analysis`, events: `analysis:start`, `step:start`, `step:complete`, `analysis:complete`, `step:error`, `analysis:error`
- Agent registration at server startup, not filesystem discovery
- All existing type interfaces preserved: `BaseAgent`, `Analysis`, `ExecutionContext`, `WorkflowDAG`, `WorkflowStep`, `Finding`, `DebateRound`, `AgentRegistry`, `WorkflowScheduler`

---

### Task 1: Scaffold Next.js project

**Files:**
- Create: `nextjs-app/package.json`
- Create: `nextjs-app/tsconfig.json`
- Create: `nextjs-app/next.config.ts`
- Create: `nextjs-app/tailwind.config.ts`
- Create: `nextjs-app/postcss.config.mjs`
- Create: `nextjs-app/vitest.config.ts`
- Modify: `agenttrade/package.json` (root — add workspace reference)

**Interfaces:**
- Consumes: nothing (fresh scaffold)
- Produces: Next.js project at `nextjs-app/` compiled via `pnpm dev`, Tailwind CSS 4 working, Vitest ready

- [ ] **Step 1: Create nextjs-app/package.json**

```json
{
  "name": "agenttrade",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node server.mjs",
    "build": "next build && tsc",
    "start": "NODE_ENV=production node server.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@langchain/anthropic": "^0.3.34",
    "@langchain/core": "^0.3.0",
    "@langchain/openai": "^0.3.17",
    "better-sqlite3": "^11.0.0",
    "class-validator": "^0.14.1",
    "dotenv": "^17.4.2",
    "langchain": "^0.3.0",
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "socket.io": "^4.8.0",
    "socket.io-client": "^4.8.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.0.0",
    "@testing-library/react": "^16.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.0.0",
    "jsdom": "^25.0.0",
    "postcss": "^8.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create nextjs-app/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "jsx": "preserve",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noEmit": true,
    "paths": { "@/*": ["./*"] },
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create nextjs-app/next.config.ts**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 4: Create nextjs-app/vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
```

- [ ] **Step 5: Create tailwind and postcss configs**

```bash
mkdir -p nextjs-app/app
cat > nextjs-app/postcss.config.mjs << 'EOF'
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
EOF
```

- [ ] **Step 6: Create nextjs-app/app/globals.css with Tailwind**

```css
@import "tailwindcss";
```

- [ ] **Step 7: Create minimal app/layout.tsx and app/page.tsx to verify scaffold works**

Create `nextjs-app/app/layout.tsx`:
```typescript
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "AgentTrade", description: "多Agent对抗行情分析" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
```

Create `nextjs-app/app/page.tsx`:
```typescript
export default function HomePage() {
  return <main className="flex min-h-screen items-center justify-center"><h1 className="text-4xl font-bold">AgentTrade</h1></main>;
}
```

- [ ] **Step 8: Install and verify**

```bash
cd nextjs-app && pnpm install && pnpm next dev --port 3000 &
# Open http://localhost:3000 — should show "AgentTrade"
```

- [ ] **Step 9: Commit**

```bash
cd nextjs-app
git add package.json tsconfig.json next.config.ts vitest.config.ts postcss.config.mjs app/
git commit -m "feat: scaffold Next.js project with Tailwind CSS 4"
```

---

### Task 2: Core types (`lib/engine/types.ts`)

**Files:**
- Create: `nextjs-app/lib/engine/types.ts`
- Create: `nextjs-app/lib/engine/__tests__/types.test.ts`

**Interfaces:**
- Produces: `Capability`, `AgentPersona`, `Analysis`, `BaseAgent`, `PrimitiveType`, `AgentMatch`, `AgentCount`, `WorkflowStep`, `WorkflowDAG`, `Finding`, `DebateRound`, `ExecutionContext`, `AnalysisTarget`, `TargetType`

- [ ] **Step 1: Write the test**

Create `nextjs-app/lib/engine/__tests__/types.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import type { Analysis, ExecutionContext, Finding, WorkflowDAG } from "../types.js";

describe("types (compile-time verification)", () => {
  it("Analysis has required fields", () => {
    const analysis: Analysis = {
      conclusion: "买入",
      confidence: 0.85,
      sentiment: "bullish",
      reasoning: ["理由1", "理由2"],
    };
    expect(analysis.conclusion).toBe("买入");
    expect(analysis.confidence).toBeGreaterThan(0.5);
  });

  it("ExecutionContext is structurally correct", () => {
    const ctx: ExecutionContext = {
      target: { type: "stock", code: "600519", name: "贵州茅台" },
      task: "分析贵州茅台",
      findings: [],
      debateRounds: [],
      workflowName: "bull-bear",
      startedAt: Date.now(),
    };
    expect(ctx.target.type).toBe("stock");
    expect(ctx.findings).toHaveLength(0);
  });

  it("WorkflowDAG has steps", () => {
    const dag: WorkflowDAG = {
      name: "test",
      version: "1",
      steps: [{ id: "step1", type: "analyze", prompt: "测试" }],
    };
    expect(dag.steps).toHaveLength(1);
    expect(dag.steps[0].type).toBe("analyze");
  });
});
```

- [ ] **Step 2: Verify test fails (module not found)**

```bash
cd nextjs-app && pnpm vitest run lib/engine/__tests__/types.test.ts
# Expected: FAIL — cannot find module "../types.js"
```

- [ ] **Step 3: Create `nextjs-app/lib/engine/types.ts`**

```typescript
import type { StructuredTool } from "@langchain/core/tools";

// ——— Analysis Target ———
export type TargetType = "stock" | "sector" | "index";

export interface AnalysisTarget {
  type: TargetType;
  code: string;
  name?: string;
}

// ——— Agent ———
export type Capability = string;

export interface AgentPersona {
  stance: "bullish" | "bearish" | "neutral";
  style?: "aggressive" | "balanced" | "conservative" | "optimistic" | "skeptical";
  description?: string;
}

export interface Analysis {
  conclusion: string;
  confidence: number;   // 0–1
  sentiment: "bullish" | "bearish" | "neutral";
  reasoning: string[];
  rawOutput?: string;
}

export interface BaseAgent {
  id: string;
  name: string;
  capabilities: Capability[];
  personality: AgentPersona;
  tools: StructuredTool[];

  analyze(context: ExecutionContext): Promise<Analysis>;

  canCritique?: boolean;
  canDebate?: boolean;
}

// ——— Workflow ———
export type PrimitiveType =
  | "analyze" | "panel" | "critique" | "debate"
  | "vote" | "synthesize" | "parallel" | "sequential";

export interface AgentMatch {
  id?: string;
  capability?: string;
  not?: string[];
}

export interface AgentCount {
  min?: number;
  max?: number;
}

export interface WorkflowStep {
  id: string;
  type: PrimitiveType;
  prompt?: string;
  agent?: AgentMatch | AgentMatch[];
  match?: AgentMatch;
  count?: AgentCount | "all";
  targetStep?: string;
  reviewer?: string;
  maxRounds?: number;
  children?: WorkflowStep[];
  next?: string[];
}

export interface WorkflowDAG {
  name: string;
  version: string;
  description?: string;
  steps: WorkflowStep[];
}

export interface Finding {
  step: string;
  agent: string;
  analysis: Analysis;
  timestamp: number;
}

export interface DebateRound {
  round: number;
  entries: {
    agent: string;
    argument: string;
    target?: string;
  }[];
}

export interface ExecutionContext {
  target: AnalysisTarget;
  task: string;
  findings: Finding[];
  debateRounds: DebateRound[];
  workflowName: string;
  startedAt: number;
}
```

- [ ] **Step 4: Run tests**

```bash
cd nextjs-app && pnpm vitest run lib/engine/__tests__/types.test.ts
# Expected: PASS
```

- [ ] **Step 5: Commit**

```bash
git add lib/engine/types.ts lib/engine/__tests__/types.test.ts
git commit -m "feat: add core engine types"
```

---

### Task 3: Agent Registry

**Files:**
- Create: `nextjs-app/lib/engine/registry.ts`
- Create: `nextjs-app/lib/engine/__tests__/registry.test.ts`

**Interfaces:**
- Produces: `AgentRegistry` class with `register(agent)`, `get(id)`, `list()`, `match(match, count?)`, `clear()`, `size`
- Consumes: `BaseAgent`, `AgentMatch`, `AgentCount` from `lib/engine/types.ts`

- [ ] **Step 1: Write the failing test**

Create `nextjs-app/lib/engine/__tests__/registry.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { AgentRegistry } from "../registry.js";
import type { BaseAgent, ExecutionContext } from "../types.js";

function fakeAgent(overrides: Partial<BaseAgent> = {}): BaseAgent {
  return {
    id: "test-1",
    name: "Test Agent",
    capabilities: ["technical"],
    personality: { stance: "neutral" },
    tools: [],
    async analyze(_ctx: ExecutionContext) {
      return { conclusion: "OK", confidence: 0.5, sentiment: "neutral", reasoning: [] };
    },
    ...overrides,
  };
}

describe("AgentRegistry", () => {
  let registry: AgentRegistry;

  beforeEach(() => { registry = new AgentRegistry(); });

  it("registers and retrieves an agent", () => {
    registry.register(fakeAgent());
    expect(registry.get("test-1")!.name).toBe("Test Agent");
  });

  it("throws on duplicate registration", () => {
    registry.register(fakeAgent());
    expect(() => registry.register(fakeAgent())).toThrow("already registered");
  });

  it("lists all agents", () => {
    registry.register(fakeAgent({ id: "a" }));
    registry.register(fakeAgent({ id: "b" }));
    expect(registry.list()).toHaveLength(2);
  });

  it("matches by id", () => {
    registry.register(fakeAgent({ id: "my-id" }));
    const result = registry.match({ id: "my-id" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("my-id");
  });

  it("matches by capability", () => {
    registry.register(fakeAgent({ id: "tech", capabilities: ["technical"] }));
    registry.register(fakeAgent({ id: "fund", capabilities: ["fundamental"] }));
    const result = registry.match({ capability: "technical" });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("tech");
  });

  it("excludes agents via 'not' filter", () => {
    registry.register(fakeAgent({ id: "tech", capabilities: ["technical"] }));
    registry.register(fakeAgent({ id: "fund", capabilities: ["fundamental"] }));
    const result = registry.match({ capability: "technical", not: ["fundamental"] });
    expect(result).toHaveLength(1);
  });

  it("returns empty array for unknown id", () => {
    expect(registry.match({ id: "nope" })).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Verify test fails**

```bash
cd nextjs-app && pnpm vitest run lib/engine/__tests__/registry.test.ts
# Expected: FAIL — cannot find module "../registry.js"
```

- [ ] **Step 3: Create `nextjs-app/lib/engine/registry.ts`** (port from `packages/core/src/agent/registry.ts`)

```typescript
import type { BaseAgent, AgentMatch, AgentCount } from "./types.js";

export class AgentRegistry {
  private agents = new Map<string, BaseAgent>();

  register(agent: BaseAgent): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent "${agent.id}" is already registered`);
    }
    this.agents.set(agent.id, agent);
  }

  get(id: string): BaseAgent | undefined {
    return this.agents.get(id);
  }

  list(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  match(match: AgentMatch, count?: AgentCount | "all"): BaseAgent[] {
    let candidates = this.list();

    if (match.id) {
      const agent = this.agents.get(match.id);
      return agent ? [agent] : [];
    }

    if (match.capability) {
      candidates = candidates.filter(a =>
        a.capabilities.some(c =>
          c.toLowerCase().includes(match.capability!.toLowerCase())
        )
      );
    }

    if (match.not) {
      candidates = candidates.filter(a =>
        !match.not!.some(exclude =>
          a.capabilities.some(c => c.toLowerCase() === exclude.toLowerCase()) ||
          a.id === exclude
        )
      );
    }

    if (count === "all") return candidates;

    const min = count?.min ?? 1;
    const max = count?.max ?? candidates.length;
    const n = Math.max(min, Math.min(max, candidates.length));
    return candidates.slice(0, n);
  }

  clear(): void {
    this.agents.clear();
  }

  get size(): number {
    return this.agents.size;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd nextjs-app && pnpm vitest run lib/engine/__tests__/registry.test.ts
# Expected: all PASS
```

- [ ] **Step 5: Commit**

```bash
git add lib/engine/registry.ts lib/engine/__tests__/registry.test.ts
git commit -m "feat: port AgentRegistry"
```

---

### Task 4: LLM abstraction layer

**Files:**
- Create: `nextjs-app/lib/llm/create-llm.ts`
- Create: `nextjs-app/lib/llm/parse.ts`
- Create: `nextjs-app/lib/llm/__tests__/llm.test.ts`

**Interfaces:**
- Produces: `LLMProvider` type, `AnalyzeOptions` interface, `createLLM(options?) → BaseChatModel`, `setDefaultLLMProvider(provider)`, `parseLLMJson(text) → unknown`, `parseSentiment(value) → Sentiment`
- Consumes: `@langchain/anthropic`, `@langchain/openai`, `@langchain/core`

- [ ] **Step 1: Write the test**

Create `nextjs-app/lib/llm/__tests__/llm.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { parseLLMJson, parseSentiment } from "../parse.js";

describe("parseLLMJson", () => {
  it("parses ```json fenced block", () => {
    const result = parseLLMJson('```json\n{"key":"value"}\n```');
    expect(result).toEqual({ key: "value" });
  });

  it("parses ``` fenced block (no json tag)", () => {
    const result = parseLLMJson('```\n{"x":1}\n```');
    expect(result).toEqual({ x: 1 });
  });

  it("falls back to raw JSON", () => {
    const result = parseLLMJson('{"a": 42}');
    expect(result).toEqual({ a: 42 });
  });

  it("throws on invalid JSON", () => {
    expect(() => parseLLMJson("not json")).toThrow();
  });
});

describe("parseSentiment", () => {
  it("parses bullish", () => expect(parseSentiment("bullish")).toBe("bullish"));
  it("parses bearish", () => expect(parseSentiment("bearish")).toBe("bearish"));
  it("parses neutral", () => expect(parseSentiment("neutral")).toBe("neutral"));
  it("defaults to neutral for unknown", () => {
    expect(parseSentiment("unknown")).toBe("neutral");
    expect(parseSentiment(null)).toBe("neutral");
    expect(parseSentiment(42)).toBe("neutral");
  });
});
```

- [ ] **Step 2: Verify test fails**

```bash
cd nextjs-app && pnpm vitest run lib/llm/__tests__/llm.test.ts
# Expected: FAIL — module not found
```

- [ ] **Step 3: Create `nextjs-app/lib/llm/create-llm.ts`** (port from `packages/core/src/workflow/primitives/llm.ts`)

```typescript
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type LLMProvider = "anthropic" | "openai" | "deepseek";

export interface AnalyzeOptions {
  provider?: LLMProvider;
  modelName?: string;
  llm?: BaseChatModel; // override — used in tests
}

let _defaultProvider: LLMProvider = "anthropic";

export function setDefaultLLMProvider(provider: LLMProvider): void {
  _defaultProvider = provider;
}

export function createLLM(options: AnalyzeOptions = {}): BaseChatModel {
  if (options.llm) return options.llm;
  const provider = options.provider ?? _defaultProvider;
  if (provider === "deepseek") {
    return new ChatOpenAI({
      model: options.modelName ?? "deepseek-chat",
      configuration: { baseURL: "https://api.deepseek.com/v1" },
    });
  }
  if (provider === "openai") {
    return new ChatOpenAI({ model: options.modelName ?? "gpt-4o" });
  }
  return new ChatAnthropic({ model: options.modelName ?? "claude-sonnet-4-6" });
}
```

- [ ] **Step 4: Create `nextjs-app/lib/llm/parse.ts`**

```typescript
export function parseLLMJson(text: string): unknown {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
  return JSON.parse(jsonStr);
}

export type Sentiment = "bullish" | "bearish" | "neutral";

const VALID_SENTIMENTS = new Set(["bullish", "bearish", "neutral"]);

export function parseSentiment(value: unknown): Sentiment {
  if (typeof value === "string" && VALID_SENTIMENTS.has(value)) {
    return value as Sentiment;
  }
  return "neutral";
}
```

- [ ] **Step 5: Run tests**

```bash
cd nextjs-app && pnpm vitest run lib/llm/__tests__/llm.test.ts
# Expected: all PASS
```

- [ ] **Step 6: Commit**

```bash
git add lib/llm/create-llm.ts lib/llm/parse.ts lib/llm/__tests__/llm.test.ts
git commit -m "feat: port LLM abstraction layer"
```

---

### Task 5: ExecutionContext

**Files:**
- Create: `nextjs-app/lib/engine/context.ts`
- Create: `nextjs-app/lib/engine/__tests__/context.test.ts`

**Interfaces:**
- Produces: `createContext(target, task, workflowName?) → ExecutionContext`, `addFinding(ctx, step, agent, analysis) → ExecutionContext`, `addDebateRound(ctx, round) → ExecutionContext`, `getAgentFindings(ctx, agentId) → Finding[]`, `getStepFindings(ctx, stepId) → Finding[]`, `getLatestFinding(ctx) → Finding | undefined`
- Consumes: types from `lib/engine/types.ts`

- [ ] **Step 1: Write the test**

Create `nextjs-app/lib/engine/__tests__/context.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
  createContext, addFinding, addDebateRound,
  getAgentFindings, getStepFindings, getLatestFinding,
} from "../context.js";

describe("ExecutionContext", () => {
  const target = { type: "stock" as const, code: "600519", name: "茅台" };

  it("creates an empty context", () => {
    const ctx = createContext(target, "分析茅台", "test-wf");
    expect(ctx.target.code).toBe("600519");
    expect(ctx.task).toBe("分析茅台");
    expect(ctx.findings).toHaveLength(0);
    expect(ctx.debateRounds).toHaveLength(0);
    expect(ctx.workflowName).toBe("test-wf");
  });

  it("addFinding returns new object (immutability)", () => {
    const ctx = createContext(target, "test");
    const ctx2 = addFinding(ctx, "step1", "agent1", {
      conclusion: "看涨", confidence: 0.9, sentiment: "bullish", reasoning: ["理由"],
    });
    expect(ctx.findings).toHaveLength(0); // original unchanged
    expect(ctx2.findings).toHaveLength(1);
    expect(ctx2.findings[0].step).toBe("step1");
  });

  it("addDebateRound returns new object", () => {
    const ctx = createContext(target, "test");
    const ctx2 = addDebateRound(ctx, {
      round: 1,
      entries: [{ agent: "bull", argument: "看多" }, { agent: "bear", argument: "看空" }],
    });
    expect(ctx.debateRounds).toHaveLength(0);
    expect(ctx2.debateRounds).toHaveLength(1);
  });

  it("getAgentFindings filters correctly", () => {
    let ctx = createContext(target, "test");
    ctx = addFinding(ctx, "s1", "agent-a", { conclusion: "a", confidence: 0.5, sentiment: "neutral", reasoning: [] });
    ctx = addFinding(ctx, "s2", "agent-b", { conclusion: "b", confidence: 0.5, sentiment: "neutral", reasoning: [] });
    expect(getAgentFindings(ctx, "agent-a")).toHaveLength(1);
    expect(getAgentFindings(ctx, "agent-c")).toHaveLength(0);
  });

  it("getStepFindings filters by step", () => {
    let ctx = createContext(target, "test");
    ctx = addFinding(ctx, "step-x", "a", { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] });
    expect(getStepFindings(ctx, "step-x")).toHaveLength(1);
    expect(getStepFindings(ctx, "step-y")).toHaveLength(0);
  });

  it("getLatestFinding returns last finding", () => {
    let ctx = createContext(target, "test");
    expect(getLatestFinding(ctx)).toBeUndefined();
    ctx = addFinding(ctx, "s1", "a", { conclusion: "first", confidence: 0.5, sentiment: "neutral", reasoning: [] });
    ctx = addFinding(ctx, "s2", "b", { conclusion: "last", confidence: 0.5, sentiment: "neutral", reasoning: [] });
    expect(getLatestFinding(ctx)!.analysis.conclusion).toBe("last");
  });
});
```

- [ ] **Step 2: Verify test fails**

```bash
cd nextjs-app && pnpm vitest run lib/engine/__tests__/context.test.ts
# Expected: FAIL
```

- [ ] **Step 3: Create `nextjs-app/lib/engine/context.ts`** (port from `packages/core/src/workflow/context.ts`)

```typescript
import type { AnalysisTarget, ExecutionContext, Finding, DebateRound, Analysis } from "./types.js";

export function createContext(
  target: AnalysisTarget,
  task: string,
  workflowName = "unknown",
): ExecutionContext {
  return {
    target,
    task,
    findings: [],
    debateRounds: [],
    workflowName,
    startedAt: Date.now(),
  };
}

export function addFinding(
  ctx: ExecutionContext,
  step: string,
  agent: string,
  analysis: Analysis,
): ExecutionContext {
  const finding: Finding = { step, agent, analysis, timestamp: Date.now() };
  return { ...ctx, findings: [...ctx.findings, finding] };
}

export function addDebateRound(
  ctx: ExecutionContext,
  round: DebateRound,
): ExecutionContext {
  return { ...ctx, debateRounds: [...ctx.debateRounds, round] };
}

export function getAgentFindings(ctx: ExecutionContext, agentId: string): Finding[] {
  return ctx.findings.filter(f => f.agent === agentId);
}

export function getStepFindings(ctx: ExecutionContext, stepId: string): Finding[] {
  return ctx.findings.filter(f => f.step === stepId);
}

export function getLatestFinding(ctx: ExecutionContext): Finding | undefined {
  return ctx.findings.at(-1);
}
```

- [ ] **Step 4: Run tests**

```bash
cd nextjs-app && pnpm vitest run lib/engine/__tests__/context.test.ts
# Expected: all PASS
```

- [ ] **Step 5: Commit**

```bash
git add lib/engine/context.ts lib/engine/__tests__/context.test.ts
git commit -m "feat: port ExecutionContext (immutable)"
```

---

### Task 6: Analyze primitive

**Files:**
- Create: `nextjs-app/lib/engine/primitives/analyze.ts`
- Create: `nextjs-app/lib/engine/primitives/__tests__/analyze.test.ts`

**Interfaces:**
- Produces: `executeAnalyze(step, registry, context, options?) → Promise<ExecutionContext>`
- Consumes: `AgentRegistry` from `lib/engine/registry.ts`, `addFinding` from `lib/engine/context.ts`, `createLLM`/`parseLLMJson`/`parseSentiment` from `lib/llm/`

- [ ] **Step 1: Write the test**

Create `nextjs-app/lib/engine/primitives/__tests__/analyze.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { AgentRegistry } from "../../registry.js";
import { createContext } from "../../context.js";
import { executeAnalyze } from "../analyze.js";
import type { BaseAgent, ExecutionContext, WorkflowStep, Analysis } from "../../types.js";

class FakeChatModel {
  async invoke(_messages: HumanMessage[]) {
    return { content: '{"conclusion":"看涨信号强烈","confidence":0.85,"sentiment":"bullish","reasoning":["MACD金叉","放量突破","均线多头"]}' };
  }
}

function fakeAgent(overrides: Partial<BaseAgent> = {}): BaseAgent {
  return {
    id: "test-bull",
    name: "Test Bull",
    capabilities: ["technical", "bullish"],
    personality: { stance: "bullish" },
    tools: [],
    async analyze(_ctx: ExecutionContext): Promise<Analysis> {
      return { conclusion: "看涨", confidence: 0.7, sentiment: "bullish", reasoning: [] };
    },
    ...overrides,
  };
}

describe("executeAnalyze", () => {
  it("produces a finding from an agent matched by capability", async () => {
    const registry = new AgentRegistry();
    registry.register(fakeAgent());

    const ctx = createContext(
      { type: "stock", code: "600519", name: "茅台" },
      "分析茅台",
    );

    const step: WorkflowStep = {
      id: "bull-step",
      type: "analyze",
      agent: { capability: "bullish" },
      prompt: "从技术面看多 {target}",
    };

    const result = await executeAnalyze(step, registry, ctx, {
      llm: new FakeChatModel() as any,
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].step).toBe("bull-step");
    expect(result.findings[0].agent).toBe("test-bull");
    expect(result.findings[0].analysis.sentiment).toBe("bullish");
    expect(result.findings[0].analysis.confidence).toBeGreaterThan(0);
  });

  it("replaces {target} placeholder in prompt", async () => {
    const registry = new AgentRegistry();
    // Use a custom agent that captures the prompt for verification
    let capturedContent = "";
    class CapturingModel {
      async invoke(msgs: HumanMessage[]) {
        capturedContent = typeof msgs[1].content === "string" ? msgs[1].content as string : "";
        return { content: '{"conclusion":"ok","confidence":0.5,"sentiment":"neutral","reasoning":["test"]}' };
      }
    }

    registry.register(fakeAgent({ id: "capture" }));

    const step: WorkflowStep = {
      id: "s1", type: "analyze",
      agent: { id: "capture" },
      prompt: "分析 {target}",
    };

    await executeAnalyze(step, registry, createContext(
      { type: "stock", code: "600519", name: "茅台" },
      "test",
    ), { llm: new CapturingModel() as any });

    expect(capturedContent).toContain("茅台");
  });

  it("throws when no agent matches", async () => {
    const registry = new AgentRegistry();
    const step: WorkflowStep = {
      id: "s1", type: "analyze",
      agent: { capability: "nonexistent" },
    };
    await expect(
      executeAnalyze(step, registry, createContext({ type: "stock", code: "x" }, "test"))
    ).rejects.toThrow("No agent found");
  });
});
```

- [ ] **Step 2: Verify test fails**

```bash
cd nextjs-app && pnpm vitest run lib/engine/primitives/__tests__/analyze.test.ts
# Expected: FAIL — module not found
```

- [ ] **Step 3: Create `nextjs-app/lib/engine/primitives/analyze.ts`** (port from `packages/core/src/workflow/primitives/analyze.ts`)

```typescript
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentRegistry } from "../registry.js";
import type { ExecutionContext, WorkflowStep, Analysis } from "../types.js";
import { addFinding } from "../context.js";
import { createLLM, parseLLMJson, parseSentiment, type AnalyzeOptions } from "../../llm/create-llm.js";

export async function executeAnalyze(
  step: WorkflowStep,
  registry: AgentRegistry,
  context: ExecutionContext,
  options: AnalyzeOptions = {},
): Promise<ExecutionContext> {
  const match = step.agent as { id?: string; capability?: string } | undefined;
  if (!match) throw new Error(`Analyze step "${step.id}" requires an agent match`);

  const agents = registry.match(match as any, { min: 1, max: 1 });
  if (agents.length === 0) {
    throw new Error(`No agent found for step "${step.id}" matching ${JSON.stringify(match)}`);
  }
  const agent = agents[0];

  const prompt = (step.prompt ?? "分析 {target}")
    .replace("{target}", context.target.name ?? context.target.code);

  const llm = createLLM(options);
  const messages = [
    new SystemMessage(buildSystemPrompt(agent.personality.stance)),
    new HumanMessage(formatPromptWithContext(prompt, context)),
  ];

  const response = await llm.invoke(messages);
  const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  const analysis = parseAnalysis(text, agent.id);

  return addFinding(context, step.id, agent.id, analysis);
}

function buildSystemPrompt(stance: string): string {
  const stanceGuide: Record<string, string> = {
    bullish: "你是一个乐观的分析师，倾向于寻找积极因素和上涨信号。",
    bearish: "你是一个谨慎的分析师，倾向于寻找风险因素和下跌信号。",
    neutral: "你是一个客观的分析师，平衡考虑多空因素。",
  };
  return `${stanceGuide[stance] ?? stanceGuide.neutral}
请用中文回复。输出JSON格式：{"conclusion":"结论","confidence":0.0-1.0,"sentiment":"bullish|bearish|neutral","reasoning":["理由1","理由2","理由3"]}`;
}

function formatPromptWithContext(prompt: string, context: ExecutionContext): string {
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

function parseAnalysis(text: string, _agentId: string): Analysis {
  try {
    const parsed = parseLLMJson(text) as Record<string, unknown>;
    return {
      conclusion: (parsed.conclusion as string) ?? "无法解析",
      confidence: Math.max(0, Math.min(1, (parsed.confidence as number) ?? 0.5)),
      sentiment: parseSentiment(parsed.sentiment),
      reasoning: Array.isArray(parsed.reasoning) ? (parsed.reasoning as string[]) : [(parsed.reasoning as string) ?? ""],
      rawOutput: text,
    };
  } catch {
    return {
      conclusion: text.slice(0, 100),
      confidence: 0.5,
      sentiment: "neutral",
      reasoning: ["无法解析LLM输出为JSON"],
      rawOutput: text,
    };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd nextjs-app && pnpm vitest run lib/engine/primitives/__tests__/analyze.test.ts
# Expected: all PASS
```

- [ ] **Step 5: Commit**

```bash
git add lib/engine/primitives/analyze.ts lib/engine/primitives/__tests__/analyze.test.ts
git commit -m "feat: port analyze primitive with FakeChatModel test"
```

---

### Task 7: Remaining primitives (critique, debate, panel, synthesize, vote)

**Files:**
- Create: `nextjs-app/lib/engine/primitives/critique.ts`
- Create: `nextjs-app/lib/engine/primitives/debate.ts`
- Create: `nextjs-app/lib/engine/primitives/panel.ts`
- Create: `nextjs-app/lib/engine/primitives/synthesize.ts`
- Create: `nextjs-app/lib/engine/primitives/vote.ts`
- Create: `nextjs-app/lib/engine/primitives/__tests__/primitives.test.ts`

**Interfaces:**
- Produces: `executeCritique(step, registry, context, options?) → Promise<ExecutionContext>`, `executeDebate(...)`, `executePanel(...)`, `executeSynthesize(...)`, `executeVote(...)`
- Consumes: same dependencies as analyze primitive

- [ ] **Step 1: Write the test**

Create `nextjs-app/lib/engine/primitives/__tests__/primitives.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../../registry.js";
import { createContext } from "../../context.js";
import { executeCritique } from "../critique.js";
import { executeSynthesize } from "../synthesize.js";
import type { BaseAgent, ExecutionContext, Analysis } from "../../types.js";

class FakeModel {
  async invoke() {
    return { content: '{"conclusion":"评定: 多空双方均有道理","confidence":0.6,"sentiment":"neutral","reasoning":["综合判断"]}' };
  }
}

function agent(id: string, stance: "bullish" | "bearish" | "neutral" = "neutral"): BaseAgent {
  return {
    id, name: id,
    capabilities: [stance, "judge"],
    personality: { stance },
    tools: [],
    async analyze(_ctx: ExecutionContext): Promise<Analysis> {
      return { conclusion: `${id}结论`, confidence: 0.7, sentiment: stance, reasoning: ["理由"] };
    },
    canCritique: true,
  };
}

describe("executeCritique", () => {
  it("critiques a target step's finding", async () => {
    const registry = new AgentRegistry();
    registry.register(agent("reviewer", "bearish"));

    // First add a finding to critique
    let ctx = createContext({ type: "stock", code: "600519" }, "分析");
    ctx = {
      ...ctx,
      findings: [{
        step: "bull-step", agent: "bull",
        analysis: { conclusion: "强烈看多", confidence: 0.9, sentiment: "bullish", reasoning: ["MACD金叉"] },
        timestamp: Date.now(),
      }],
    };

    const result = await executeCritique(
      { id: "critique-1", type: "critique", agent: { id: "reviewer" }, targetStep: "bull-step", prompt: "审阅" },
      registry, ctx,
      { llm: new FakeModel() as any },
    );

    expect(result.findings).toHaveLength(2); // original + critique
    expect(result.findings[1].step).toBe("critique-1");
  });
});

describe("executeSynthesize", () => {
  it("synthesizes from agent by id", async () => {
    const registry = new AgentRegistry();
    registry.register(agent("judge"));

    const result = await executeSynthesize(
      { id: "synth", type: "synthesize", agent: { id: "judge" }, prompt: "综合判断 {target}" },
      registry,
      createContext({ type: "stock", code: "600519", name: "茅台" }, "分析"),
      { llm: new FakeModel() as any },
    );

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].agent).toBe("judge");
  });
});
```

- [ ] **Step 2: Verify fails**

```bash
cd nextjs-app && pnpm vitest run lib/engine/primitives/__tests__/primitives.test.ts
# Expected: FAIL
```

- [ ] **Step 3: Create `critique.ts`** (port from `packages/core/src/workflow/primitives/critique.ts`)

```typescript
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentRegistry } from "../registry.js";
import type { ExecutionContext, WorkflowStep, Finding, Analysis } from "../types.js";
import { addFinding } from "../context.js";
import { createLLM, parseLLMJson, parseSentiment, type AnalyzeOptions } from "../../llm/create-llm.js";

export async function executeCritique(
  step: WorkflowStep,
  registry: AgentRegistry,
  context: ExecutionContext,
  options: AnalyzeOptions = {},
): Promise<ExecutionContext> {
  const reviewerId = (step.agent as { id?: string })?.id;
  if (!reviewerId) throw new Error("Critique step requires agent.id (reviewer)");
  const reviewer = registry.get(reviewerId);
  if (!reviewer) throw new Error(`Reviewer agent "${reviewerId}" not found`);

  const targetStep = step.targetStep!;
  const targetFindings = context.findings.filter(f => f.step === targetStep);
  if (targetFindings.length === 0) throw new Error(`No findings for target step "${targetStep}"`);

  const llm = createLLM(options);
  const targetText = targetFindings.map(f =>
    `[${f.agent}]: ${f.analysis.conclusion} (${f.analysis.sentiment}, 置信度${f.analysis.confidence})\n理由: ${f.analysis.reasoning.join("; ")}`
  ).join("\n");

  const prompt = (step.prompt ?? `审阅步骤 ${targetStep} 的分析结论`)
    .replace("{target}", context.target.name ?? context.target.code);

  const messages = [
    new SystemMessage(`你是${reviewer.name}，立场${reviewer.personality.stance}。请审阅以下分析并给出批评意见。输出JSON: {"conclusion":"审阅意见","confidence":0.0-1.0,"sentiment":"bullish|bearish|neutral","reasoning":[...]}`),
    new HumanMessage(`${prompt}\n\n待审阅的分析：\n${targetText}`),
  ];

  const response = await llm.invoke(messages);
  const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

  try {
    const parsed = parseLLMJson(text) as Record<string, unknown>;
    const analysis: Analysis = {
      conclusion: (parsed.conclusion as string) ?? text.slice(0, 100),
      confidence: Math.max(0, Math.min(1, (parsed.confidence as number) ?? 0.5)),
      sentiment: parseSentiment(parsed.sentiment),
      reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning as string[] : [],
      rawOutput: text,
    };
    return addFinding(context, step.id, reviewerId, analysis);
  } catch {
    return addFinding(context, step.id, reviewerId, {
      conclusion: text.slice(0, 200),
      confidence: 0.5,
      sentiment: "neutral",
      reasoning: [],
      rawOutput: text,
    });
  }
}
```

- [ ] **Step 4: Create `synthesize.ts`**, `debate.ts`, `panel.ts`, `vote.ts` following the same port pattern from existing code in `packages/core/src/workflow/primitives/`.

Create `nextjs-app/lib/engine/primitives/synthesize.ts`:
```typescript
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentRegistry } from "../registry.js";
import type { ExecutionContext, WorkflowStep, Analysis } from "../types.js";
import { addFinding } from "../context.js";
import { createLLM, parseLLMJson, parseSentiment, type AnalyzeOptions } from "../../llm/create-llm.js";

export async function executeSynthesize(
  step: WorkflowStep,
  registry: AgentRegistry,
  context: ExecutionContext,
  options: AnalyzeOptions = {},
): Promise<ExecutionContext> {
  const agentId = (step.agent as { id?: string })?.id;
  if (!agentId) throw new Error("Synthesize step requires agent.id");
  const agent = registry.get(agentId);
  if (!agent) throw new Error(`Agent "${agentId}" not found`);

  const llm = createLLM(options);

  const allFindingsText = context.findings.map(f =>
    `[步骤${f.step}][${f.agent}](${f.analysis.sentiment}, conf=${f.analysis.confidence}): ${f.analysis.conclusion}`
  ).join("\n");

  const prompt = (step.prompt ?? "综合各Agent分析，给出最终结论")
    .replace("{target}", context.target.name ?? context.target.code);

  const messages = [
    new SystemMessage("你是裁判分析师。综合所有分析的论点，给出平衡的最终研判。输出JSON: {\"conclusion\":\"综合结论+操作建议\",\"confidence\":0.0-1.0,\"sentiment\":\"bullish|bearish|neutral\",\"reasoning\":[关键论据,...]}"),
    new HumanMessage(`${prompt}\n\n已有分析：\n${allFindingsText}`),
  ];

  const response = await llm.invoke(messages);
  const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

  try {
    const parsed = parseLLMJson(text) as Record<string, unknown>;
    const analysis: Analysis = {
      conclusion: (parsed.conclusion as string) ?? text.slice(0, 100),
      confidence: Math.max(0, Math.min(1, (parsed.confidence as number) ?? 0.5)),
      sentiment: parseSentiment(parsed.sentiment),
      reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning as string[] : [],
      rawOutput: text,
    };
    return addFinding(context, step.id, agentId, analysis);
  } catch {
    return addFinding(context, step.id, agentId, {
      conclusion: text.slice(0, 200), confidence: 0.5, sentiment: "neutral", reasoning: [], rawOutput: text,
    });
  }
}
```

Create `nextjs-app/lib/engine/primitives/debate.ts` (simplified port):
```typescript
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentRegistry } from "../registry.js";
import type { ExecutionContext, WorkflowStep, Analysis, DebateRound } from "../types.js";
import { addFinding, addDebateRound } from "../context.js";
import { createLLM, parseLLMJson, parseSentiment, type AnalyzeOptions } from "../../llm/create-llm.js";

export async function executeDebate(
  step: WorkflowStep,
  registry: AgentRegistry,
  context: ExecutionContext,
  options: AnalyzeOptions = {},
): Promise<ExecutionContext> {
  const agentMatches = (Array.isArray(step.agent) ? step.agent : [step.agent]).filter(Boolean) as { id: string }[];
  if (agentMatches.length < 2) throw new Error("Debate requires at least 2 agents");

  const agents = agentMatches.map(m => {
    const a = registry.get(m.id);
    if (!a) throw new Error(`Agent "${m.id}" not found`);
    return a;
  });

  const maxRounds = step.maxRounds ?? 2;
  const llm = createLLM(options);
  let currentCtx = context;

  for (let r = 0; r < maxRounds; r++) {
    const entries: DebateRound["entries"] = [];

    for (const agent of agents) {
      const othersText = entries.map(e => `[${e.agent}]: ${e.argument}`).join("\n");
      const prompt = `辩论轮次 ${r + 1}/${maxRounds}。${step.prompt ?? "就分析结论进行辩论"}`
        .replace("{target}", currentCtx.target.name ?? currentCtx.target.code);

      const messages = [
        new SystemMessage(`你是${agent.name}，立场${agent.personality.stance}。请发表辩论观点。输出JSON: {"conclusion":"你的论点","confidence":0.0-1.0,"sentiment":"bullish|bearish|neutral","reasoning":["论据"]}`),
        new HumanMessage(`${prompt}${othersText ? `\n\n对方观点：\n${othersText}` : ""}`),
      ];

      const response = await llm.invoke(messages);
      const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

      try {
        const parsed = parseLLMJson(text) as Record<string, unknown>;
        const analysis: Analysis = {
          conclusion: (parsed.conclusion as string) ?? text.slice(0, 100),
          confidence: Math.max(0, Math.min(1, (parsed.confidence as number) ?? 0.5)),
          sentiment: parseSentiment(parsed.sentiment),
          reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning as string[] : [],
          rawOutput: text,
        };
        currentCtx = addFinding(currentCtx, `${step.id}_r${r}`, agent.id, analysis);
        entries.push({ agent: agent.id, argument: analysis.conclusion });
      } catch {
        entries.push({ agent: agent.id, argument: text.slice(0, 200) });
      }
    }

    currentCtx = addDebateRound(currentCtx, { round: r + 1, entries });
  }

  return currentCtx;
}
```

Create `nextjs-app/lib/engine/primitives/panel.ts` and `nextjs-app/lib/engine/primitives/vote.ts` following the same pattern from existing code in `packages/core/src/workflow/primitives/panel.ts` and `vote.ts`.

- [ ] **Step 5: Run tests**

```bash
cd nextjs-app && pnpm vitest run lib/engine/primitives/__tests__/primitives.test.ts
# Expected: all PASS
```

- [ ] **Step 6: Commit**

```bash
git add lib/engine/primitives/
git commit -m "feat: port all workflow primitives (critique, debate, panel, synthesize, vote)"
```

---

### Task 8: Workflow Builder DSL

**Files:**
- Create: `nextjs-app/lib/engine/builder.ts`
- Create: `nextjs-app/lib/engine/__tests__/builder.test.ts`

**Interfaces:**
- Produces: `defineWorkflow({name, description?}) → WorkflowBuilder`, `analyze(config)`, `critique(config)`, `parallel(children)`, `sequential(children)`, `panel(config)`, `synthesize(config)`, `vote(config)`, `debate(config)`, builder has `.step(id, primitive, overrides?)` and `.build() → WorkflowDAG`
- Consumes: types from `lib/engine/types.ts`

- [ ] **Step 1: Write the test**

Create `nextjs-app/lib/engine/__tests__/builder.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { defineWorkflow, analyze, critique, parallel, synthesize } from "../builder.js";

describe("WorkflowBuilder", () => {
  it("builds a simple linear workflow", () => {
    const dag = defineWorkflow({ name: "test-wf", description: "测试" })
      .step("step1", analyze({ agent: { capability: "tech" }, prompt: "分析" }))
      .step("step2", synthesize({ agent: "judge", prompt: "综合" }))
      .build();

    expect(dag.name).toBe("test-wf");
    expect(dag.description).toBe("测试");
    expect(dag.steps).toHaveLength(2);
    expect(dag.steps[0].type).toBe("analyze");
    expect(dag.steps[1].type).toBe("synthesize");
    // Auto-next chaining
    expect(dag.steps[0].next).toEqual(["step2"]);
  });

  it("builds a workflow with parallel steps", () => {
    const dag = defineWorkflow({ name: "parallel-test" })
      .step("bull", analyze({ agent: { capability: "bullish" }, prompt: "看多" }))
      .step("cross", parallel([
        critique({ reviewer: "bull", targetStep: "bear", prompt: "反驳" }),
        critique({ reviewer: "bear", targetStep: "bull", prompt: "反驳" }),
      ]))
      .step("final", synthesize({ agent: "judge", prompt: "裁决" }))
      .build();

    expect(dag.steps).toHaveLength(3);
    const parallelStep = dag.steps[1];
    expect(parallelStep.type).toBe("parallel");
    expect(parallelStep.children).toHaveLength(2);
    // Children get auto-assigned IDs
    expect(parallelStep.children![0].id).toBe("cross__child0");
  });

  it("build returns a deep clone (no mutation)", () => {
    const builder = defineWorkflow({ name: "clone-test" })
      .step("s1", analyze({ agent: { capability: "x" }, prompt: "p" }));
    const dag1 = builder.build();
    const dag2 = builder.build();
    dag2.name = "mutated";
    expect(dag1.name).toBe("clone-test");
  });
});
```

- [ ] **Step 2: Verify fails then create `builder.ts`** (port from `packages/core/src/workflow/builder.ts`)

```typescript
import type { WorkflowDAG, WorkflowStep, AgentMatch, AgentCount } from "./types.js";

// Primitive constructors
export const analyze = (config: { agent: AgentMatch | { id?: string; capability?: string }; prompt: string }): WorkflowStep =>
  ({ id: "", type: "analyze", ...config }) as WorkflowStep;

export const critique = (config: { reviewer: string; targetStep: string; prompt?: string }): WorkflowStep =>
  ({ id: "", type: "critique", agent: { id: config.reviewer }, targetStep: config.targetStep, prompt: config.prompt }) as WorkflowStep;

export const parallel = (children: WorkflowStep[]): WorkflowStep =>
  ({ id: "", type: "parallel", children }) as WorkflowStep;

export const sequential = (children: WorkflowStep[]): WorkflowStep =>
  ({ id: "", type: "sequential", children }) as WorkflowStep;

export const panel = (config: { match: AgentMatch; count?: AgentCount | "all"; prompt: string }): WorkflowStep =>
  ({ id: "", type: "panel", ...config }) as WorkflowStep;

export const synthesize = (config: { agent: string; prompt: string }): WorkflowStep =>
  ({ id: "", type: "synthesize", agent: { id: config.agent }, prompt: config.prompt }) as WorkflowStep;

export const vote = (config: { match: AgentMatch; count?: AgentCount | "all"; prompt: string }): WorkflowStep =>
  ({ id: "", type: "vote", ...config }) as WorkflowStep;

export const debate = (config: { agents: { id: string }[]; maxRounds?: number; prompt: string }): WorkflowStep =>
  ({ id: "", type: "debate", agent: config.agents as AgentMatch[], maxRounds: config.maxRounds, prompt: config.prompt }) as WorkflowStep;

class WorkflowBuilder {
  private dag: WorkflowDAG;

  constructor(name: string, description?: string) {
    this.dag = { name, version: "1", description, steps: [] };
  }

  step(id: string, primitive: WorkflowStep, overrides?: Partial<WorkflowStep>): this {
    const step: WorkflowStep = { ...primitive, id, ...overrides };
    if (step.children) {
      step.children = step.children.map((child, i) => ({
        ...child,
        id: child.id || `${id}__child${i}`,
      }));
    }
    this.dag.steps.push(step);
    return this;
  }

  build(): WorkflowDAG {
    for (let i = 0; i < this.dag.steps.length - 1; i++) {
      const step = this.dag.steps[i];
      if (!step.next && step.type !== "parallel" && step.type !== "sequential") {
        step.next = [this.dag.steps[i + 1].id];
      }
    }
    return JSON.parse(JSON.stringify(this.dag));
  }
}

export function defineWorkflow(config: { name: string; description?: string }): WorkflowBuilder {
  return new WorkflowBuilder(config.name, config.description);
}
```

- [ ] **Step 3: Run tests and commit**

```bash
cd nextjs-app && pnpm vitest run lib/engine/__tests__/builder.test.ts
# Expected: PASS
git add lib/engine/builder.ts lib/engine/__tests__/builder.test.ts
git commit -m "feat: port workflow builder DSL"
```

---

### Task 9: Workflow Scheduler

**Files:**
- Create: `nextjs-app/lib/engine/scheduler.ts`
- Create: `nextjs-app/lib/engine/__tests__/scheduler.test.ts`

**Interfaces:**
- Produces: `WorkflowScheduler(registry)` with `execute(dag, context, options?, events?) → Promise<ExecutionContext>`, `SchedulerEvents { onStepStart?, onStepComplete? }`
- Consumes: all primitives, AgentRegistry, ExecutionContext

- [ ] **Step 1: Write the test**

Create `nextjs-app/lib/engine/__tests__/scheduler.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { AgentRegistry } from "../registry.js";
import { WorkflowScheduler } from "../scheduler.js";
import { defineWorkflow, analyze, synthesize } from "../builder.js";
import { createContext } from "../context.js";
import type { BaseAgent, ExecutionContext, Analysis } from "../types.js";

class FakeModel {
  async invoke() {
    return { content: '{"conclusion":"测试分析","confidence":0.7,"sentiment":"neutral","reasoning":["理由1"]}' };
  }
}

function fakeAgent(id: string, capability = "tech"): BaseAgent {
  return {
    id, name: id, capabilities: [capability], personality: { stance: "neutral" }, tools: [],
    async analyze(_ctx: ExecutionContext): Promise<Analysis> {
      return { conclusion: `${id}结论`, confidence: 0.7, sentiment: "neutral", reasoning: [] };
    },
  };
}

describe("WorkflowScheduler", () => {
  it("executes a simple 2-step workflow", async () => {
    const registry = new AgentRegistry();
    registry.register(fakeAgent("agent1", "tech"));
    registry.register(fakeAgent("judge", "judge"));

    const dag = defineWorkflow({ name: "test" })
      .step("analyze", analyze({ agent: { capability: "tech" }, prompt: "分析 {target}" }))
      .step("final", synthesize({ agent: "judge", prompt: "综合" }))
      .build();

    const scheduler = new WorkflowScheduler(registry);
    const ctx = createContext({ type: "stock", code: "600519", name: "茅台" }, "分析茅台");
    const result = await scheduler.execute(dag, ctx, { llm: new FakeModel() as any });

    expect(result.findings.length).toBeGreaterThanOrEqual(2);
  });

  it("fires onStepStart and onStepComplete events", async () => {
    const registry = new AgentRegistry();
    registry.register(fakeAgent("agent1", "tech"));

    const dag = defineWorkflow({ name: "event-test" })
      .step("s1", analyze({ agent: { capability: "tech" }, prompt: "分析" }))
      .build();

    const onStepStart = vi.fn();
    const onStepComplete = vi.fn();

    const scheduler = new WorkflowScheduler(registry);
    await scheduler.execute(dag,
      createContext({ type: "stock", code: "x" }, "test"),
      { llm: new FakeModel() as any },
      { onStepStart, onStepComplete },
    );

    expect(onStepStart).toHaveBeenCalledWith("s1", "analyze");
    expect(onStepComplete).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Create `scheduler.ts`** (port from `packages/core/src/workflow/scheduler.ts`)

```typescript
import type { WorkflowDAG, WorkflowStep, ExecutionContext } from "./types.js";
import type { AgentRegistry } from "./registry.js";
import type { AnalyzeOptions } from "../llm/create-llm.js";
import { executeAnalyze } from "./primitives/analyze.js";
import { executePanel } from "./primitives/panel.js";
import { executeCritique } from "./primitives/critique.js";
import { executeDebate } from "./primitives/debate.js";
import { executeVote } from "./primitives/vote.js";
import { executeSynthesize } from "./primitives/synthesize.js";

export interface SchedulerEvents {
  onStepStart?: (stepId: string, type: string) => void;
  onStepComplete?: (stepId: string, context: ExecutionContext) => void;
}

export class WorkflowScheduler {
  constructor(private registry: AgentRegistry) {}

  async execute(
    dag: WorkflowDAG,
    context: ExecutionContext,
    options: AnalyzeOptions = {},
    events: SchedulerEvents = {},
  ): Promise<ExecutionContext> {
    let currentCtx = context;

    for (const step of dag.steps) {
      events.onStepStart?.(step.id, step.type);

      switch (step.type) {
        case "analyze":
          currentCtx = await executeAnalyze(step, this.registry, currentCtx, options);
          break;
        case "panel":
          currentCtx = await executePanel(step, this.registry, currentCtx, options);
          break;
        case "critique":
          currentCtx = await executeCritique(step, this.registry, currentCtx, options);
          break;
        case "debate":
          currentCtx = await executeDebate(step, this.registry, currentCtx, options);
          break;
        case "vote":
          currentCtx = await executeVote(step, this.registry, currentCtx, options);
          break;
        case "synthesize":
          currentCtx = await executeSynthesize(step, this.registry, currentCtx, options);
          break;
        case "parallel": {
          if (!step.children) break;
          const results = await Promise.all(
            step.children.map(child => this.executeSubStep(child, currentCtx, options))
          );
          const allFindings = results.flatMap(r => r.findings);
          const existingKeys = new Set(currentCtx.findings.map(f => `${f.step}|${f.agent}`));
          const trulyNew = allFindings.filter(f => !existingKeys.has(`${f.step}|${f.agent}`));
          currentCtx = { ...currentCtx, findings: [...currentCtx.findings, ...trulyNew] };
          break;
        }
        case "sequential":
          if (step.children) {
            for (const child of step.children) {
              currentCtx = await this.executeSubStep(child, currentCtx, options);
            }
          }
          break;
      }

      events.onStepComplete?.(step.id, currentCtx);
    }

    return currentCtx;
  }

  private async executeSubStep(
    step: WorkflowStep,
    context: ExecutionContext,
    options: AnalyzeOptions,
  ): Promise<ExecutionContext> {
    switch (step.type) {
      case "analyze": return executeAnalyze(step, this.registry, context, options);
      case "panel": return executePanel(step, this.registry, context, options);
      case "critique": return executeCritique(step, this.registry, context, options);
      case "debate": return executeDebate(step, this.registry, context, options);
      case "vote": return executeVote(step, this.registry, context, options);
      case "synthesize": return executeSynthesize(step, this.registry, context, options);
      default: throw new Error(`Unknown sub-step type: ${step.type}`);
    }
  }
}
```

- [ ] **Step 3: Run tests and commit**

```bash
cd nextjs-app && pnpm vitest run lib/engine/__tests__/scheduler.test.ts
git add lib/engine/scheduler.ts lib/engine/__tests__/scheduler.test.ts
git commit -m "feat: port workflow scheduler"
```

---

### Task 10: Built-in Agents

**Files:**
- Create: `nextjs-app/lib/agents/base.ts`
- Create: `nextjs-app/lib/agents/technical.ts`
- Create: `nextjs-app/lib/agents/fundamental.ts`
- Create: `nextjs-app/lib/agents/judge.ts`
- Create: `nextjs-app/lib/agents/index.ts`
- Create: `nextjs-app/lib/agents/__tests__/agents.test.ts`

**Interfaces:**
- Produces: `TechnicalAnalystAgent`, `FinancialReportAgent`, `JudgeAgent` classes implementing `BaseAgent`
- `registerBuiltinAgents(registry: AgentRegistry): void` — convenience function
- Consumes: `BaseAgent` from `lib/engine/types.ts`, `AgentRegistry` from `lib/engine/registry.ts`, `DataClient` from `lib/data/`

- [ ] **Step 1: Write the test**

Create `nextjs-app/lib/agents/__tests__/agents.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../../engine/registry.js";
import { TechnicalAnalystAgent, JudgeAgent } from "../index.js";

describe("TechnicalAnalystAgent", () => {
  it("has required BaseAgent shape", () => {
    const agent = new TechnicalAnalystAgent({ id: "tech-1", personality: { stance: "bullish" } });
    expect(agent.id).toBe("tech-1");
    expect(agent.name).toBeDefined();
    expect(agent.capabilities).toContain("technical");
    expect(agent.personality.stance).toBe("bullish");
    expect(agent.canCritique).toBe(true);
    expect(agent.tools).toBeDefined();
  });
});

describe("JudgeAgent", () => {
  it("has neutral stance", () => {
    const agent = new JudgeAgent();
    expect(agent.id).toBe("judge");
    expect(agent.personality.stance).toBe("neutral");
    expect(agent.capabilities).toContain("judge");
  });
});

describe("registerBuiltinAgents", () => {
  it("registers all agents into registry", async () => {
    const { registerBuiltinAgents } = await import("../index.js");
    const registry = new AgentRegistry();
    registerBuiltinAgents(registry);
    expect(registry.size).toBeGreaterThanOrEqual(6);
    expect(registry.get("judge")).toBeDefined();
  });
});
```

- [ ] **Step 2: Create agent files** (port from `packages/agents/src/`)

Create `nextjs-app/lib/agents/base.ts`:
```typescript
import type { BaseAgent, AgentPersona, ExecutionContext, Analysis } from "../engine/types.js";
import type { StructuredTool } from "@langchain/core/tools";

export abstract class AgentBase implements BaseAgent {
  abstract id: string;
  abstract name: string;
  abstract capabilities: string[];
  abstract personality: AgentPersona;
  tools: StructuredTool[] = [];
  canCritique = false;
  canDebate = false;

  abstract analyze(context: ExecutionContext): Promise<Analysis>;
}
```

Create `nextjs-app/lib/agents/technical.ts`:
```typescript
import type { AgentPersona, ExecutionContext, Analysis } from "../engine/types.js";
import type { StructuredTool } from "@langchain/core/tools";
import { BaseAgent } from "../engine/types.js";

export class TechnicalAnalystAgent implements BaseAgent {
  id: string;
  name = "技术面分析师";
  capabilities = ["technical"];
  personality: AgentPersona;
  tools: StructuredTool[] = [];
  canCritique = true;
  canDebate = true;

  constructor(config: { id: string; personality: AgentPersona }) {
    this.id = config.id;
    this.personality = config.personality;
  }

  async analyze(_context: ExecutionContext): Promise<Analysis> {
    // The actual LLM interaction happens in executeAnalyze primitive.
    // This method exists for interface compliance but is not called directly by the scheduler.
    return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
  }
}
```

Create `nextjs-app/lib/agents/fundamental.ts` (same pattern with `capabilities: ["fundamental"]`), `judge.ts` (`capabilities: ["judge"]`, `canCritique: true`, `personality: { stance: "neutral" }`).

Create `nextjs-app/lib/agents/index.ts`:
```typescript
import type { AgentRegistry } from "../engine/registry.js";
import { TechnicalAnalystAgent } from "./technical.js";
import { FinancialReportAgent } from "./fundamental.js";
import { JudgeAgent } from "./judge.js";

export { TechnicalAnalystAgent, FinancialReportAgent, JudgeAgent };

export function registerBuiltinAgents(registry: AgentRegistry): void {
  registry.register(new TechnicalAnalystAgent({ id: "technical-bull", personality: { stance: "bullish", style: "optimistic" } }));
  registry.register(new TechnicalAnalystAgent({ id: "technical-bear", personality: { stance: "bearish", style: "skeptical" } }));
  registry.register(new TechnicalAnalystAgent({ id: "technical-neutral", personality: { stance: "neutral" } }));
  registry.register(new FinancialReportAgent({ id: "financial-bull", personality: { stance: "bullish" } }));
  registry.register(new FinancialReportAgent({ id: "financial-bear", personality: { stance: "bearish" } }));
  registry.register(new FinancialReportAgent({ id: "financial-neutral", personality: { stance: "neutral" } }));
  registry.register(new JudgeAgent());
}
```

- [ ] **Step 3: Run tests and commit**

```bash
cd nextjs-app && pnpm vitest run lib/agents/__tests__/agents.test.ts
git add lib/agents/
git commit -m "feat: port built-in agents"
```

---

### Task 11: Workflow Definitions

**Files:**
- Create: `nextjs-app/lib/workflows/bull-bear.ts`
- Create: `nextjs-app/lib/workflows/quick-scan.ts`
- Create: `nextjs-app/lib/workflows/index.ts`

**Interfaces:**
- Produces: `WORKFLOWS: Record<string, WorkflowDAG>`
- Consumes: `defineWorkflow`, `analyze`, `critique`, `parallel`, `synthesize` from `lib/engine/builder.ts`

- [ ] **Step 1: Create workflow files** (port from `packages/server/src/workflows/` + `packages/cli/src/workflows/`)

Create `nextjs-app/lib/workflows/bull-bear.ts`:
```typescript
import { defineWorkflow, analyze, parallel, critique, synthesize } from "../engine/builder.js";

export const bullBearWorkflow = defineWorkflow({
  name: "bull-bear",
  description: "标准牛熊对抗分析 — 牛方和熊方技术面分析后互相审阅，裁判综合裁决"
})
.step("bull-analysis", analyze({
  agent: { capability: "bullish" },
  prompt: "从技术面看多 {target}，给出3条核心理由。关注均线多头排列、MACD金叉、放量突破等信号。",
}))
.step("bear-analysis", analyze({
  agent: { capability: "bearish" },
  prompt: "从技术面看空 {target}，给出3条核心理由。关注死叉、破位、顶背离、缩量等信号。",
}))
.step("cross-critique", parallel([
  critique({
    reviewer: "technical-bull",
    targetStep: "bear-analysis",
    prompt: "作为牛方，逐条审阅熊方的看空理由。哪些论据不够有力？哪些被夸大？请具体反驳。",
  }),
  critique({
    reviewer: "technical-bear",
    targetStep: "bull-analysis",
    prompt: "作为熊方，逐条审阅牛方的看多理由。哪些信号是假突破？哪些利好已被定价？请具体反驳。",
  }),
]))
.step("final", synthesize({
  agent: "judge",
  prompt: "综合牛方、熊方的分析以及双方的互驳，对 {target} 的短期走势做出最终研判。给出操作建议和关键点位。",
}))
.build();
```

Create `nextjs-app/lib/workflows/quick-scan.ts` (port from existing):
```typescript
import { defineWorkflow, analyze, synthesize } from "../engine/builder.js";

export const quickScanWorkflow = defineWorkflow({
  name: "quick-scan",
  description: "快速扫描 — 技术面+基本面并行分析后裁判给出简要研判"
})
.step("tech", analyze({
  agent: { capability: "technical" },
  prompt: "对 {target} 进行快速技术面扫描，找出关键信号。",
}))
.step("fundamental", analyze({
  agent: { capability: "fundamental" },
  prompt: "对 {target} 进行快速基本面扫描，关注估值和财务指标。",
}))
.step("final", synthesize({
  agent: "judge",
  prompt: "综合技术面和基本面扫描结果，对 {target} 给出简要研判。",
}))
.build();
```

Create `nextjs-app/lib/workflows/index.ts`:
```typescript
import type { WorkflowDAG } from "../engine/types.js";
import { bullBearWorkflow } from "./bull-bear.js";
import { quickScanWorkflow } from "./quick-scan.js";

export const WORKFLOWS: Record<string, WorkflowDAG> = {
  "bull-bear": bullBearWorkflow,
  "quick-scan": quickScanWorkflow,
};
```

- [ ] **Step 2: Commit**

```bash
git add lib/workflows/
git commit -m "feat: port workflow definitions (bull-bear, quick-scan)"
```

---

### Task 12: Data Client (Python service HTTP)

**Files:**
- Create: `nextjs-app/lib/data/client.ts`
- Create: `nextjs-app/lib/data/types.ts`
- Create: `nextjs-app/lib/data/__tests__/client.test.ts`

**Interfaces:**
- Produces: `DataClient` class with `options: DataClientOptions`, modules: `kline`, `financial`, `reference`, `sector`, `market`
- Consumes: vanilla `fetch`, no LangChain

- [ ] **Step 1: Write the test**

Create `nextjs-app/lib/data/__tests__/client.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DataClient } from "../client.js";

describe("DataClient", () => {
  let client: DataClient;

  beforeEach(() => {
    client = new DataClient({ baseUrl: "http://test:9500", timeout: 5000 });
  });

  it("has all module accessors", () => {
    expect(client.kline).toBeDefined();
    expect(client.financial).toBeDefined();
    expect(client.reference).toBeDefined();
    expect(client.sector).toBeDefined();
    expect(client.market).toBeDefined();
  });

  it("returns health response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ok", version: "0.1.0" }),
    });
    const health = await client.health();
    expect(health.status).toBe("ok");
  });

  it("throws on non-OK response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });
    await expect(client.health()).rejects.toThrow("Data service error 500");
  });
});
```

- [ ] **Step 2: Create `client.ts` and `types.ts`** (port from `packages/data-client/src/`)

Following the existing `DataClient` class structure from `packages/data-client/src/client.ts`, adapted to TypeScript path aliases.

- [ ] **Step 3: Run tests and commit**

```bash
cd nextjs-app && pnpm vitest run lib/data/__tests__/client.test.ts
git add lib/data/
git commit -m "feat: port DataClient for Python service"
```

---

### Task 13: SQLite DB Layer

**Files:**
- Create: `nextjs-app/lib/db/client.ts`
- Create: `nextjs-app/lib/db/analysis-repo.ts`
- Create: `nextjs-app/lib/db/__tests__/db.test.ts`

**Interfaces:**
- Produces: `getDb() → Database`, `AnalysisRepo { create(analysis), getById(id), listRecent(limit) }`
- Consumes: `better-sqlite3`

- [ ] **Step 1: Write the test**

Create `nextjs-app/lib/db/__tests__/db.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { AnalysisRepo } from "../analysis-repo.js";
import { createTables } from "../client.js";

describe("AnalysisRepo", () => {
  let db: Database.Database;
  let repo: AnalysisRepo;

  beforeEach(() => {
    db = new Database(":memory:");
    createTables(db);
    repo = new AnalysisRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates and retrieves an analysis", () => {
    const record = repo.create({
      id: "test-1",
      targetCode: "600519",
      targetName: "贵州茅台",
      targetType: "stock",
      workflowName: "bull-bear",
      status: "running",
      context: JSON.stringify({ target: { code: "600519" }, findings: [] }),
      createdAt: Date.now(),
    });

    expect(record.id).toBe("test-1");

    const found = repo.getById("test-1");
    expect(found?.targetCode).toBe("600519");
    expect(found?.workflowName).toBe("bull-bear");
  });

  it("updates status and context", () => {
    repo.create({
      id: "update-test",
      targetCode: "000001",
      targetName: null,
      targetType: "stock",
      workflowName: "quick-scan",
      status: "running",
      context: "{}",
      createdAt: Date.now(),
    });

    repo.update("update-test", {
      status: "complete",
      context: JSON.stringify({ target: { code: "000001" }, findings: [{ step: "s1", agent: "a1", analysis: {} }] }),
    });

    const updated = repo.getById("update-test");
    expect(updated?.status).toBe("complete");
  });

  it("lists recent analyses", () => {
    repo.create({ id: "a1", targetCode: "x", targetName: null, targetType: "stock", workflowName: "wf", status: "complete", context: "{}", createdAt: 1000 });
    repo.create({ id: "a2", targetCode: "y", targetName: null, targetType: "stock", workflowName: "wf", status: "complete", context: "{}", createdAt: 2000 });
    const recent = repo.listRecent(10);
    expect(recent).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Create `client.ts` and `analysis-repo.ts`**

Create `nextjs-app/lib/db/client.ts`:
```typescript
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

let _db: Database.Database | null = null;

export function getDb(dbPath = "./data/agenttrade.db"): Database.Database {
  if (!_db) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    _db = new Database(dbPath);
    _db.pragma("journal_mode = WAL");
    createTables(_db);
  }
  return _db;
}

export function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      target_code TEXT NOT NULL,
      target_name TEXT,
      target_type TEXT NOT NULL DEFAULT 'stock',
      workflow_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      context TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at DESC);
  `);
}
```

Create `nextjs-app/lib/db/analysis-repo.ts`:
```typescript
import type Database from "better-sqlite3";

export interface AnalysisRecord {
  id: string;
  targetCode: string;
  targetName: string | null;
  targetType: string;
  workflowName: string;
  status: "running" | "complete" | "error";
  context: string;
  createdAt: number;
  updatedAt?: number;
}

export class AnalysisRepo {
  constructor(private db: Database.Database) {}

  create(record: AnalysisRecord): AnalysisRecord {
    const stmt = this.db.prepare(
      `INSERT INTO analyses (id, target_code, target_name, target_type, workflow_name, status, context, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(record.id, record.targetCode, record.targetName, record.targetType,
      record.workflowName, record.status, record.context, record.createdAt);
    return record;
  }

  getById(id: string): AnalysisRecord | undefined {
    const row = this.db.prepare(
      `SELECT id, target_code, target_name, target_type, workflow_name, status, context, created_at, updated_at
       FROM analyses WHERE id = ?`
    ).get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id, targetCode: row.target_code, targetName: row.target_name,
      targetType: row.target_type, workflowName: row.workflow_name,
      status: row.status, context: row.context,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  update(id: string, patch: { status?: string; context?: string }): void {
    const updates: string[] = [];
    const values: any[] = [];
    if (patch.status !== undefined) { updates.push("status = ?"); values.push(patch.status); }
    if (patch.context !== undefined) { updates.push("context = ?"); values.push(patch.context); }
    updates.push("updated_at = unixepoch()");
    values.push(id);
    this.db.prepare(`UPDATE analyses SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }

  listRecent(limit = 20): AnalysisRecord[] {
    const rows = this.db.prepare(
      `SELECT id, target_code, target_name, target_type, workflow_name, status, context, created_at, updated_at
       FROM analyses ORDER BY created_at DESC LIMIT ?`
    ).all(limit) as any[];
    return rows.map((row: any) => ({
      id: row.id, targetCode: row.target_code, targetName: row.target_name,
      targetType: row.target_type, workflowName: row.workflow_name,
      status: row.status, context: row.context,
      createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  }
}
```

- [ ] **Step 3: Run tests and commit**

```bash
cd nextjs-app && pnpm vitest run lib/db/__tests__/db.test.ts
git add lib/db/
git commit -m "feat: add SQLite persistence layer"
```

---

### Task 14: Custom Next.js Server + Socket.IO

**Files:**
- Create: `nextjs-app/server.mjs` (root custom server)
- Create: `nextjs-app/lib/socket/server.ts`
- Create: `nextjs-app/lib/socket/events.ts`

**Interfaces:**
- Produces: Custom Next.js server that starts Socket.IO on namespace `/analysis`, integrates with workflow scheduler events
- Consumes: `next`, `http`, `socket.io`, `lib/engine/scheduler.ts`, `lib/socket/events.ts`

- [ ] **Step 1: Create `lib/socket/events.ts`**

```typescript
export const WS_EVENTS = {
  // Server emits
  ANALYSIS_START: "analysis:start",
  STEP_START: "step:start",
  STEP_COMPLETE: "step:complete",
  STEP_ERROR: "step:error",
  ANALYSIS_COMPLETE: "analysis:complete",
  ANALYSIS_ERROR: "analysis:error",
  // Client emits
  SUBSCRIBE: "subscribe",
  UNSUBSCRIBE: "unsubscribe",
} as const;

export interface AnalysisStartPayload {
  target: { type: string; code: string; name?: string };
  workflow: string;
}

export interface StepStartPayload {
  stepId: string;
  type: string;
  agentIds: string[];
}

export interface StepCompletePayload {
  stepId: string;
  findings: { agent: string; conclusion: string; sentiment: string; confidence: number }[];
}
```

- [ ] **Step 2: Create `lib/socket/server.ts`**

```typescript
import { Server as HttpServer } from "node:http";
import { Server, Socket } from "socket.io";
import { WS_EVENTS } from "./events.js";

export function createSocketServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  const analysisNs = io.of("/analysis");

  analysisNs.on("connection", (socket: Socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    socket.on(WS_EVENTS.SUBSCRIBE, ({ sessionId }: { sessionId: string }) => {
      socket.join(sessionId);
      socket.emit("subscribed", { sessionId });
      console.log(`[WS] ${socket.id} → session ${sessionId}`);
    });

    socket.on(WS_EVENTS.UNSUBSCRIBE, ({ sessionId }: { sessionId: string }) => {
      socket.leave(sessionId);
      socket.emit("unsubscribed", { sessionId });
    });

    socket.on("disconnect", () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getSocketIO(): Server {
  // Lazy singleton — initialized in server.mjs
  if (!_io) throw new Error("Socket.IO not initialized");
  return _io;
}

let _io: Server | null = null;

export function setSocketIO(io: Server): void {
  _io = io;
}
```

- [ ] **Step 3: Create `server.mjs`** (root-level custom server)

```javascript
import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import dotenv from "dotenv";
dotenv.config();

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = process.env.PORT ?? 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  // Dynamic import to allow Next.js to bundle TS
  const { createSocketServer, setSocketIO } = await import("./lib/socket/server.js");
  const io = createSocketServer(httpServer);
  setSocketIO(io);

  httpServer.listen(port, () => {
    console.log(`AgentTrade running on http://${hostname}:${port}`);
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add server.mjs lib/socket/
git commit -m "feat: custom Next.js server with Socket.IO"
```

---

### Task 15: API Routes

**Files:**
- Create: `nextjs-app/app/api/analyze/route.ts`
- Create: `nextjs-app/app/api/analyze/[id]/route.ts`
- Create: `nextjs-app/app/api/workflows/route.ts`

**Interfaces:**
- Produces: `POST /api/analyze` (start analysis), `GET /api/analyze/[id]` (get status), `GET /api/workflows` (list workflows)
- Consumes: AgentRegistry, WorkflowScheduler, WORKFLOWS, DB layer, Socket.IO

- [ ] **Step 1: Create API routes**

Create `nextjs-app/app/api/analyze/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { AgentRegistry, WorkflowScheduler, createContext, setDefaultLLMProvider } from "@/lib/engine/index.js";
import { registerBuiltinAgents } from "@/lib/agents/index.js";
import { WORKFLOWS } from "@/lib/workflows/index.js";
import { DataClient } from "@/lib/data/client.js";
import { getSocketIO } from "@/lib/socket/server.js";
import { WS_EVENTS } from "@/lib/socket/events.js";
import type { AnalysisTarget, ExecutionContext, Finding } from "@/lib/engine/types.js";
import { getDb } from "@/lib/db/client.js";
import { AnalysisRepo } from "@/lib/db/analysis-repo.js";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { code, sector, index, workflow = "bull-bear", provider = "deepseek", model, dataServiceUrl } = body;

  if (!code && !sector && !index) {
    return NextResponse.json({ error: "Must specify code, sector, or index" }, { status: 400 });
  }

  const sessionId = randomUUID();

  // Save to DB
  const db = getDb();
  const repo = new AnalysisRepo(db);
  repo.create({
    id: sessionId,
    targetCode: code ?? sector ?? index,
    targetName: null,
    targetType: sector ? "sector" : index ? "index" : "stock",
    workflowName: workflow,
    status: "running",
    context: "{}",
    createdAt: Date.now(),
  });

  // Run analysis asynchronously
  runAnalysis(sessionId, { code, sector, index, workflow, provider, model, dataServiceUrl }).catch(async (err) => {
    console.error(`Analysis ${sessionId} failed:`, err);
    repo.update(sessionId, { status: "error", context: JSON.stringify({ error: err.message }) });
    const io = getSocketIO();
    io.of("/analysis").to(sessionId).emit(WS_EVENTS.ANALYSIS_ERROR, { message: err.message });
  });

  return NextResponse.json({ sessionId });
}

async function runAnalysis(
  sessionId: string,
  dto: { code?: string; sector?: string; index?: string; workflow?: string; provider?: string; model?: string; dataServiceUrl?: string }
): Promise<void> {
  const db = getDb();
  const repo = new AnalysisRepo(db);
  const io = getSocketIO();
  const ns = io.of("/analysis");

  if (dto.provider) {
    setDefaultLLMProvider(dto.provider as "anthropic" | "openai" | "deepseek");
  }

  const workflowDag = WORKFLOWS[dto.workflow ?? "bull-bear"];
  if (!workflowDag) throw new Error(`Unknown workflow: ${dto.workflow}`);

  const target = await resolveTarget(dto);

  ns.to(sessionId).emit(WS_EVENTS.ANALYSIS_START, {
    target: { type: target.type, code: target.code, name: target.name },
    workflow: dto.workflow ?? "bull-bear",
  });

  const registry = new AgentRegistry();
  registerBuiltinAgents(registry);

  const scheduler = new WorkflowScheduler(registry);
  const context = createContext(target, `对${target.name ?? target.code}进行分析`, dto.workflow ?? "bull-bear");

  const result = await scheduler.execute(workflowDag, context, {
    provider: dto.provider as any,
    modelName: dto.model,
  }, {
    onStepStart: (stepId, type) => {
      const stepDef = workflowDag.steps.find(s => s.id === stepId);
      const agentIds = extractAgentIds(stepDef);
      ns.to(sessionId).emit(WS_EVENTS.STEP_START, { stepId, type, agentIds });
    },
    onStepComplete: (stepId, ctx: ExecutionContext) => {
      const stepFindings = ctx.findings
        .filter((f: Finding) => f.step === stepId || f.step.startsWith(stepId))
        .map((f: Finding) => ({
          agent: f.agent, conclusion: f.analysis.conclusion,
          sentiment: f.analysis.sentiment, confidence: f.analysis.confidence,
        }));
      ns.to(sessionId).emit(WS_EVENTS.STEP_COMPLETE, { stepId, findings: stepFindings });
    },
  });

  // Persist results
  repo.update(sessionId, {
    status: "complete",
    context: JSON.stringify({
      target: result.target,
      workflowName: result.workflowName,
      findings: result.findings,
      debateRounds: result.debateRounds,
    }),
  });

  ns.to(sessionId).emit(WS_EVENTS.ANALYSIS_COMPLETE, {
    context: {
      target: result.target,
      workflowName: result.workflowName,
      findings: result.findings,
      debateRounds: result.debateRounds,
    },
  });
}

async function resolveTarget(dto: any): Promise<AnalysisTarget> {
  const client = new DataClient({ baseUrl: dto.dataServiceUrl ?? "http://localhost:9500" });
  if (dto.sector) {
    const target: AnalysisTarget = { type: "sector", code: dto.sector };
    try { const info = await client.sector.constituents(dto.sector); target.name = info.name; } catch { /* */ }
    return target;
  }
  if (dto.index) return { type: "index", code: dto.index };
  if (dto.code) {
    const target: AnalysisTarget = { type: "stock", code: dto.code };
    try { const info = await client.reference.get(dto.code); target.name = info.name; } catch { /* */ }
    return target;
  }
  throw new Error("Must specify code, sector, or index");
}

function extractAgentIds(stepDef: any): string[] {
  if (!stepDef) return [];
  const ids: string[] = [];
  if (stepDef.agent) {
    const agents = Array.isArray(stepDef.agent) ? stepDef.agent : [stepDef.agent];
    for (const a of agents) if (a.id) ids.push(a.id);
  }
  if (stepDef.match?.id) ids.push(stepDef.match.id);
  if (stepDef.children) for (const child of stepDef.children) ids.push(...extractAgentIds(child));
  return [...new Set(ids)];
}
```

Create `nextjs-app/app/api/analyze/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client.js";
import { AnalysisRepo } from "@/lib/db/analysis-repo.js";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = new AnalysisRepo(getDb());
  const record = repo.getById(id);
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    sessionId: record.id,
    status: record.status,
    target: { code: record.targetCode, name: record.targetName, type: record.targetType },
    workflow: record.workflowName,
    context: JSON.parse(record.context),
    createdAt: record.createdAt,
  });
}
```

Create `nextjs-app/app/api/workflows/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { WORKFLOWS } from "@/lib/workflows/index.js";

export async function GET() {
  const list = Object.entries(WORKFLOWS).map(([name, dag]) => ({
    name,
    description: dag.description,
  }));
  return NextResponse.json(list);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/
git commit -m "feat: API routes (analyze, workflows)"
```

---

### Task 16: Landing Page

**Files:**
- Create: `nextjs-app/app/page.tsx` (replace scaffold)
- Create: `nextjs-app/components/landing/StockSearchInput.tsx`
- Create: `nextjs-app/components/landing/WorkflowSelector.tsx`
- Create: `nextjs-app/components/ui/button.tsx` (shadcn)
- Create: `nextjs-app/components/ui/input.tsx` (shadcn)
- Create: `nextjs-app/components/ui/card.tsx` (shadcn)

**Interfaces:**
- Consumes: `GET /api/workflows`
- Produces: Landing page with stock search, workflow selection, start button → redirect to `/analyze/:id`

- [ ] **Step 1: Write the test**

Create `nextjs-app/app/__tests__/page.test.tsx`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import HomePage from "../page";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock fetch for workflows
globalThis.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => [
    { name: "bull-bear", description: "牛熊对抗" },
    { name: "quick-scan", description: "快速扫描" },
  ],
});

describe("HomePage", () => {
  it("renders title and search input", async () => {
    render(<HomePage />);
    expect(screen.getByText("AgentTrade")).toBeDefined();
  });
});
```

- [ ] **Step 2: Create UI components** (shadcn/ui pattern)

Install and initialize shadcn/ui, then create button, input, card, select components.

- [ ] **Step 3: Create `StockSearchInput.tsx`**

```typescript
"use client";
import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";

interface StockSearchInputProps {
  value: string;
  onChange: (code: string) => void;
}

export function StockSearchInput({ value, onChange }: StockSearchInputProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-zinc-400">股票代码</label>
      <Input
        placeholder="输入股票代码，如 600519"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-zinc-900 border-zinc-700 text-zinc-100 text-lg h-12"
      />
    </div>
  );
}
```

- [ ] **Step 4: Create `WorkflowSelector.tsx`**

```typescript
"use client";
import { useState, useEffect } from "react";

interface Workflow {
  name: string;
  description: string;
}

interface WorkflowSelectorProps {
  selected: string;
  onSelect: (name: string) => void;
}

export function WorkflowSelector({ selected, onSelect }: WorkflowSelectorProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);

  useEffect(() => {
    fetch("/api/workflows")
      .then(r => r.json())
      .then(setWorkflows);
  }, []);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-zinc-400">分析工作流</label>
      <div className="grid grid-cols-1 gap-2">
        {workflows.map(wf => (
          <button
            key={wf.name}
            onClick={() => onSelect(wf.name)}
            className={`text-left p-3 rounded-lg border transition-colors ${
              selected === wf.name
                ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            <div className="font-medium text-zinc-100">{wf.name}</div>
            <div className="text-xs mt-1">{wf.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `app/page.tsx`**

```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { StockSearchInput } from "@/components/landing/StockSearchInput";
import { WorkflowSelector } from "@/components/landing/WorkflowSelector";

export default function HomePage() {
  const [code, setCode] = useState("");
  const [workflow, setWorkflow] = useState("bull-bear");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleStart() {
    if (!code.trim()) return;
    setLoading(true);
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim(), workflow }),
    });
    const { sessionId } = await res.json();
    router.push(`/analyze/${sessionId}`);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight text-emerald-400">AgentTrade</h1>
          <p className="mt-3 text-zinc-500">多 Agent 对抗行情分析</p>
        </div>
        <div className="space-y-6 bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <StockSearchInput value={code} onChange={setCode} />
          <WorkflowSelector selected={workflow} onSelect={setWorkflow} />
          <button
            onClick={handleStart}
            disabled={!code.trim() || loading}
            className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors"
          >
            {loading ? "启动中..." : "开始分析"}
          </button>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add app/page.tsx app/__tests__/page.test.tsx components/landing/ components/ui/
git commit -m "feat: landing page with stock search and workflow selector"
```

---

### Task 17: Analysis Page & Components

**Files:**
- Create: `nextjs-app/app/analyze/[id]/page.tsx`
- Create: `nextjs-app/components/analysis/AnalysisHeader.tsx`
- Create: `nextjs-app/components/analysis/StepProgress.tsx`
- Create: `nextjs-app/components/analysis/LiveDebatePanel.tsx`
- Create: `nextjs-app/components/analysis/AgentBubble.tsx`
- Create: `nextjs-app/components/analysis/ConclusionCard.tsx`

**Interfaces:**
- Consumes: `GET /api/analyze/[id]` for SSR, WebSocket hook for real-time
- Produces: Full analysis page that SSR renders completed data and hydrates for live updates

- [ ] **Step 1: Create `AnalysisHeader.tsx`**

```typescript
interface AnalysisHeaderProps {
  target: { type: string; code: string; name?: string };
  workflow: string;
  status: "running" | "complete" | "error";
}

export function AnalysisHeader({ target, workflow, status }: AnalysisHeaderProps) {
  const statusLabel: Record<string, string> = {
    running: "分析中",
    complete: "已完成",
    error: "出错",
  };
  const statusColor: Record<string, string> = {
    running: "text-amber-400", complete: "text-emerald-400", error: "text-red-400",
  };
  return (
    <div className="flex items-center justify-between py-4 border-b border-zinc-800">
      <div>
        <h1 className="text-2xl font-bold">{target.name ?? target.code}</h1>
        <p className="text-zinc-500 text-sm">{target.code} · {workflow}</p>
      </div>
      <span className={`${statusColor[status]} text-sm font-medium`}>
        {statusLabel[status] ?? status}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Create `StepProgress.tsx`**

```typescript
interface StepState {
  stepId: string;
  type: string;
  status: "pending" | "running" | "complete";
}

export function StepProgress({ steps }: { steps: StepState[] }) {
  return (
    <div className="flex gap-2 py-4">
      {steps.map((step, i) => (
        <div key={step.stepId} className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${
            step.status === "complete" ? "bg-emerald-500" :
            step.status === "running" ? "bg-amber-400 animate-pulse" :
            "bg-zinc-700"
          }`} />
          <span className="text-xs text-zinc-500">{step.type}</span>
          {i < steps.length - 1 && <div className="w-8 h-px bg-zinc-700" />}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `AgentBubble.tsx` and `LiveDebatePanel.tsx`**

```typescript
// AgentBubble.tsx
interface AgentBubbleProps {
  agent: string;
  conclusion: string;
  sentiment: string;
  confidence: number;
  timestamp: number;
}

export function AgentBubble({ agent, conclusion, sentiment, confidence, timestamp }: AgentBubbleProps) {
  const sentimentColor = sentiment === "bullish" ? "border-l-emerald-500" :
    sentiment === "bearish" ? "border-l-red-500" : "border-l-zinc-500";
  return (
    <div className={`bg-zinc-900 rounded-lg p-4 border-l-4 ${sentimentColor}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm text-zinc-300">{agent}</span>
        <span className="text-xs text-zinc-500">
          {sentiment} · {(confidence * 100).toFixed(0)}% · {new Date(timestamp).toLocaleTimeString("zh-CN")}
        </span>
      </div>
      <p className="text-zinc-400 text-sm leading-relaxed">{conclusion}</p>
    </div>
  );
}
```

```typescript
// LiveDebatePanel.tsx
import { AgentBubble } from "./AgentBubble";

interface Finding {
  agent: string;
  conclusion: string;
  sentiment: string;
  confidence: number;
  step: string;
  timestamp: number;
}

export function LiveDebatePanel({ findings }: { findings: Finding[] }) {
  return (
    <div className="space-y-3 py-4">
      {findings.length === 0 && (
        <p className="text-zinc-600 text-center py-8">等待 Agent 分析结果...</p>
      )}
      {findings.map((f, i) => (
        <AgentBubble
          key={`${f.step}-${f.agent}-${i}`}
          agent={f.agent}
          conclusion={f.conclusion}
          sentiment={f.sentiment}
          confidence={f.confidence}
          timestamp={f.timestamp}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create `ConclusionCard.tsx`**

```typescript
interface ConclusionCardProps {
  conclusion: string;
  reasoning: string[];
  sentiment: string;
  confidence: number;
}

export function ConclusionCard({ conclusion, reasoning, sentiment, confidence }: ConclusionCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mt-4">
      <h2 className="text-lg font-semibold text-zinc-100 mb-3">综合研判</h2>
      <p className="text-zinc-300 leading-relaxed">{conclusion}</p>
      {reasoning.length > 0 && (
        <ul className="mt-3 space-y-1">
          {reasoning.map((r, i) => (
            <li key={i} className="text-zinc-500 text-sm">· {r}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex gap-3 text-sm">
        <span className="text-zinc-500">倾向: <span className="text-zinc-300">{sentiment}</span></span>
        <span className="text-zinc-500">置信度: <span className="text-zinc-300">{(confidence * 100).toFixed(0)}%</span></span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `app/analyze/[id]/page.tsx`** (SSR + client hydration)

```typescript
import { AnalysisHeader } from "@/components/analysis/AnalysisHeader";
import { StepProgress } from "@/components/analysis/StepProgress";
import { LiveDebatePanel } from "@/components/analysis/LiveDebatePanel";
import { ConclusionCard } from "@/components/analysis/ConclusionCard";
import { getDb } from "@/lib/db/client.js";
import { AnalysisRepo } from "@/lib/db/analysis-repo.js";
import { AnalysisLiveClient } from "./client";

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const repo = new AnalysisRepo(getDb());
  const record = repo.getById(id);

  if (!record) {
    return <div className="p-8 text-center text-zinc-500">分析记录不存在</div>;
  }

  const context = JSON.parse(record.context);
  const isRunning = record.status === "running";

  return (
    <main className="max-w-3xl mx-auto p-4 min-h-screen">
      <AnalysisHeader
        target={{ type: record.targetType, code: record.targetCode, name: record.targetName ?? undefined }}
        workflow={record.workflowName}
        status={record.status}
      />
      <LiveDebatePanel findings={context.findings ?? []} />
      {context.findings?.find((f: any) => f.agent === "judge") && (
        <ConclusionCard {...context.findings.find((f: any) => f.agent === "judge").analysis} />
      )}
      {isRunning && <AnalysisLiveClient sessionId={id} />}
    </main>
  );
}
```

- [ ] **Step 6: Create `app/analyze/[id]/client.tsx`** ("use client" component for WebSocket)

```typescript
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AnalysisLiveClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();

  useEffect(() => {
    // This will be replaced by useAnalysisSocket in Task 18
    const es = new EventSource(`/api/analyze/${sessionId}/events`);
    es.onmessage = () => router.refresh();
    return () => es.close();
  }, [sessionId, router]);

  return <p className="text-amber-400 text-sm mt-4 animate-pulse">● 实时分析进行中...</p>;
}
```

- [ ] **Step 7: Commit**

```bash
git add app/analyze/ components/analysis/
git commit -m "feat: analysis page with SSR + client hydration"
```

---

### Task 18: WebSocket React Hook

**Files:**
- Create: `nextjs-app/hooks/useAnalysisSocket.ts`
- Update: `nextjs-app/app/analyze/[id]/client.tsx`

**Interfaces:**
- Produces: `useAnalysisSocket(sessionId) → { connected, findings, steps, conclusion, status }`
- Consumes: `socket.io-client`

- [ ] **Step 1: Create `hooks/useAnalysisSocket.ts`** (React port of Vue `useAnalysisSocket`)

```typescript
"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";

interface Finding {
  step: string;
  agent: string;
  conclusion: string;
  sentiment: string;
  confidence: number;
  timestamp: number;
}

interface StepState {
  stepId: string;
  type: string;
  agentIds: string[];
  status: "pending" | "running" | "complete";
}

interface AnalysisState {
  stepId: string;
  type: string;
  agentIds: string[];
  status: "pending" | "running" | "complete";
}

export function useAnalysisSocket(sessionId: string) {
  const [connected, setConnected] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [status, setStatus] = useState<"running" | "complete" | "error">("running");
  const socketRef = useRef<Socket | null>(null);

  const connect = useCallback(() => {
    const url = window.location.origin;
    const socket = io(`${url}/analysis`, {
      transports: ["websocket", "polling"],
      forceNew: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("subscribe", { sessionId });
    });

    socket.on("analysis:start", (payload: any) => {
      const wfSteps = payload.workflow === "bull-bear"
        ? ["bull-analysis", "bear-analysis", "cross-critique", "final"]
        : payload.workflow === "quick-scan"
        ? ["tech", "fundamental", "final"]
        : [];
      setSteps(wfSteps.map(id => ({ stepId: id, type: id, agentIds: [], status: "pending" })));
    });

    socket.on("step:start", (payload: any) => {
      setSteps(prev => prev.map(s =>
        s.stepId === payload.stepId ? { ...s, status: "running" as const, agentIds: payload.agentIds } : s
      ));
    });

    socket.on("step:complete", (payload: any) => {
      setSteps(prev => prev.map(s =>
        s.stepId === payload.stepId ? { ...s, status: "complete" as const } : s
      ));
      if (payload.findings) {
        setFindings(prev => [
          ...prev,
          ...payload.findings.map((f: any) => ({
            step: payload.stepId,
            agent: f.agent,
            conclusion: f.conclusion,
            sentiment: f.sentiment,
            confidence: f.confidence,
            timestamp: Date.now(),
          })),
        ]);
      }
    });

    socket.on("analysis:complete", (payload: any) => {
      setStatus("complete");
      if (payload.context?.findings) {
        setFindings(payload.context.findings);
      }
    });

    socket.on("analysis:error", () => setStatus("error"));
    socket.on("step:error", () => {});

    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
  }, [sessionId]);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [connect]);

  return { connected, findings, steps, status };
}
```

- [ ] **Step 2: Update `client.tsx`** to use the hook

```typescript
"use client";
import { useAnalysisSocket } from "@/hooks/useAnalysisSocket";
import { StepProgress } from "@/components/analysis/StepProgress";
import { LiveDebatePanel } from "@/components/analysis/LiveDebatePanel";
import { ConclusionCard } from "@/components/analysis/ConclusionCard";

export function AnalysisLiveClient({ sessionId }: { sessionId: string }) {
  const { connected, findings, steps, status } = useAnalysisSocket(sessionId);

  const judgeFinding = findings.find(f => f.agent === "judge");

  return (
    <div>
      <StepProgress steps={steps} />
      <LiveDebatePanel findings={findings} />
      {judgeFinding && (
        <ConclusionCard
          conclusion={judgeFinding.conclusion}
          reasoning={[]}
          sentiment={judgeFinding.sentiment}
          confidence={judgeFinding.confidence}
        />
      )}
      {status === "running" && (
        <p className={`text-sm mt-4 ${connected ? "text-amber-400 animate-pulse" : "text-red-400"}`}>
          {connected ? "● 实时分析进行中..." : "● 连接断开，正在重连..."}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add hooks/useAnalysisSocket.ts app/analyze/[id]/client.tsx
git commit -m "feat: WebSocket React hook for real-time analysis"
```

---

### Task 19: Engine barrel export (`lib/engine/index.ts`)

**Files:**
- Create: `nextjs-app/lib/engine/index.ts`

**Interfaces:**
- Produces: unified `@/lib/engine` import with all public exports

- [ ] **Step 1: Create `lib/engine/index.ts`**

```typescript
export type { TargetType, AnalysisTarget } from "./types.js";
export type { BaseAgent, Capability, AgentPersona, Analysis } from "./types.js";
export type { PrimitiveType, AgentMatch, AgentCount, WorkflowStep, WorkflowDAG, Finding, DebateRound, ExecutionContext } from "./types.js";

export { AgentRegistry } from "./registry.js";
export { createContext, addFinding, addDebateRound, getAgentFindings, getStepFindings, getLatestFinding } from "./context.js";

export { executeAnalyze } from "./primitives/analyze.js";
export { executePanel } from "./primitives/panel.js";
export { executeCritique } from "./primitives/critique.js";
export { executeDebate } from "./primitives/debate.js";
export { executeVote } from "./primitives/vote.js";
export { executeSynthesize } from "./primitives/synthesize.js";

export { defineWorkflow, analyze, critique, parallel, sequential, panel, synthesize, vote, debate } from "./builder.js";
export { WorkflowScheduler } from "./scheduler.js";
export type { SchedulerEvents } from "./scheduler.js";

export { setDefaultLLMProvider, createLLM, parseLLMJson, parseSentiment } from "../llm/create-llm.js";
export type { AnalyzeOptions, LLMProvider, Sentiment } from "../llm/create-llm.js";
```

- [ ] **Step 2: Verify imports resolve**

```bash
cd nextjs-app && pnpm tsc --noEmit
# Expected: no errors from engine/agent/data/llm imports
```

- [ ] **Step 3: Commit**

```bash
git add lib/engine/index.ts
git commit -m "feat: engine barrel export"
```

---

### Task 20: Integration Test & Cleanup

**Files:**
- Create: `nextjs-app/__tests__/integration/analyze-flow.test.ts`
- Modify: `agenttrade/package.json` (remove old workspace scripts)
- Delete: `packages/core/`, `packages/agents/`, `packages/cli/`, `packages/server/`, `packages/web/`, `packages/data-client/`
- Modify: `agenttrade/pnpm-workspace.yaml`

**Interfaces:**
- Produces: Full integration test from HTTP POST to WebSocket events, removal of old packages

- [ ] **Step 1: Write integration test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io, Socket } from "socket.io-client";

const BASE = "http://localhost:3000";

describe("analyze flow (integration)", () => {
  it("POST /api/analyze starts an analysis and WebSocket delivers events", async () => {
    // 1. Start analysis
    const res = await fetch(`${BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "600519", workflow: "bull-bear", provider: "deepseek" }),
    });
    expect(res.ok).toBe(true);
    const { sessionId } = await res.json();
    expect(sessionId).toBeDefined();

    // 2. Connect WebSocket
    const events: any[] = [];
    const socket: Socket = io(`${BASE}/analysis`, { transports: ["websocket"] });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for events")), 60000);
      socket.on("connect", () => socket.emit("subscribe", { sessionId }));
      socket.on("analysis:start", (d) => { events.push({ type: "start", ...d }); });
      socket.on("step:start", (d) => events.push({ type: "step:start", ...d }));
      socket.on("step:complete", (d) => events.push({ type: "step:complete", ...d }));
      socket.on("analysis:complete", (d) => {
        events.push({ type: "complete", ...d });
        clearTimeout(timeout);
        socket.disconnect();
        resolve();
      });
      socket.on("analysis:error", (d) => {
        clearTimeout(timeout);
        socket.disconnect();
        reject(new Error(`Analysis error: ${JSON.stringify(d)}`));
      });
    });

    expect(events.length).toBeGreaterThan(0);
    const startEvent = events.find(e => e.type === "start");
    expect(startEvent?.target?.code).toBe("600519");

    const completeEvent = events.find(e => e.type === "complete");
    expect(completeEvent).toBeDefined();

    // 3. Verify persisted via REST
    const statusRes = await fetch(`${BASE}/api/analyze/${sessionId}`);
    const status = await statusRes.json();
    expect(status.status).toBe("complete");
  }, 120000);
});
```

- [ ] **Step 2: Remove old packages**

```bash
# Remove individual packages (keep d2-data for now)
rm -rf packages/core packages/agents packages/cli packages/server packages/web packages/data-client
# Update root package.json
```

Update root `package.json`:
```json
{
  "name": "agenttrade-monorepo",
  "private": true,
  "scripts": {
    "dev": "cd nextjs-app && pnpm dev",
    "build": "cd nextjs-app && pnpm build",
    "test": "cd nextjs-app && pnpm test"
  }
}
```

- [ ] **Step 3: Extract Python service plan** (Task 21 handles the extraction details)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old packages, finalize Next.js migration"
```

---

### Task 21: Extract Python data service to separate repo

**Files:**
- Create: new repo `d2-data/` (standalone)
- Copy: all files from `agenttrade/d2-data/`

**Interfaces:**
- Produces: Independent Python repository with FastAPI service, its own CI/CD
- Consumes: nothing from TS side — just the HTTP contract

- [ ] **Step 1: Create new repo structure**

```bash
mkdir -p ../d2-data
cp -r d2-data/* ../d2-data/
cd ../d2-data
git init
git add -A
git commit -m "Initial: extract d2-data from agenttrade monorepo"
```

- [ ] **Step 2: Add README and CI to new repo**

Create `../d2-data/README.md` with service documentation.

- [ ] **Step 3: Remove d2-data from agenttrade**

```bash
rm -rf d2-data
git add d2-data
git commit -m "refactor: remove d2-data (extracted to separate repo)"
```

- [ ] **Step 4: Commit**

```bash
cd ../d2-data && git add -A && git commit -m "docs: add README and CI config"
```

---

### Task 22: Final Verification

**Files:**
- Create: `nextjs-app/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: all built modules
- Produces: passing smoke tests confirming the full pipeline works

- [ ] **Step 1: Write smoke test**

```typescript
import { describe, it, expect } from "vitest";
import { AgentRegistry, WorkflowScheduler, defineWorkflow, analyze, synthesize, createContext } from "@/lib/engine";
import { defineWorkflow as dw, analyze as an, synthesize as syn } from "@/lib/engine/builder.js";
import { AgentRegistry as Registry } from "@/lib/engine/registry.js";
import { createContext as cc } from "@/lib/engine/context.js";
import { WorkflowScheduler as Scheduler } from "@/lib/engine/scheduler.js";
import { parseLLMJson, parseSentiment } from "@/lib/llm/parse.js";
import { WORKFLOWS } from "@/lib/workflows/index.js";
import { registerBuiltinAgents } from "@/lib/agents/index.js";

class SmokeModel {
  async invoke() { return { content: '{"conclusion":"smoke test ok","confidence":0.9,"sentiment":"bullish","reasoning":["test"]}' }; }
}

describe("smoke test — full engine pipeline", () => {
  it("builds and executes bull-bear workflow", async () => {
    const registry = new Registry();
    registerBuiltinAgents(registry);

    const dag = WORKFLOWS["bull-bear"];
    expect(dag).toBeDefined();

    const scheduler = new Scheduler(registry);
    const ctx = cc({ type: "stock", code: "600519", name: "茅台" }, "smoke test", dag.name);
    const result = await scheduler.execute(dag, ctx, { llm: new SmokeModel() as any });

    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("LLM parsers work", () => {
    expect(parseLLMJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseSentiment("bullish")).toBe("bullish");
  });
});
```

- [ ] **Step 2: Run all tests**

```bash
cd nextjs-app && pnpm vitest run
# Expected: all tests PASS (engine unit tests + smoke test + component tests)
```

- [ ] **Step 3: Verify SSR rendering**

```bash
cd nextjs-app && pnpm build && pnpm start
# Open http://localhost:3000 — landing page renders
# Open http://localhost:3000/analyze/nonexistent — shows "分析记录不存在"
```

- [ ] **Step 4: Final commit**

```bash
git add __tests__/smoke.test.ts
git commit -m "test: add smoke tests and final verification"
```
