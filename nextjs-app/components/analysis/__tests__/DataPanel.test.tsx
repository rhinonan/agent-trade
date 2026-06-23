import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DataPanel } from "../DataPanel";

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

describe("DataPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders all three sub-panels", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_QUOTE),
    });

    render(
      <DataPanel
        code="600519"
        name="贵州茅台"
        agentConclusions={[
          {
            agentId: "t1",
            agentName: "Test Agent",
            conclusion: "Looks good",
            sentiment: "bullish",
            confidence: 0.8,
          },
        ]}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("600519")).toBeDefined();
    });
    expect(screen.getByText("Test Agent")).toBeDefined();
  });
});
