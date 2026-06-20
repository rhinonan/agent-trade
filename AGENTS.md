# AGENTS.md — AI Assistant Guidelines for AgentTrade

## Project Overview

AgentTrade is a TypeScript + Python multi-agent adversarial market analysis framework. Core framework is open source (Apache 2.0); advanced features are commercial.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Agent framework, workflow engine, CLI | TypeScript 5.x, Node.js 20+ |
| LLM abstraction | LangChain.js (`@langchain/core`, `@langchain/anthropic`, `@langchain/openai`) |
| Package management | pnpm workspaces (monorepo) |
| Testing (TS) | vitest |
| Data service | Python 3.11+, FastAPI, akshare |
| Testing (Python) | pytest + httpx |

## Monorepo Structure

```
packages/
├── core/          @agenttrade/core        — types, AgentRegistry, workflow engine
├── agents/        @agenttrade/agents      — built-in agent implementations
├── data-client/   @agenttrade/data-client — standalone TS client for Python service
└── cli/           @agenttrade/cli         — Commander.js CLI + workflow definitions
d2-data/           Python data microservice (FastAPI, separate runtime)
```

### Dependency Flow

```
data-client (zero deps)
  ↑
core (depends on: langchain)
  ↑
agents (depends on: core, data-client)
  ↑
cli (depends on: core, agents, data-client, commander, chalk, dotenv)
```

Python `d2-data/` is independent — no dependencies on TS packages.

## Coding Conventions

### TypeScript

- **Module system:** ESM (`"type": "module"`, `.js` extensions in imports)
- **Strict mode:** `strict: true` in tsconfig — no `any` without explicit cast
- **Immutability:** Context operations (`addFinding`, `addDebateRound`) return new objects
- **Types:** All public APIs must have explicit return types
- **Tests:** `__tests__/` directory per package, vitest, one test file per source module
- **LLM:** Never call Anthropic/OpenAI SDKs directly — always through `createLLM()` in `llm.ts`

### Python

- **Framework:** FastAPI with type hints on all endpoints
- **Testing:** pytest with `httpx.ASGITransport` for async HTTP tests
- **Data:** Use `akshare` for A-share data; mock in tests via `monkeypatch`
- **No agent logic:** This service is a pure data layer

## Key Patterns

### Agent Extension

```typescript
// 1. Implement BaseAgent interface
class MyAgent implements BaseAgent {
  id: string;
  name: string;
  capabilities: Capability[];
  personality: AgentPersona;
  tools: StructuredTool[];
  async analyze(context: ExecutionContext): Promise<Analysis> { ... }
}

// 2. Register instance
registry.register(new MyAgent({ id: "my-1", personality: { stance: "bullish" } }));
```

### Workflow Definition

```typescript
// Use Builder DSL — produces JSON DAG
const wf = defineWorkflow({ name: "my-wf" })
  .step("step1", analyze({ agent: { capability: "x" }, prompt: "..." }))
  .step("step2", synthesize({ agent: "judge", prompt: "..." }))
  .build();
```

### Adding a New Primitive

1. Create `packages/core/src/workflow/primitives/<name>.ts`
2. Export function: `execute<Name>(step, registry, context, options?) → Promise<ExecutionContext>`
3. Add case to `scheduler.ts` switch statement
4. Add DSL constructor to `builder.ts`
5. Add export to `packages/core/src/index.ts`
6. Write tests with `FakeChatModel`

## Testing

```bash
# All tests
pnpm test

# Single package
pnpm --filter @agenttrade/core test

# Python
cd d2-data && python -m pytest tests/ -v

# Watch mode
pnpm --filter @agenttrade/core test:watch
```

## Common Pitfalls

- `ExecutionContext` is immutable — always use return value from `addFinding()`
- Agent `analyze()` method is NOT called by the scheduler (MVP simplification); LLM interaction happens in primitives
- Workflow definitions live in `packages/cli/src/workflows/`, not the root
- Python service must be running separately (`python main.py` on :9500)
- `DataClient` default URL is `localhost:9500` — override via `DATA_SERVICE_URL` env var
- `parseLLMJson()` handles both ` ```json ` and bare ` ``` ` code fences

## API Key Setup

Copy `.env.example` to `.env` and fill in keys. The CLI loads `.env` via dotenv at startup. Supported providers:
- `deepseek` — `OPENAI_API_KEY`, baseURL `https://api.deepseek.com/v1`
- `openai` — `OPENAI_API_KEY`
- `anthropic` — `ANTHROPIC_API_KEY`
