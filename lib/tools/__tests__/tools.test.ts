import { describe, it, expect, vi } from "vitest";
import { klineTool } from "../kline.js";
import { macdTool, rsiTool, maTool } from "../indicator.js";
import type { ToolContext } from "../types.js";
import type { AStockClient } from "../../data-sdk/client.js";

function mockCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    dataClient: {
      market: {
        kline: vi.fn().mockResolvedValue({
          data: [
            { date: "2026-06-19", open: 1690, high: 1710, low: 1685, close: 1700, volume: 4500000 },
            { date: "2026-06-22", open: 1700, high: 1720, low: 1690, close: 1715, volume: 5000000 },
          ],
          source: "tencent",
        }),
      },
      fundamentals: {
        indicators: vi.fn().mockResolvedValue({
          macd: [
            { index: 0, dif: 5.2, dea: 4.8, histogram: 0.4 },
            { index: 1, dif: 6.1, dea: 5.1, histogram: 1.0 },
          ],
          rsi: [55, 58, 62, 60],
          ma: { "5": [1700, 1705], "10": [1690, 1695], "20": [1680, 1685] },
          boll: [],
        }),
      },
    } as unknown as AStockClient,
    target: { type: "stock", code: "600519", name: "茅台" },
    executionState: {
      target: { type: "stock", code: "600519", name: "茅台" },
      task: "test",
      findings: [],
      debateRounds: [],
      workflowName: "test",
      startedAt: Date.now(),
    },
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("klineTool", () => {
  it("fetches and summarizes K-line data", async () => {
    const ctx = mockCtx();
    const result = await klineTool.execute({ count: 20 }, ctx);
    const parsed = JSON.parse(result);
    expect(parsed.symbol).toBe("600519");
    expect(parsed.recent20Bars).toHaveLength(2);
    expect(parsed.latest.close).toBe(1715);
  });

  it("uses default count of 120 when not specified", async () => {
    const ctx = mockCtx();
    await klineTool.execute({}, ctx);
    expect(ctx.dataClient.market.kline).toHaveBeenCalledWith(
      "600519",
      expect.objectContaining({ count: 120 }),
    );
  });
});

describe("macdTool", () => {
  it("returns MACD data with neutral signal when DIF stays above DEA", async () => {
    const ctx = mockCtx();
    const result = await macdTool.execute({}, ctx);
    const parsed = JSON.parse(result);
    expect(parsed.symbol).toBe("600519");
    expect(parsed.latest.dif).toBe(6.1);
    expect(parsed.signal).toBe("neutral");
  });

  it("detects golden_cross when DIF crosses above DEA", async () => {
    const ctx = mockCtx({
      dataClient: {
        market: {
          kline: vi.fn().mockResolvedValue({
            data: [{ date: "2026-06-22", open: 1700, high: 1720, low: 1690, close: 1715, volume: 5000000 }],
            source: "tencent",
          }),
        },
        fundamentals: {
          indicators: vi.fn().mockResolvedValue({
            macd: [
              { index: 0, dif: 4.0, dea: 4.5, histogram: -0.5 },
              { index: 1, dif: 5.0, dea: 4.8, histogram: 0.2 },
            ],
            rsi: [],
            ma: {},
            boll: [],
          }),
        },
      } as unknown as AStockClient,
    });
    const result = await macdTool.execute({}, ctx);
    const parsed = JSON.parse(result);
    expect(parsed.signal).toBe("golden_cross");
  });

  it("detects death_cross when DIF crosses below DEA", async () => {
    const ctx = mockCtx({
      dataClient: {
        market: {
          kline: vi.fn().mockResolvedValue({
            data: [{ date: "2026-06-22", open: 1700, high: 1720, low: 1690, close: 1715, volume: 5000000 }],
            source: "tencent",
          }),
        },
        fundamentals: {
          indicators: vi.fn().mockResolvedValue({
            macd: [
              { index: 0, dif: 5.5, dea: 5.0, histogram: 0.5 },
              { index: 1, dif: 4.8, dea: 5.2, histogram: -0.4 },
            ],
            rsi: [],
            ma: {},
            boll: [],
          }),
        },
      } as unknown as AStockClient,
    });
    const result = await macdTool.execute({}, ctx);
    const parsed = JSON.parse(result);
    expect(parsed.signal).toBe("death_cross");
  });
});

describe("rsiTool", () => {
  it("returns RSI data with zone classification", async () => {
    const ctx = mockCtx();
    const result = await rsiTool.execute({}, ctx);
    const parsed = JSON.parse(result);
    expect(parsed.latest).toBe(60);
    expect(parsed.zone).toBe("neutral");
  });
});

describe("maTool", () => {
  it("returns MA data with alignment detection", async () => {
    const ctx = mockCtx();
    const result = await maTool.execute({}, ctx);
    const parsed = JSON.parse(result);
    expect(parsed.latest).toBeDefined();
    // MA5=1705 > MA10=1695 > MA20=1685 => bullish alignment
    expect(parsed.alignment).toBe("bullish_alignment");
  });

  it("handles numeric keys from indicators", async () => {
    const ctx = mockCtx({
      dataClient: {
        market: {
          kline: vi.fn().mockResolvedValue({
            data: [{ date: "2026-06-22", open: 1700, high: 1720, low: 1690, close: 1715, volume: 5000000 }],
            source: "tencent",
          }),
        },
        fundamentals: {
          indicators: vi.fn().mockResolvedValue({
            macd: [],
            rsi: [],
            ma: { "5": [1700, 1705], "10": [1690, 1695], "20": [1680, 1685], "60": [1650, 1655] },
            boll: [],
          }),
        },
      } as unknown as AStockClient,
    });
    const result = await maTool.execute({}, ctx);
    const parsed = JSON.parse(result);
    expect(parsed.latest["5"]).toBe(1705);
    expect(parsed.latest["10"]).toBe(1695);
    expect(parsed.alignment).toBe("bullish_alignment");
  });
});
