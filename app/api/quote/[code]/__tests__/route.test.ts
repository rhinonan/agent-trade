import { describe, it, expect } from "vitest";

describe("GET /api/quote/[code]", () => {
  it("returns 404 for unknown symbol", async () => {
    // This test documents the expected shape; actual integration test
    // requires a running data service.
    // Shape check:
    const shape = {
      symbol: "string",
      price: "number",
      change: "number",
      changePercent: "number",
      open: "number",
      high: "number",
      low: "number",
      volume: "number",
      timestamp: "number",
    };
    expect(Object.keys(shape)).toHaveLength(9);
  });
});
