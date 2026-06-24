import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QuoteCard } from "../QuoteCard.js";

const MOCK_QUOTE = {
  symbol: "600519",
  price: 1680.5,
  change: 12.3,
  changePercent: 0.74,
  open: 1668.0,
  high: 1685.0,
  low: 1665.0,
  volume: 2345678,
  timestamp: 1700000000000,
};

describe("QuoteCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_QUOTE),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders loading state initially", () => {
    render(<QuoteCard code="600519" />);
    expect(screen.getByText(/加载中/)).toBeDefined();
  });

  it("renders price after fetch", async () => {
    render(<QuoteCard code="600519" />);
    await vi.waitFor(() => {
      expect(screen.getByText("1680.50")).toBeDefined();
    });
  });

  it("shows positive change in green (red in CN convention)", async () => {
    render(<QuoteCard code="600519" />);
    await vi.waitFor(() => {
      const changeEl = screen.getByText(/\+12\.30/);
      expect(changeEl.className).toMatch(/red|rose|blue/);
    });
  });

  it("polls every 5 seconds", async () => {
    render(<QuoteCard code="600519" />);
    await vi.waitFor(() => {
      expect(screen.getByText("1680.50")).toBeDefined();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTime(5000));
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("shows error message when fetch fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    render(<QuoteCard code="000001" />);
    await vi.waitFor(() => {
      expect(screen.getByText("行情数据暂不可用")).toBeDefined();
    });
  });
});
