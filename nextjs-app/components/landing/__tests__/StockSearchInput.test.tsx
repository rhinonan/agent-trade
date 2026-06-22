import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StockSearchInput } from "../StockSearchInput.js";

describe("StockSearchInput", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
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

    await waitFor(
      () => {
        expect(screen.getByText("600519")).toBeDefined();
        expect(screen.getByText("贵州茅台")).toBeDefined();
      },
      { timeout: 2000 }
    );
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

    await waitFor(
      () => {
        fireEvent.click(screen.getByText("600519"));
      },
      { timeout: 2000 }
    );
    expect(onChange).toHaveBeenCalledWith("600519");
  });
});
