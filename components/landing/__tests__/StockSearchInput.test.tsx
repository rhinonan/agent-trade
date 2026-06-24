import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StockSearchInput } from "../StockSearchInput.js";

vi.mock("@/hooks/useStockSearch.js", () => ({
  useStockSearch: vi.fn(() => ({
    results: [],
    loading: false,
    open: false,
    setOpen: vi.fn(),
  })),
}));

import { useStockSearch } from "@/hooks/useStockSearch.js";

describe("StockSearchInput", () => {
  beforeEach(() => {
    vi.mocked(useStockSearch).mockReturnValue({
      results: [],
      loading: false,
      open: false,
      setOpen: vi.fn(),
    });
  });

  it("renders input with placeholder", () => {
    render(<StockSearchInput value="" onChange={() => {}} />);
    expect(screen.getByPlaceholderText(/输入股票代码/)).toBeDefined();
  });

  it("shows dropdown with results", () => {
    const mockResults = [
      { symbol: "600519", name: "贵州茅台", industry: "白酒", marketCap: 2300000000000 },
    ];
    vi.mocked(useStockSearch).mockReturnValue({
      results: mockResults,
      loading: false,
      open: true,
      setOpen: vi.fn(),
    });

    render(<StockSearchInput value="600" onChange={vi.fn()} />);

    expect(screen.getByText("600519")).toBeDefined();
    expect(screen.getByText("贵州茅台")).toBeDefined();
  });

  it("calls onChange with symbol when clicking a result", async () => {
    const mockResults = [
      { symbol: "600519", name: "贵州茅台", industry: "白酒" },
    ];
    const mockSetOpen = vi.fn();
    vi.mocked(useStockSearch).mockReturnValue({
      results: mockResults,
      loading: false,
      open: true,
      setOpen: mockSetOpen,
    });

    const onChange = vi.fn();
    render(<StockSearchInput value="600" onChange={onChange} />);

    const item = await screen.findByText("600519");
    fireEvent.click(item);
    expect(onChange).toHaveBeenCalledWith("600519");
  });
});
