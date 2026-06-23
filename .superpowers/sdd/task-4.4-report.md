# Task 4.4 Report: RoleLoader — merge built-in + DB on startup

**Status:** Complete
**Commit:** `2e3cf6f` — `feat: merge built-in + DB roles on startup via RoleLoader`

## Files Modified

1. **`nextjs-app/lib/role-loader/loader.ts`** — Core RoleLoader changes
   - Added `workflows` Map to store `WorkflowYaml` objects
   - Added `scanWorkflows(dir: string)` — scans directory for workflow YAML files, validates each, stores in map
   - Added `loadWorkflowYaml(raw: string, source: string)` — parses raw YAML string, validates against `WorkflowYamlSchema`, stores in workflows map
   - Added `loadFromDB(userId: string)` — dynamically imports `RoleRepo` and `getDb`, lists agent + workflow roles for the user, calls `loadAgentYaml` / `loadWorkflowYaml` for each, logs warnings for invalid roles
   - Added accessors: `getWorkflow(name)`, `listWorkflows()`, `hasWorkflow(name)`
   - Updated `clear()` to also clear workflows map

2. **`nextjs-app/lib/langgraph/runner.ts`** — Updated `ensureAgentsLoaded()`
   - Split the single guard into separate `_builtinAgentsLoaded` / `_builtinWorkflowsLoaded` flags
   - Added workflow scanning: `loader.scanWorkflows()` called idempotently on first use
   - Both built-in agent and workflow roles are now auto-loaded on first API request

3. **`nextjs-app/app/api/analyze/route.ts`** — Per-user DB loading
   - Added `loadFromDB(userId)` call in `runAnalysis()` before `loadWorkflowYaml()`
   - Only called for non-anonymous users (`userId !== "anonymous"`)
   - Uses dynamic import to avoid circular dependencies

## Design Decisions

- **No server.mjs changes**: `server.mjs` runs as plain Node.js (`node server.mjs`) and cannot import `.ts` files directly. Built-in role scanning was moved to `ensureAgentsLoaded()` in `runner.ts`, which goes through Next.js's TypeScript compilation pipeline. This achieves the same "on startup" effect — roles are loaded on first API request, before any workflow runs.
- **Idempotent guards**: Built-in scanning uses process-level flags (`_builtinAgentsLoaded`, `_builtinWorkflowsLoaded`) to ensure scanning happens only once per process lifetime.
- **Per-user DB loading**: `loadFromDB(userId)` is called each time an analyze request is made for an authenticated user, ensuring user-uploaded roles are always fresh.

## Test Results

- **48 test files passed**, 1 skipped (pre-existing)
- **271 tests passed**, 6 skipped (pre-existing)
- **No regressions** — all existing tests pass
- TypeScript lint errors in test files are pre-existing (unrelated to this task)

---

# Code Review Fix Report

**Date:** 2026-06-23
**Review:** `review-2c13d26..2e3cf6f.diff`
**Result:** All Critical and Important findings fixed. 0 regressions.

---

## C1. `{{state.*}}` variables in workflow YAML prompts never interpolated at runtime

**File:** `lib/langgraph/nodes.ts`

Added `resolveStateVariables(template, state)` function that interpolates:
- `{{target}}` -- the analysis target code
- `{{round}}` -- current workflow round
- `{{findings}}` -- formatted JSON list of all findings
- `{{state.<node_id>}}` -- JSON of a specific node's finding
- `{{state.<node_id>.<field>}}` -- specific field of a node's finding (e.g. `{{state.tech-analyst.conclusion}}`)

`buildAgentNode` now calls `resolveStateVariables()` instead of only substituting `{{target}}`.

**File:** `lib/langgraph/debate.ts`

Added `resolveDebateTemplate(template, state, role, opponentRole)` function that interpolates:
- `{{role}}`, `{{round}}`, `{{target}}`
- `{{opponent.last_argument}}` -- last message from the opposing role
- `{{findings}}` -- formatted JSON list of all findings

`buildDebateSpeakerNode` now receives `promptTemplate` and `opponentRole` parameters and uses `resolveDebateTemplate()` instead of a hardcoded prompt.

---

## C2. Cross-user data leak via process-scoped singleton RoleLoader

**File:** `lib/role-loader/loader.ts`

- Added `dbLoadedAgentIds` and `dbLoadedWorkflowIds` sets to track which entries came from DB
- `loadAgentYaml()` and `loadWorkflowYaml()` now tag DB-loaded entries (source starts with `"db:"`)
- Added `clearDBRoles()` public method that removes only DB-loaded entries before loading a new user's roles
- `loadFromDB()` calls `clearDBRoles()` first, ensuring no cross-user data leak
- `clear()` also resets the DB tracking sets

---

## I1. Debate subgraph off-by-one: `max_rounds` produces N+1 rounds

**File:** `lib/langgraph/debate.ts:69`

Changed `if (state.round >= config.max_rounds) return END;` to `if (state.round >= config.max_rounds - 1) return END;`.

Since the round counter starts at 0 and is incremented by `incrementRoundNode`, `max_rounds: 3` should produce exactly 3 rounds (rounds 0, 1, 2). Without this fix, it would produce 4 rounds (0, 1, 2, 3).

---

## I2. Tool type mismatch: `CompiledAgent.tools` uses `ToolDefinition[]` but LangChain expects `StructuredTool[]`

**File:** `lib/langgraph/nodes.ts`

Added `toolDefinitionToStructuredTool(td: ToolDefinition): StructuredTool` converter using `tool()` from `@langchain/core/tools`. The tool-calling path in `buildAgentNode` now converts `compiled.tools` via this adapter before passing to `createToolCallingAgent` and `AgentExecutor`. The `as any` casts are removed for the tools parameter.

---

## I3. 11 of 20 built-in agent YAMLs reference tools not registered in `toolsByName`

**File:** `lib/tools/index.ts`

Added 10 stub `ToolDefinition` registrations using a `stub()` helper:
- `fund_flow` -- 资金流向数据
- `news` -- 相关新闻资讯
- `announcement` -- 上市公司公告
- `financial_data` -- 财务数据
- `block_trade` -- 大宗交易数据
- `macro_indicator` -- 宏观经济指标
- `quote` -- 实时行情报价
- `indicator` -- 综合技术指标
- `social_sentiment` -- 社交媒体情绪
- `volume` -- 成交量分析

Each stub returns `{ error: "not_implemented", message: "..." }` so agents degrade gracefully to pure LLM reasoning instead of crashing.

---

## I4. `runWorkflow` callback signature mismatch

**File:** `lib/langgraph/runner.ts`

Added `buildAgentNameMap(workflow, loader)` helper that builds a `nodeId → agentName` lookup:
- Standard nodes: `workflow_node_id → node.agent`
- Debate subgraph internal nodes: `p1_speak` / `p2_speak` → corresponding participant agent; `check_yield` / `increment_round` → debate node ID

The callback calls now use `agentNameMap.get(nodeId) ?? nodeId` as the second argument instead of passing `nodeId` twice.

---

## I5. Debate `prompt_template` from YAML ignored

**File:** `lib/langgraph/debate.ts`

The hardcoded prompt `你是${role}方。当前第${state.round}轮辩论。请发表你的论点。` is replaced with `config.prompt_template` interpolated via `resolveDebateTemplate()`. The YAML `prompt_template` field is now passed through to `buildDebateSpeakerNode` and used for all debate rounds.

---

## I6. WorkflowState Annotation reducer API compatibility

**Verified:** LangGraph v0.4.9 (confirmed in `package.json` and type definitions) fully supports `Annotation<T>({ reducer, default })` as documented in `@langchain/langgraph/dist/graph/annotation.d.ts`. No change needed.

---

## Test Results

After all fixes:
- **48 test files passed**, 1 skipped (pre-existing)
- **271 tests passed**, 6 skipped (pre-existing)
- **0 regressions**
- Pre-existing tsc errors in test files (missing `version`, `stop_reason` in test fixtures) are unchanged

## Flow

```
Server start
  └─> First API request arrives
        └─> ensureAgentsLoaded()
              ├─> scanAgents()       [once: loads 20 built-in agents]
              └─> scanWorkflows()    [once: loads 4 built-in workflows]
        └─> loadWorkflowYaml(name)   [loads specific workflow from file]
        └─> loadFromDB(userId)       [per-user: loads custom roles from DB]
        └─> runWorkflow()            [compiles and executes with all roles available]
```
