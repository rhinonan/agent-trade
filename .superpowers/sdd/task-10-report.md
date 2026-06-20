# Task 10 Fix Report: Debate Primitive Bugfixes

**Date:** 2026-06-20
**File:** `packages/core/src/workflow/primitives/debate.ts`

---

## Bug 1 (CRITICAL): Multi-round debate disconnected history

**Root cause:** `roundEntries` resets to `[]` each round, and the `history` was built only from the current round's entries. Agents in round 2+ could not see prior round arguments.

**Fix:** Before each round, compute `priorRoundsText` from `currentCtx.debateRounds` (which accumulates via `addDebateRound` at the end of each round). Inside the agent loop, combine `priorRoundsText` with `currentRoundText` to form the full `history`.

```typescript
// Per-round: accumulated from previous rounds
const priorRoundsText = currentCtx.debateRounds
    .flatMap(r => r.entries)
    .map(e => `[${e.agent}]: ${e.argument}`)
    .join("\n");

// Per-agent: current round entries so far
const currentRoundText = roundEntries
    .map(e => `[${e.agent}]: ${e.argument}`)
    .join("\n");
const history = [priorRoundsText, currentRoundText].filter(Boolean).join("\n");
```

---

## Bug 2 (MAJOR): Unsafe `step.agent` cast bypasses `registry.match()`

**Root cause:** Line 24 cast `step.agent as { id: string }[]` which is unsound -- single `AgentMatch` objects or capability-based matches fail. Agents were then fetched manually via `registry.get()`.

**Fix:** Use `registry.match()` like `panel.ts` and `analyze.ts` do. The match resolution follows this priority:
1. `step.match` if provided (explicit match)
2. If `step.agent` is an array, fall back to `{ capability: undefined }` (match all, pick first N)
3. Otherwise use `step.agent` as-is (single `AgentMatch` object)

```typescript
const match = step.match ?? (Array.isArray(step.agent) ? { capability: undefined } : step.agent);
const matchedAgents = registry.match(match as any, step.count ?? { min: 2 });
if (matchedAgents.length < 2) throw new Error("Debate requires at least 2 agents");
const agentIds = matchedAgents.map(a => a.id);
const agents = matchedAgents;
```

---

## Additional note

- **AIMessage import:** Not present on line 1 (only `HumanMessage, SystemMessage, type BaseMessage` are imported). No removal needed.
- **agentIds variable:** Retained for compatibility with the user's spec, though it is computed from `matchedAgents.map(a => a.id)` and the `agents` array is used directly.

---

## Test results

All 31 tests pass across 11 test files, including 2 debate tests.

| Test file | Tests | Status |
|-----------|-------|--------|
| registry.test.ts | 6 | PASS |
| context.test.ts | 6 | PASS |
| loader.test.ts | 3 | PASS |
| analyze.test.ts | 3 | PASS |
| **debate.test.ts** | **2** | **PASS** |
| panel.test.ts | 2 | PASS |
| synthesize.test.ts | 1 | PASS |
| critique.test.ts | 2 | PASS |
| human-agent.test.ts | 2 | PASS |
| types.test.ts | 3 | PASS |
| vote.test.ts | 1 | PASS |
| **Total** | **31** | **PASS** |
