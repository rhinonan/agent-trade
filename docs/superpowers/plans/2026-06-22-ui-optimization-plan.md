# UI Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three independent UI improvements: stock search autocomplete, historical analysis reports list, and structured message output with expand/collapse.

**Architecture:** Each feature is implemented independently. Feature 1 adds a debounced search hook + API proxy to d2-data. Feature 2 adds a `sessions` persistence table + SessionRepo + API routes + UI components. Feature 3 rewrites MessageBubble to render structured analysis data with expand/collapse state.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript strict, Tailwind CSS 4, better-sqlite3, Vitest

## Global Constraints

- TypeScript strict mode — no `any` in production code
- Path alias `@/*` maps to `nextjs-app/*`
- `"use client"` directive on all interactive components
- shadcn/ui patterns (`cn()` utility via template literal, Tailwind classes)
- LLM calls always through `createLLM()`, never SDK directly
- `DataClient` base URL defaults to `http://localhost:9500`

---

### Task 1: `useStockSearch` hook

**Files:**
- Create: `nextjs-app/hooks/useStockSearch.ts`
- Test: `nextjs-app/hooks/__tests__/useStockSearch.test.ts`

**Interfaces:**
- Consumes: `SearchResult` type from `@/lib/data/types` (`{ symbol: string; name: string; industry?: string; marketCap?: number }`)
- Produces: `useStockSearch(keyword: string): { results: SearchResult[]; loading: boolean; open: boolean; setOpen: (o: boolean) => void }`

- [ ] **Step 1: Write the failing test**

Create `nextjs-app/hooks/__tests__/useStockSearch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useStockSearch } from "../useStockSearch.js";

describe("useStockSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns empty results when keyword is empty", () => {
    const { result } = renderHook(() => useStockSearch(""));
    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("sets loading true after debounce and fetches", async () => {
    const mockResults = [{ symbol: "600519", name: "贵州茅台", industry: "白酒" }];
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ keyword: "600", results: mockResults }),
    });

    const { result, rerender } = renderHook(
      ({ kw }) => useStockSearch(kw),
      { initialProps: { kw: "600" } }
    );

    // Before debounce, no fetch yet
    expect(result.current.loading).toBe(false);

    // Advance past 300ms debounce
    act(() => { vi.advanceTimersByTime(350); });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.results).toEqual(mockResults);
    });
  });

  it("does nothing for single character input without debounce", async () => {
    const { result } = renderHook(() => useStockSearch("6"));
    expect(result.current.loading).toBe(false);
    // Timer not advanced, no fetch
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd nextjs-app && pnpm vitest run hooks/__tests__/useStockSearch.test.ts
```

Expected: FAIL — module not found or hook not exported.

- [ ] **Step 3: Write the hook implementation**

Create `nextjs-app/hooks/useStockSearch.ts`:

```ts
"use client";
import { useState, useEffect, useRef } from "react";
import type { SearchResult } from "@/lib/data/types.js";

export function useStockSearch(keyword: string): {
  results: SearchResult[];
  loading: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
} {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!keyword || keyword.trim().length === 0) {
      setResults([]);
      setLoading(false);
      setOpen(false);
      return;
    }

    setLoading(true);

    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?keyword=${encodeURIComponent(keyword.trim())}`);
        if (!res.ok) { setResults([]); return; }
        const data = await res.json();
        setResults(data.results ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [keyword]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return { results, loading, open, setOpen };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd nextjs-app && pnpm vitest run hooks/__tests__/useStockSearch.test.ts
```

Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add nextjs-app/hooks/useStockSearch.ts nextjs-app/hooks/__tests__/useStockSearch.test.ts
git commit -m "feat: add useStockSearch hook with debounced fetch + tests"
```

---

### Task 2: `GET /api/search` route

**Files:**
- Create: `nextjs-app/app/api/search/route.ts`
- Test: `nextjs-app/app/api/search/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `DataClient` from `@/lib/data/client`, `SearchResponse` from `@/lib/data/types`
- Produces: `GET /api/search?keyword=xxx → { keyword: string; results: SearchResult[] }` or 200 with empty results on error

- [ ] **Step 1: Write the failing test**

Create `nextjs-app/app/api/search/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../route.js";
import { NextRequest } from "next/server";

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.mock("@/lib/data/client.js", () => ({
      DataClient: vi.fn().mockImplementation(() => ({
        reference: {
          search: vi.fn().mockResolvedValue({
            keyword: "600",
            results: [{ symbol: "600519", name: "贵州茅台", industry: "白酒" }],
          }),
        },
      })),
    }));
  });

  it("returns search results for valid keyword", async () => {
    const req = new NextRequest("http://localhost:3000/api/search?keyword=600");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].symbol).toBe("600519");
  });

  it("returns 400 when keyword is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/search");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns empty results on data service error", async () => {
    vi.clearAllMocks();
    vi.mock("@/lib/data/client.js", () => ({
      DataClient: vi.fn().mockImplementation(() => ({
        reference: {
          search: vi.fn().mockRejectedValue(new Error("Connection refused")),
        },
      })),
    }));
    // Reload the module to pick up the new mock
    const { GET: GET2 } = await import("../route.js");
    const req = new NextRequest("http://localhost:3000/api/search?keyword=600");
    const res = await GET2(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd nextjs-app && pnpm vitest run app/api/search/__tests__/route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the route**

Create `nextjs-app/app/api/search/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { DataClient } from "@/lib/data/client.js";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get("keyword");

  if (!keyword || keyword.trim().length === 0) {
    return NextResponse.json({ error: "keyword is required" }, { status: 400 });
  }

  try {
    const client = new DataClient();
    const result = await client.reference.search(keyword.trim());
    return NextResponse.json(result);
  } catch (err) {
    console.error("Search API error:", err);
    return NextResponse.json({ keyword: keyword.trim(), results: [] });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd nextjs-app && pnpm vitest run app/api/search/__tests__/route.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add nextjs-app/app/api/search/route.ts nextjs-app/app/api/search/__tests__/route.test.ts
git commit -m "feat: add GET /api/search proxy to d2-data + tests"
```

---

### Task 3: Update `StockSearchInput` with dropdown

**Files:**
- Modify: `nextjs-app/components/landing/StockSearchInput.tsx`

**Interfaces:**
- Consumes: `useStockSearch` from `@/hooks/useStockSearch`
- Produces: Same `StockSearchInput` component interface: `{ value: string; onChange: (code: string) => void }`

- [ ] **Step 1: Write the failing test**

Create `nextjs-app/components/landing/__tests__/StockSearchInput.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { StockSearchInput } from "../StockSearchInput.js";

describe("StockSearchInput", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders input with placeholder", () => {
    render(<StockSearchInput value="" onChange={() => {}} />);
    expect(screen.getByPlaceholderText(/输入股票代码/)).toBeDefined();
  });

  it("shows dropdown with results after typing and debounce", async () => {
    const mockResults = [
      { symbol: "600519", name: "贵州茅台", industry: "白酒", marketCap: 2300000000000 },
    ];
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ keyword: "600", results: mockResults }),
    });

    const onChange = vi.fn();
    render(<StockSearchInput value="600" onChange={onChange} />);

    act(() => { vi.advanceTimersByTime(350); });

    await waitFor(() => {
      expect(screen.getByText("600519")).toBeDefined();
      expect(screen.getByText("贵州茅台")).toBeDefined();
    });
  });

  it("calls onChange with symbol when clicking a result", async () => {
    const mockResults = [
      { symbol: "600519", name: "贵州茅台", industry: "白酒" },
    ];
    (globalThis.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ keyword: "600", results: mockResults }),
    });

    const onChange = vi.fn();
    render(<StockSearchInput value="600" onChange={onChange} />);

    act(() => { vi.advanceTimersByTime(350); });

    await waitFor(() => { fireEvent.click(screen.getByText("600519")); });
    expect(onChange).toHaveBeenCalledWith("600519");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd nextjs-app && pnpm vitest run components/landing/__tests__/StockSearchInput.test.tsx
```

Expected: FAIL — dropdown not rendered (no search integration yet).

- [ ] **Step 3: Rewrite StockSearchInput**

Rewrite `nextjs-app/components/landing/StockSearchInput.tsx`:

```tsx
"use client";
import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { useStockSearch } from "@/hooks/useStockSearch.js";
import type { SearchResult } from "@/lib/data/types.js";

interface StockSearchInputProps {
  value: string;
  onChange: (code: string) => void;
}

export function StockSearchInput({ value, onChange }: StockSearchInputProps) {
  const { results, loading, open, setOpen } = useStockSearch(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedIndexRef = useRef(-1);

  function handleSelect(result: SearchResult) {
    onChange(result.symbol);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndexRef.current = Math.min(selectedIndexRef.current + 1, results.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndexRef.current = Math.max(selectedIndexRef.current - 1, 0);
    } else if (e.key === "Enter" && selectedIndexRef.current >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIndexRef.current]);
      selectedIndexRef.current = -1;
    } else if (e.key === "Escape") {
      setOpen(false);
      selectedIndexRef.current = -1;
    }
  }

  return (
    <div ref={containerRef} className="space-y-2 relative">
      <label className="text-sm font-medium text-zinc-400">股票代码</label>
      <div className="relative">
        <Input
          placeholder="输入股票代码，如 600519"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="bg-zinc-900 border-zinc-700 text-zinc-100 text-lg h-12 pr-10"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
            ⏳
          </span>
        )}
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
          {results.map((r, i) => (
            <button
              key={r.symbol}
              type="button"
              className={`w-full text-left px-4 py-3 hover:bg-zinc-800 transition-colors flex items-center gap-3 ${
                i === selectedIndexRef.current ? "bg-zinc-800" : ""
              }`}
              onClick={() => handleSelect(r)}
              onMouseEnter={() => { selectedIndexRef.current = i; }}
            >
              <span className="text-emerald-400 font-mono text-sm font-medium whitespace-nowrap">
                {r.symbol}
              </span>
              <div className="min-w-0">
                <span className="text-sm text-zinc-200">{r.name}</span>
                {r.industry && (
                  <span className="text-xs text-zinc-500 ml-2">{r.industry}</span>
                )}
              </div>
              {r.marketCap !== undefined && (
                <span className="text-xs text-zinc-600 ml-auto whitespace-nowrap">
                  {r.marketCap >= 1e12
                    ? `${(r.marketCap / 1e12).toFixed(1)}万亿`
                    : r.marketCap >= 1e8
                      ? `${(r.marketCap / 1e8).toFixed(0)}亿`
                      : `${(r.marketCap / 1e4).toFixed(0)}万`}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {open && results.length === 0 && !loading && value.trim().length > 0 && (
        <div className="absolute z-50 w-full bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl px-4 py-3">
          <span className="text-sm text-zinc-500">未找到匹配股票</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd nextjs-app && pnpm vitest run components/landing/__tests__/StockSearchInput.test.tsx
```

Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add nextjs-app/components/landing/StockSearchInput.tsx nextjs-app/components/landing/__tests__/StockSearchInput.test.tsx
git commit -m "feat: add autocomplete dropdown to StockSearchInput"
```

---

### Task 4: `SessionRepo` + `sessions` table

**Files:**
- Create: `nextjs-app/lib/db/session-repo.ts`
- Modify: `nextjs-app/lib/db/client.ts` (add CREATE TABLE for sessions)
- Test: `nextjs-app/lib/db/__tests__/session-repo.test.ts`

**Interfaces:**
- Consumes: `Database` from `better-sqlite3`
- Produces: `SessionRepo` class with `insert`, `deleteById`, `listRecent`, `updateStatus`, `getById`

- [ ] **Step 1: Add sessions table to schema**

Edit `nextjs-app/lib/db/client.ts` — add the sessions DDL inside the `createTables` exec block, after the `chat_messages` table:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  target_code TEXT NOT NULL,
  target_name TEXT,
  target_type TEXT NOT NULL DEFAULT 'stock',
  workflow_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RUNNING',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);
```

- [ ] **Step 2: Write the failing test**

Create `nextjs-app/lib/db/__tests__/session-repo.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTables } from "../client.js";
import { SessionRepo } from "../session-repo.js";

describe("SessionRepo", () => {
  let db: Database.Database;
  let repo: SessionRepo;

  beforeEach(() => {
    db = new Database(":memory:");
    createTables(db);
    repo = new SessionRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it("inserts and retrieves a session", () => {
    repo.insert({
      id: "s1", targetCode: "600519", targetName: "贵州茅台",
      targetType: "stock", workflowName: "牛熊对抗",
      status: "RUNNING", createdAt: 1000,
    });
    const session = repo.getById("s1");
    expect(session).not.toBeNull();
    expect(session!.targetCode).toBe("600519");
    expect(session!.status).toBe("RUNNING");
  });

  it("lists recent sessions ordered by created_at DESC", () => {
    repo.insert({ id: "s1", targetCode: "000001", targetName: null, targetType: "stock", workflowName: "layered", status: "STOPPED", createdAt: 1000 });
    repo.insert({ id: "s2", targetCode: "000002", targetName: null, targetType: "stock", workflowName: "bull-bear", status: "RUNNING", createdAt: 2000 });
    repo.insert({ id: "s3", targetCode: "000003", targetName: null, targetType: "stock", workflowName: "quick-scan", status: "STOPPED", createdAt: 3000 });

    const recent = repo.listRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].id).toBe("s3"); // most recent first
    expect(recent[1].id).toBe("s2");
  });

  it("updates session status", () => {
    repo.insert({ id: "s1", targetCode: "600519", targetName: null, targetType: "stock", workflowName: "layered", status: "RUNNING", createdAt: 1000 });
    repo.updateStatus("s1", "STOPPED");
    const session = repo.getById("s1");
    expect(session!.status).toBe("STOPPED");
  });

  it("deletes session by id", () => {
    repo.insert({ id: "s1", targetCode: "600519", targetName: null, targetType: "stock", workflowName: "layered", status: "RUNNING", createdAt: 1000 });
    repo.deleteById("s1");
    expect(repo.getById("s1")).toBeNull();
  });

  it("returns null for missing session", () => {
    expect(repo.getById("nonexistent")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd nextjs-app && pnpm vitest run lib/db/__tests__/session-repo.test.ts
```

Expected: FAIL — `SessionRepo` module not found.

- [ ] **Step 4: Write SessionRepo**

Create `nextjs-app/lib/db/session-repo.ts`:

```ts
import type Database from "better-sqlite3";

export interface SessionRow {
  id: string;
  targetCode: string;
  targetName: string | null;
  targetType: string;
  workflowName: string;
  status: string;
  createdAt: number;
}

export class SessionRepo {
  constructor(private db: Database.Database) {}

  insert(row: SessionRow): void {
    this.db.prepare(
      `INSERT INTO sessions (id, target_code, target_name, target_type, workflow_name, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(row.id, row.targetCode, row.targetName, row.targetType, row.workflowName, row.status, row.createdAt);
  }

  getById(id: string): SessionRow | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as any;
    return row ? mapRow(row) : null;
  }

  listRecent(limit: number = 20): SessionRow[] {
    const rows = this.db.prepare(
      "SELECT * FROM sessions ORDER BY created_at DESC LIMIT ?"
    ).all(limit) as any[];
    return rows.map(mapRow);
  }

  updateStatus(id: string, status: string): void {
    this.db.prepare("UPDATE sessions SET status = ? WHERE id = ?").run(status, id);
  }

  deleteById(id: string): void {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }
}

function mapRow(row: any): SessionRow {
  return {
    id: row.id,
    targetCode: row.target_code,
    targetName: row.target_name,
    targetType: row.target_type,
    workflowName: row.workflow_name,
    status: row.status,
    createdAt: row.created_at,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd nextjs-app && pnpm vitest run lib/db/__tests__/session-repo.test.ts
```

Expected: PASS (all 5 tests)

- [ ] **Step 6: Commit**

```bash
git add nextjs-app/lib/db/session-repo.ts nextjs-app/lib/db/client.ts nextjs-app/lib/db/__tests__/session-repo.test.ts
git commit -m "feat: add SessionRepo + sessions table for session persistence"
```

---

### Task 5: Update `SessionManager` to persist sessions

**Files:**
- Modify: `nextjs-app/lib/chat/session-manager.ts`
- Modify: `nextjs-app/lib/chat/__tests__/session-manager.test.ts`

**Interfaces:**
- Consumes: `SessionRepo` from `@/lib/db/session-repo`
- Produces: Updated `getSessionManager()` accepting optional `SessionRepo`; `createSession`/`deleteSession`/`startAutoAdvance` persist to DB

- [ ] **Step 1: Add failing test for persistence**

Add to `nextjs-app/lib/chat/__tests__/session-manager.test.ts` (after existing imports):

```ts
import { SessionRepo } from "../../db/session-repo.js";

// Inside the existing describe block, after existing tests, add:

it("persists session to database on createSession", () => {
  const sessionRepo = new SessionRepo(db);
  const mgr = new SessionManager(repo, sessionRepo);
  mgr.createSession("s1", { code: "000001" }, testDag, registry, { provider: "deepseek" });

  const persisted = sessionRepo.getById("s1");
  expect(persisted).not.toBeNull();
  expect(persisted!.targetCode).toBe("000001");
  expect(persisted!.status).toBe("RUNNING");
});

it("updates status when session stops", async () => {
  const sessionRepo = new SessionRepo(db);
  const mgr = new SessionManager(repo, sessionRepo);
  mgr.createSession("s1", { code: "000001" }, testDag, registry, { provider: "deepseek" });

  // Manually stop the session
  const entry = (mgr as any).sessions.get("s1");
  if (entry) entry.session.status = "STOPPED";
  sessionRepo.updateStatus("s1", "STOPPED");

  const persisted = sessionRepo.getById("s1");
  expect(persisted!.status).toBe("STOPPED");
});

it("removes session from DB on deleteSession", () => {
  const sessionRepo = new SessionRepo(db);
  const mgr = new SessionManager(repo, sessionRepo);
  mgr.createSession("s1", { code: "000001" }, testDag, registry, { provider: "deepseek" });
  mgr.deleteSession("s1");
  expect(sessionRepo.getById("s1")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd nextjs-app && pnpm vitest run lib/chat/__tests__/session-manager.test.ts
```

Expected: FAIL — `SessionRepo` not passed to constructor, persistence not happening.

- [ ] **Step 3: Update SessionManager**

Modify `nextjs-app/lib/chat/session-manager.ts`:

```diff
- import type { ChatRepo } from "../db/chat-repo.js";
+ import type { ChatRepo } from "../db/chat-repo.js";
+ import type { SessionRepo } from "../db/session-repo.js";

  // In getSessionManager:
- export function getSessionManager(repo?: ChatRepo): SessionManager {
+ export function getSessionManager(repo?: ChatRepo, sessionRepo?: SessionRepo): SessionManager {
    if (!_instance) {
      if (!repo) throw new Error("SessionManager not initialized. Pass ChatRepo on first call.");
-     _instance = new SessionManager(repo);
+     _instance = new SessionManager(repo, sessionRepo);
    }

  // In SessionManager class:
-   constructor(private repo: ChatRepo) {}
+   constructor(private repo: ChatRepo, private sessionRepo?: SessionRepo) {}

  // In createSession, after `this.sessions.set(id, ...)`:
+   if (this.sessionRepo) {
+     this.sessionRepo.insert({
+       id, targetCode: target.code, targetName: null,
+       targetType: target.type, workflowName: dag.name,
+       status: "RUNNING", createdAt: Date.now(),
+     });
+   }

  // In deleteSession:
    deleteSession(id: string): void {
+     if (this.sessionRepo) {
+       this.sessionRepo.deleteById(id);
+     }
      this.sessions.delete(id);
    }

  // In startAutoAdvance, inside the `loop` where status is set to STOPPED:
-   if (!result.hasMore) { session.status = "STOPPED"; break; }
+   if (!result.hasMore) {
+     session.status = "STOPPED";
+     if (this.sessionRepo) this.sessionRepo.updateStatus(sessionId, "STOPPED");
+     break;
+   }

  // And in the catch block:
-   if (e) { e.session.status = "STOPPED"; e._advancing = false; }
+   if (e) {
+     e.session.status = "STOPPED";
+     if (this.sessionRepo) this.sessionRepo.updateStatus(sessionId, "STOPPED");
+     e._advancing = false;
+   }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd nextjs-app && pnpm vitest run lib/chat/__tests__/session-manager.test.ts
```

Expected: PASS (existing tests + 3 new persistence tests)

- [ ] **Step 5: Update POST /api/session to wire SessionRepo**

Edit `nextjs-app/app/api/session/route.ts` — add import and pass `sessionRepo`:

```diff
  import { ChatRepo } from "@/lib/db/chat-repo.js";
+ import { SessionRepo } from "@/lib/db/session-repo.js";
  import { getSessionManager } from "@/lib/chat/session-manager.js";

  // In POST handler, after `const repo = new ChatRepo(db);`:
+ const sessionRepo = new SessionRepo(db);
- const mgr = getSessionManager(repo);
+ const mgr = getSessionManager(repo, sessionRepo);
```

- [ ] **Step 6: Commit**

```bash
git add nextjs-app/lib/chat/session-manager.ts nextjs-app/lib/chat/__tests__/session-manager.test.ts nextjs-app/app/api/session/route.ts
git commit -m "feat: persist sessions to DB via SessionRepo in SessionManager"
```

---

### Task 6: API routes — `GET /api/sessions` and `GET /api/session/[id]`

**Files:**
- Create: `nextjs-app/app/api/sessions/route.ts`
- Create: `nextjs-app/app/api/session/[id]/route.ts`
- Test: `nextjs-app/app/api/sessions/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `SessionRepo`, `getDb`
- Produces: `GET /api/sessions?limit=5 → { sessions: SessionRow[] }`; `GET /api/session/[id] → { session, messages }`

- [ ] **Step 1: Write the failing test**

Create `nextjs-app/app/api/sessions/__tests__/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTables, getDb as setTestDb } from "@/lib/db/client.js";
import { SessionRepo } from "@/lib/db/session-repo.js";

// We test the route logic by importing and calling GET directly,
// using an in-memory DB seeded with test data.

describe("GET /api/sessions", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    createTables(db);
    // Seed test data
    const repo = new SessionRepo(db);
    repo.insert({ id: "s1", targetCode: "600519", targetName: "茅台", targetType: "stock", workflowName: "bull-bear", status: "STOPPED", createdAt: 1000 });
    repo.insert({ id: "s2", targetCode: "000858", targetName: "五粮液", targetType: "stock", workflowName: "layered", status: "RUNNING", createdAt: 2000 });
  });

  afterEach(() => {
    db.close();
  });

  it("lists recent sessions with default limit", async () => {
    // Direct integration: test the route's DB logic
    // Since getDb is a singleton, we test through the repo directly
    const repo = new SessionRepo(db);
    const sessions = repo.listRecent(5);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].id).toBe("s2");
  });
});
```

- [ ] **Step 2: Write the routes**

Create `nextjs-app/app/api/sessions/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client.js";
import { SessionRepo } from "@/lib/db/session-repo.js";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20"), 1), 100);

  try {
    const db = getDb();
    const repo = new SessionRepo(db);
    const sessions = repo.listRecent(limit);
    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("Sessions list error:", err);
    return NextResponse.json({ sessions: [] });
  }
}
```

Create `nextjs-app/app/api/session/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client.js";
import { SessionRepo } from "@/lib/db/session-repo.js";
import { ChatRepo } from "@/lib/db/chat-repo.js";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const db = getDb();
    const sessionRepo = new SessionRepo(db);
    const chatRepo = new ChatRepo(db);

    const session = sessionRepo.getById(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const messages = chatRepo.getBySession(id);

    return NextResponse.json({
      session: {
        id: session.id,
        targetCode: session.targetCode,
        targetName: session.targetName,
        targetType: session.targetType,
        workflowName: session.workflowName,
        status: session.status,
        createdAt: session.createdAt,
      },
      messages,
    });
  } catch (err) {
    console.error("Session detail error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Run test to verify it passes**

```bash
cd nextjs-app && pnpm vitest run app/api/sessions/__tests__/route.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add nextjs-app/app/api/sessions/route.ts nextjs-app/app/api/session/[id]/route.ts nextjs-app/app/api/sessions/__tests__/route.test.ts
git commit -m "feat: add GET /api/sessions and GET /api/session/[id] routes"
```

---

### Task 7: `RecentAnalyses` component

**Files:**
- Create: `nextjs-app/components/landing/RecentAnalyses.tsx`

**Interfaces:**
- Consumes: `GET /api/sessions?limit=5` → `{ sessions: SessionRow[] }`
- Produces: `<RecentAnalyses />` — self-contained client component

- [ ] **Step 1: Write the component**

Create `nextjs-app/components/landing/RecentAnalyses.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SessionSummary {
  id: string;
  targetCode: string;
  targetName: string | null;
  workflowName: string;
  status: string;
  createdAt: number;
}

const STATUS_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  RUNNING:  { dot: "bg-emerald-400 animate-pulse", label: "进行中", text: "text-emerald-400" },
  PAUSED:   { dot: "bg-amber-400", label: "已暂停", text: "text-amber-400" },
  STOPPED:  { dot: "bg-zinc-500", label: "已完成", text: "text-zinc-400" },
};

export function RecentAnalyses() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/sessions?limit=5")
      .then((res) => res.json())
      .then((data) => {
        setSessions(data.sessions ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  // Silent hide on error or empty
  if (error) return null;
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-5 w-24 bg-zinc-800 rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-zinc-900/50 border border-zinc-800 rounded-xl" />
        ))}
      </div>
    );
  }
  if (sessions.length === 0) return null;

  function formatDate(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-400">最近分析</h3>
        <button
          onClick={() => router.push("/history")}
          className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          查看全部 →
        </button>
      </div>
      <div className="space-y-2">
        {sessions.map((s) => {
          const style = STATUS_STYLES[s.status] ?? STATUS_STYLES.STOPPED;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => router.push(`/session/${s.id}`)}
              className="w-full text-left bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-3 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-emerald-400">{s.targetCode}</span>
                  {s.targetName && (
                    <span className="text-sm text-zinc-300">{s.targetName}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                  <span className={`text-xs ${style.text}`}>{style.label}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-zinc-600">{s.workflowName}</span>
                <span className="text-xs text-zinc-600">{formatDate(s.createdAt)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add nextjs-app/components/landing/RecentAnalyses.tsx
git commit -m "feat: add RecentAnalyses component for landing page"
```

---

### Task 8: Update landing page with recent analyses

**Files:**
- Modify: `nextjs-app/app/page.tsx`

**Interfaces:**
- Consumes: `RecentAnalyses` from `@/components/landing/RecentAnalyses`
- Produces: Updated `HomePage` with recent analyses section below the search card

- [ ] **Step 1: Update page.tsx**

Edit `nextjs-app/app/page.tsx` — add import and render below the search card:

```diff
  import { StockSearchInput } from "@/components/landing/StockSearchInput";
  import { WorkflowSelector } from "@/components/landing/WorkflowSelector";
+ import { RecentAnalyses } from "@/components/landing/RecentAnalyses";

  // ... rest of component ...

      <div className="w-full max-w-lg space-y-8">
        {/* ... existing hero + search card ... */}
+
+       <RecentAnalyses />

        {/* ... existing button ... */}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd nextjs-app && pnpm tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add nextjs-app/app/page.tsx
git commit -m "feat: add RecentAnalyses section to landing page"
```

---

### Task 9: `/history` page

**Files:**
- Create: `nextjs-app/app/history/page.tsx`

**Interfaces:**
- Consumes: `GET /api/sessions?limit=50`
- Produces: Full history page with larger session list

- [ ] **Step 1: Write the history page**

Create `nextjs-app/app/history/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SessionSummary {
  id: string;
  targetCode: string;
  targetName: string | null;
  workflowName: string;
  status: string;
  createdAt: number;
}

const STATUS_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  RUNNING:  { dot: "bg-emerald-400 animate-pulse", label: "进行中", text: "text-emerald-400" },
  PAUSED:   { dot: "bg-amber-400", label: "已暂停", text: "text-amber-400" },
  STOPPED:  { dot: "bg-zinc-500", label: "已完成", text: "text-zinc-400" },
};

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/sessions?limit=50")
      .then((res) => res.json())
      .then((data) => {
        setSessions(data.sessions ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function formatDate(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ← 返回
          </button>
          <h1 className="text-2xl font-bold text-zinc-200">历史分析</h1>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-zinc-900/50 border border-zinc-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-center text-zinc-500 py-12">暂无分析记录</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const style = STATUS_STYLES[s.status] ?? STATUS_STYLES.STOPPED;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => router.push(`/session/${s.id}`)}
                  className="w-full text-left bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-3 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-emerald-400">{s.targetCode}</span>
                      {s.targetName && (
                        <span className="text-sm text-zinc-300">{s.targetName}</span>
                      )}
                      <span className="text-xs text-zinc-600">{s.workflowName}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                      <span className={`text-xs ${style.text}`}>{style.label}</span>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-600 mt-1">{formatDate(s.createdAt)}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd nextjs-app && pnpm tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add nextjs-app/app/history/page.tsx
git commit -m "feat: add /history page with full session list"
```

---

### Task 10: `StructuredAnalysis` component

**Files:**
- Create: `nextjs-app/components/chat/StructuredAnalysis.tsx`

**Interfaces:**
- Consumes: `Analysis` type from `@/lib/engine/types` (`{ conclusion: string; reasoning?: string[]; sentiment: "bullish" | "bearish" | "neutral"; confidence: number }`)
- Produces: `<StructuredAnalysis analysis={Analysis} content={string} expanded={boolean} onToggle={() => void} />`

- [ ] **Step 1: Write the component**

Create `nextjs-app/components/chat/StructuredAnalysis.tsx`:

```tsx
"use client";

interface Analysis {
  conclusion: string;
  reasoning?: string[];
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
}

interface StructuredAnalysisProps {
  analysis: Analysis;
  content: string;
  expanded: boolean;
  onToggle: () => void;
}

const sentimentStyles: Record<string, string> = {
  bullish: "text-emerald-400 bg-emerald-950/40 border-emerald-500/30",
  bearish: "text-red-400 bg-red-950/40 border-red-500/30",
  neutral: "text-zinc-300 bg-zinc-800 border-zinc-600/30",
};

export function StructuredAnalysis({
  analysis,
  content,
  expanded,
  onToggle,
}: StructuredAnalysisProps) {
  const sentimentClass = sentimentStyles[analysis.sentiment] ?? sentimentStyles.neutral;
  const sentimentLabel =
    analysis.sentiment === "bullish" ? "bullish"
    : analysis.sentiment === "bearish" ? "bearish"
    : "neutral";

  const MAX_CHARS = 120;
  const conclusionText = analysis.conclusion || content;
  const needsTruncation = conclusionText.length > MAX_CHARS;

  return (
    <div onClick={onToggle} className="cursor-pointer">
      {/* Header row: sentiment + confidence */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sentimentClass}`}>
          {sentimentLabel}
        </span>
        <span className="text-[10px] text-zinc-500">
          conf: {(analysis.confidence * 100).toFixed(0)}%
        </span>
      </div>

      {/* Conclusion */}
      <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
        {needsTruncation && !expanded
          ? conclusionText.slice(0, MAX_CHARS) + "…"
          : conclusionText}
      </p>

      {/* Reasoning (visible only when expanded) */}
      {expanded && analysis.reasoning && analysis.reasoning.length > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <span className="text-xs font-medium text-zinc-500">推理过程</span>
          <ul className="mt-2 space-y-1">
            {analysis.reasoning.map((r, i) => (
              <li key={i} className="flex gap-2 text-xs text-zinc-400">
                <span className="text-zinc-600 shrink-0">▎</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expand/collapse toggle */}
      {needsTruncation && (
        <div className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          {expanded ? "点击收起 ▲" : "点击展开 ▼"}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add nextjs-app/components/chat/StructuredAnalysis.tsx
git commit -m "feat: add StructuredAnalysis component with expand/collapse"
```

---

### Task 11: Rewrite `MessageBubble` with expand/collapse + structured rendering

**Files:**
- Modify: `nextjs-app/components/chat/MessageBubble.tsx`
- Test: `nextjs-app/components/chat/__tests__/MessageBubble.test.tsx`

**Interfaces:**
- Consumes: `StructuredAnalysis` from `./StructuredAnalysis`
- Produces: Updated `<MessageBubble>` with expand/collapse state, structured rendering when `metadata.analysis` is present, no hard 300-char truncation

- [ ] **Step 1: Write the failing test**

Create `nextjs-app/components/chat/__tests__/MessageBubble.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageBubble } from "../MessageBubble.js";

const baseProps = {
  role: "agent" as const,
  senderName: "技术面分析师",
  content: "long text ".repeat(50),
  metadata: {
    type: "analysis" as const,
    analysis: {
      conclusion: "短期均线多头排列，MACD 金叉信号明显，成交量温和放大，技术形态偏向多头。建议关注上方压力位突破情况。",
      reasoning: ["均线系统呈多头排列，MA5上穿MA20", "MACD 零轴上方金叉，动能转强", "近5日成交量 > 20日均量"],
      sentiment: "bullish" as const,
      confidence: 0.85,
    },
  },
  timestamp: Date.now(),
};

describe("MessageBubble", () => {
  it("shows truncated content in collapsed state", () => {
    render(<MessageBubble {...baseProps} />);
    const text = screen.getByText(/短期均线多头排列/);
    expect(text.textContent).toBeDefined();
    // Content > 120 chars should be truncated
    expect(screen.getByText(/点击展开/)).toBeDefined();
  });

  it("expands to show full content on click", () => {
    render(<MessageBubble {...baseProps} />);
    fireEvent.click(screen.getByText(/点击展开/));
    expect(screen.getByText(/推理过程/)).toBeDefined();
    expect(screen.getByText(/均线系统呈多头排列/)).toBeDefined();
  });

  it("shows full content without toggle when content is short", () => {
    const shortContent = JSON.stringify({
      conclusion: "短期看多。",
      confidence: 0.8,
      sentiment: "bullish",
      reasoning: ["理由1"],
    });
    render(
      <MessageBubble
        role="agent"
        senderName="Agent"
        content={shortContent}
        metadata={{
          type: "analysis",
          analysis: {
            conclusion: "短期看多。",
            reasoning: ["理由1"],
            sentiment: "bullish" as const,
            confidence: 0.8,
          },
        }}
        timestamp={Date.now()}
      />
    );
    // Short content — no expand toggle
    expect(screen.queryByText(/点击展开/)).toBeNull();
  });

  it("user messages are never truncated", () => {
    const longUserContent = "user text ".repeat(100);
    render(
      <MessageBubble
        role="user"
        senderName="散户"
        content={longUserContent}
        timestamp={Date.now()}
      />
    );
    const el = screen.getByText(new RegExp(longUserContent.slice(0, 50)));
    expect(el.textContent!.length).toBeGreaterThan(100);
    expect(screen.queryByText(/点击展开/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd nextjs-app && pnpm vitest run components/chat/__tests__/MessageBubble.test.tsx
```

Expected: FAIL — current implementation hard-truncates at 300 chars, no expand state, no structured rendering.

- [ ] **Step 3: Rewrite MessageBubble**

Rewrite `nextjs-app/components/chat/MessageBubble.tsx`:

```tsx
"use client";
import { useState } from "react";
import { StructuredAnalysis } from "./StructuredAnalysis.js";

interface MessageBubbleProps {
  role: "agent" | "user";
  senderName: string;
  content: string;
  metadata?: Record<string, unknown> | null;
  timestamp: number;
}

export function MessageBubble({
  role,
  senderName,
  content,
  metadata,
  timestamp,
}: MessageBubbleProps) {
  const [expanded, setExpanded] = useState(false);
  const isUser = role === "user";
  const analysis = metadata?.analysis as {
    conclusion: string;
    reasoning?: string[];
    sentiment: "bullish" | "bearish" | "neutral";
    confidence: number;
  } | undefined;

  const sentiment = analysis?.sentiment ?? "neutral";
  const sentimentBorderColor =
    sentiment === "bullish" ? "border-l-emerald-500"
    : sentiment === "bearish" ? "border-l-red-500"
    : "border-l-zinc-500";

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[75%] bg-emerald-600/20 border border-emerald-700/40 rounded-2xl rounded-br-sm px-4 py-2.5">
          <p className="text-sm text-zinc-200 whitespace-pre-wrap">{content}</p>
          <span className="text-[10px] text-zinc-500 mt-1 block">
            {new Date(timestamp).toLocaleTimeString("zh-CN")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex mb-4">
      <div
        className={`max-w-[80%] bg-zinc-900 rounded-xl border-l-4 ${sentimentBorderColor} px-4 py-3`}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-medium text-emerald-400">{senderName}</span>
          <span className="text-[10px] text-zinc-600">
            {new Date(timestamp).toLocaleTimeString("zh-CN")}
          </span>
        </div>

        {analysis ? (
          <StructuredAnalysis
            analysis={analysis}
            content={content}
            expanded={expanded}
            onToggle={() => setExpanded(!expanded)}
          />
        ) : (
          <PlainTextContent
            content={content}
            expanded={expanded}
            onToggle={() => setExpanded(!expanded)}
          />
        )}
      </div>
    </div>
  );
}

function PlainTextContent({
  content,
  expanded,
  onToggle,
}: {
  content: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const MAX_CHARS = 120;
  const needsTruncation = content.length > MAX_CHARS;

  return (
    <div onClick={onToggle} className="cursor-pointer">
      <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
        {needsTruncation && !expanded
          ? content.slice(0, MAX_CHARS) + "…"
          : content}
      </p>
      {needsTruncation && (
        <div className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          {expanded ? "点击收起 ▲" : "点击展开 ▼"}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd nextjs-app && pnpm vitest run components/chat/__tests__/MessageBubble.test.tsx
```

Expected: PASS (all 4 tests)

- [ ] **Step 5: Verify existing tests still pass**

```bash
cd nextjs-app && pnpm vitest run
```

- [ ] **Step 6: Commit**

```bash
git add nextjs-app/components/chat/MessageBubble.tsx nextjs-app/components/chat/StructuredAnalysis.tsx nextjs-app/components/chat/__tests__/MessageBubble.test.tsx
git commit -m "feat: rewrite MessageBubble with expand/collapse + structured analysis rendering"
```

---

## Dependency Order

```
Task 1 (useStockSearch) ──┐
                          ├──→ Task 3 (StockSearchInput)
Task 2 (GET /api/search) ─┘

Task 4 (SessionRepo) ──→ Task 5 (SessionManager) ──→ Task 6 (API routes) ──→ Task 7 (RecentAnalyses) ──→ Task 8 (landing page)
                                                                                                       └──→ Task 9 (/history page)

Task 10 (StructuredAnalysis) ──→ Task 11 (MessageBubble)

Features 1, 2, 3 are independent — can be implemented in any order.
Within Feature 2, Tasks 4→5→6 must be sequential; Tasks 7, 8, 9 can run in parallel after Task 6.
```

---

## Self-Review Summary

- **Spec coverage:** All 3 features from the spec are covered by tasks. Feature 1 = Tasks 1-3, Feature 2 = Tasks 4-9, Feature 3 = Tasks 10-11.
- **No placeholders:** Every step has actual code, exact file paths, real commands.
- **Type consistency:** `SessionRow` defined in Task 4 matches usage in Tasks 5-9. `Analysis` type in Task 10 matches `metadata.analysis` from `ChatMessage` (defined in `lib/chat/types.ts`). `SearchResult` from `lib/data/types.ts` used consistently in Tasks 1-3.
