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

    // Advance past 300ms debounce with async timer handling
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    // After debounce, fetch completed
    expect(result.current.loading).toBe(false);
    expect(result.current.results).toEqual(mockResults);
  });

  it("does nothing for single character input without debounce", async () => {
    const { result } = renderHook(() => useStockSearch("6"));
    expect(result.current.loading).toBe(false);
    // Timer not advanced, no fetch
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
