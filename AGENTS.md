# AGENTS.md — AI Assistant Guidelines for AgentTrade

## Project Overview

AgentTrade is a Next.js full-stack application implementing a multi-agent adversarial market analysis framework. The engine is open source (AGPL-3.0).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Web framework | Next.js 15 (App Router), React 18 |
| UI | shadcn/ui + Tailwind CSS 4 |
| Language | TypeScript 5.x, strict mode |
| LLM abstraction | LangChain.js (`@langchain/core`, `@langchain/anthropic`, `@langchain/openai`) |
| Real-time | Socket.IO (namespace `/analysis`) |
| Database | SQLite (better-sqlite3) |
| Testing | Vitest + @testing-library/react (jsdom) |
| Data service | Python 3.11+ FastAPI + akshare (separate repo: `d2-data`) |

## Project Structure

```
nextjs-app/
├── app/                          Next.js App Router
│   ├── layout.tsx                Root layout (zh-CN, dark theme)
│   ├── page.tsx                  Landing page (stock search + workflow selector)
│   ├── analyze/[id]/
│   │   ├── page.tsx              SSR analysis page (reads SQLite)
│   │   └── client.tsx            Client hydration (WebSocket live updates)
│   └── api/
│       ├── analyze/route.ts      POST — start analysis
│       ├── analyze/[id]/route.ts GET — analysis result
│       └── workflows/route.ts    GET — list workflows
├── components/
│   ├── ui/                       shadcn/ui primitives (Button, Card, Input)
│   ├── landing/                  StockSearchInput, WorkflowSelector
│   └── analysis/                 AnalysisHeader, StepProgress, LiveDebatePanel,
│                                  AgentBubble, ConclusionCard
├── hooks/
│   └── useAnalysisSocket.ts      Socket.IO client hook
├── lib/
│   ├── engine/                   Workflow engine
│   │   ├── types.ts              All core types
│   │   ├── registry.ts           AgentRegistry (register/get/match)
│   │   ├── context.ts            ExecutionContext (immutable)
│   │   ├── scheduler.ts          WorkflowScheduler (DAG execution)
│   │   ├── builder.ts            Workflow DSL (defineWorkflow)
│   │   ├── index.ts              Barrel export
│   │   └── primitives/           analyze, critique, debate, panel,
│   │                              synthesize, vote
│   ├── agents/                   Built-in agent implementations
│   │   ├── technical.ts          TechnicalAnalystAgent
│   │   ├── fundamental.ts        FinancialReportAgent
│   │   ├── judge.ts              JudgeAgent
│   │   └── index.ts              registerBuiltinAgents()
│   ├── workflows/                Workflow definitions
│   │   ├── bull-bear.ts
│   │   ├── quick-scan.ts
│   │   └── index.ts              WORKFLOWS registry
│   ├── data/                     Python data service HTTP client
│   │   ├── client.ts             DataClient
│   │   └── types.ts              Response types
│   ├── llm/                      LLM abstraction
│   │   ├── create-llm.ts         Provider factory (deepseek/openai/anthropic)
│   │   └── parse.ts              parseLLMJson, parseSentiment
│   ├── socket/                   Socket.IO server
│   │   ├── server.ts             createSocketServer, singleton
│   │   └── events.ts             Event name constants + payload types
│   └── db/                       SQLite persistence
│       ├── client.ts             getDb (singleton, WAL mode)
│       └── analysis-repo.ts      AnalysisRepo (CRUD)
├── server.mjs                    Custom Next.js server (loads Socket.IO)
├── package.json
├── tsconfig.json
├── next.config.ts
├── vitest.config.ts
└── vitest.setup.ts
```

## Coding Conventions

### TypeScript

- **Module system:** ESM (`"type": "module"`, `.js` extensions in imports)
- **Strict mode:** `strict: true` — no `any` in production code
- **Immutability:** Context operations (`addFinding`, `addDebateRound`) return new objects
- **Types:** All public APIs must have explicit return types
- **Tests:** `__tests__/` directory co-located or per module, vitest, one test file per source module
- **LLM:** Never call Anthropic/OpenAI SDKs directly — always through `createLLM()` in `lib/llm/create-llm.ts`
- **Path alias:** `@/*` maps to `nextjs-app/*` for imports

### React / Next.js

- **Server/Client split:** Page components are server components by default; interactive components use `"use client"` directive
- **SSR strategy:** Analysis page renders existing data server-side; `AnalysisLiveClient` hydrates for WebSocket updates
- **Components:** Use shadcn/ui patterns (`cva`, `forwardRef`, `cn()` utility)

### Socket.IO

- **Event contract:** Use `WS_EVENTS` constants from `lib/socket/events.ts`
- **Namespace:** `/analysis` for all real-time analysis events
- **Rooms:** Each analysis session gets its own Socket.IO room (`sessionId`)
- **Client:** Import `useAnalysisSocket` hook from `hooks/useAnalysisSocket.ts`

## Key Patterns

### Agent Extension

```typescript
import type { BaseAgent, AgentPersona, Analysis, ExecutionContext } from "@/lib/engine";

class MyAgent implements BaseAgent {
  id: string;
  name: string;
  capabilities: Capability[];
  personality: AgentPersona;
  tools: StructuredTool[];
  async analyze(context: ExecutionContext): Promise<Analysis> { ... }
}
```

Register in `lib/agents/index.ts` via `registerBuiltinAgents()`.

### Workflow Definition

```typescript
import { defineWorkflow, analyze, synthesize } from "@/lib/engine";

const wf = defineWorkflow({ name: "my-wf" })
  .step("step1", analyze({ agent: { capability: "x" }, prompt: "..." }))
  .step("step2", synthesize({ agent: "judge", prompt: "..." }))
  .build();
```

Register in `lib/workflows/index.ts` in the `WORKFLOWS` object.

### Adding a New Primitive

1. Create `lib/engine/primitives/<name>.ts`
2. Export: `execute<Name>(step, registry, context, options?) → Promise<ExecutionContext>`
3. Add case to `scheduler.ts` switch (both `execute()` and `executeSubStep()`)
4. Add DSL constructor to `builder.ts`
5. Add export to `lib/engine/index.ts`
6. Write tests with `FakeChatModel` (inject via `options.llm`)

### Adding an API Route

1. Create `app/api/<path>/route.ts`
2. Export `GET`/`POST`/etc. as named exports
3. Use `NextRequest`/`NextResponse` from `next/server`
4. Import engine/services via `@/lib/...` path alias

## Testing

```bash
# All tests
cd nextjs-app && pnpm test

# Single file
cd nextjs-app && pnpm vitest run lib/engine/__tests__/registry.test.ts

# Watch mode
cd nextjs-app && pnpm vitest

# Integration tests (requires data service + API keys)
cd nextjs-app && pnpm vitest run __tests__/integration/

# Type check
cd nextjs-app && pnpm lint
```

## Common Pitfalls

- `ExecutionContext` is immutable — always use return value from `addFinding()`
- Agent `analyze()` method is NOT called by the scheduler; LLM interaction happens in primitives
- Workflow definitions live in `lib/workflows/`, not `app/`
- Python data service must be running separately (`python main.py` on `:9500`)
- `DataClient` default URL is `localhost:9500` — override via `dataServiceUrl` in API request
- `parseLLMJson()` handles both ` ```json ` and bare ` ``` ` code fences
- `useAnalysisSocket` must be called inside `useEffect` or client component (uses `window.location`)
- `server.mjs` inlines Socket.IO init — keep in sync with `lib/socket/server.ts`

## API Key Setup

Copy `.env.example` to `.env` and fill in keys:
- `deepseek` — `OPENAI_API_KEY`, baseURL `https://api.deepseek.com/v1`
- `openai` — `OPENAI_API_KEY`
- `anthropic` — `ANTHROPIC_API_KEY`

## Subagent Model Tiering

When dispatching sub-agents (via `Agent` tool or Workflow `agent()`), select the model based on task complexity:

| Tier | Model | When to Use |
|------|-------|-------------|
| **T0 — Trivial** | `haiku` | File search (Explore agent), grep/pattern matching, reading known paths, simple lookups, finding config values. Tasks where you just need to locate something. |
| **T1 — Routine** | `sonnet` | General feature implementation, refactoring, writing tests, fixing straightforward bugs, adding components, updating API routes. The default for most implementation work. |
| **T2 — Review** | `opus` | Code review (`/code-review`), security audit, architectural decisions, complex debugging, designing new primitives or workflow definitions, LLM prompt engineering. |
| **T3 — Critical** | `fable` | Adversarial verification of findings, mission-critical design decisions, complex multi-step reasoning chains, judging the correctness of other agents' output. Use sparingly — only when you cannot afford a mistake. |

### Workflow script convention

```js
// Trivial search phase
agent("find all workflow files", { model: "haiku", phase: "Scan" })

// Implementation phase (default — omit model to inherit)
agent("implement the new primitive", { phase: "Implement" })

// Critical review phase
agent("adversarially verify the fix", { model: "fable", phase: "Verify" })
```

### Default rule

When in doubt, **omit `model`** — the subagent inherits the session model, which is correct for most tasks. Only set it explicitly when the task is clearly cheaper (Haiku) or more demanding (Opus/Fable) than average.
