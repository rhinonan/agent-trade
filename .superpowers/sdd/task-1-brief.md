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

