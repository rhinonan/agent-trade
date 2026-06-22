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

