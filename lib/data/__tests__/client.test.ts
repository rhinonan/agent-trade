import { describe, it, expect, vi, beforeEach } from "vitest";
import { DataClient } from "../client.js";

function mockFetch(
  ok: boolean,
  data: unknown,
  status = 200,
  statusText = "OK",
): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValueOnce({
    ok,
    status,
    statusText,
    json: async () => data,
    text: async () => (typeof data === "string" ? data : JSON.stringify(data)),
  });
}

describe("DataClient", () => {
  let client: DataClient;

  beforeEach(() => {
    client = new DataClient({ baseUrl: "http://test:9500", timeout: 5000 });
  });

  // ---- Construction & accessors ----

  it("has all module accessors", () => {
    expect(client.kline).toBeDefined();
    expect(client.financial).toBeDefined();
    expect(client.reference).toBeDefined();
    expect(client.sector).toBeDefined();
    expect(client.market).toBeDefined();
  });

  it("uses default baseUrl when none provided", () => {
    const c = new DataClient();
    // We verify it doesn't throw and modules are available
    expect(c.kline).toBeDefined();
  });

  // ---- health() ----

  it("returns health response", async () => {
    globalThis.fetch = mockFetch(true, { status: "ok", service: "agenttrade-data", version: "0.1.0" });
    const health = await client.health();
    expect(health.status).toBe("ok");
    expect(health.service).toBe("agenttrade-data");
    expect(health.version).toBe("0.1.0");
  });

  // ---- Error handling ----

  it("throws on non-OK response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "Internal Server Error",
    });
    await expect(client.health()).rejects.toThrow("Data service error 500");
  });

  it("throws on non-OK with custom status code", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => "Not Found",
    });
    await expect(client.health()).rejects.toThrow("Data service error 404: Not Found");
  });

  // ---- KlineModule ----

  describe("kline", () => {
    it("calls kline get endpoint", async () => {
      const bars = [{ date: "2024-01-01", open: 10, high: 12, low: 9, close: 11, volume: 1000 }];
      const mock = mockFetch(true, {
        symbol: "000001",
        period: "daily",
        adjust: "qfq",
        count: 120,
        bars,
      });
      globalThis.fetch = mock;

      const result = await client.kline.get({ symbol: "000001" });
      expect(result.symbol).toBe("000001");
      expect(result.bars).toEqual(bars);
      expect(mock).toHaveBeenCalledWith(
        "http://test:9500/kline/000001?period=daily&count=120&adjust=qfq",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("calls kline get with custom params", async () => {
      const mock = mockFetch(true, { symbol: "600519", period: "weekly", adjust: "none", count: 60, bars: [] });
      globalThis.fetch = mock;

      await client.kline.get({ symbol: "600519", period: "weekly", count: 60, adjust: "none" });
      expect(mock).toHaveBeenCalledWith(
        "http://test:9500/kline/600519?period=weekly&count=60&adjust=none",
        expect.anything(),
      );
    });

    it("calls indicators endpoint", async () => {
      const indicatorData = {
        symbol: "000001",
        indicators: { macd: [{ index: 0, dif: 0.5, dea: 0.3, histogram: 0.2 }] },
      };
      const mock = mockFetch(true, indicatorData);
      globalThis.fetch = mock;

      const result = await client.kline.indicators({ symbol: "000001" });
      expect(result.symbol).toBe("000001");
      expect(result.indicators.macd).toHaveLength(1);
      expect(mock).toHaveBeenCalledWith(
        "http://test:9500/kline/000001/indicators?names=MACD,RSI&period=daily&count=120",
        expect.anything(),
      );
    });

    it("calls indicators with custom names", async () => {
      const mock = mockFetch(true, { symbol: "000001", indicators: {} });
      globalThis.fetch = mock;

      await client.kline.indicators({ symbol: "000001", names: ["MACD", "BOLL"], period: "weekly", count: 60 });
      expect(mock).toHaveBeenCalledWith(
        "http://test:9500/kline/000001/indicators?names=MACD,BOLL&period=weekly&count=60",
        expect.anything(),
      );
    });

    it("falls back to empty bars when kline endpoint returns 500", async () => {
      globalThis.fetch = mockFetch(false, "Internal Server Error", 500);
      const result = await client.kline.get({ symbol: "000001" });
      expect(result.symbol).toBe("000001");
      expect(result.bars).toEqual([]);
    });

    it("falls back to empty indicators when service returns 500 and no kline data", async () => {
      // Both calls fail — indicators then fallback kline
      globalThis.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("Network error"))
        .mockRejectedValueOnce(new Error("Network error"));
      const result = await client.kline.indicators({ symbol: "000001", names: ["RSI"] });
      expect(result.symbol).toBe("000001");
      expect(result.indicators).toEqual({});
      // Should have tried indicators first, then kline fallback
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it("computes indicators locally from raw kline on service failure", async () => {
      // Build 120 bars of uptrend data
      const bars = Array.from({ length: 120 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, "0")}`,
        open: 100 + i * 0.5,
        high: 102 + i * 0.5,
        low: 99 + i * 0.5,
        close: 101 + i * 0.5,
        volume: 1000000,
      }));
      const klineResponse = { symbol: "000001", period: "daily", adjust: "qfq", count: 120, bars };

      // indicators call fails, kline fallback succeeds
      globalThis.fetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("Data service error 500"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => klineResponse,
        } as Partial<Response> as Response);

      const result = await client.kline.indicators({ symbol: "000001", names: ["MACD", "RSI"] });
      expect(result.symbol).toBe("000001");
      expect(result.indicators.macd).toBeDefined();
      expect(result.indicators.macd!.length).toBe(120);
      expect(result.indicators.rsi).toBeDefined();
      expect(result.indicators.rsi!.length).toBe(120);
    });
  });

  // ---- FinancialModule ----

  describe("financial", () => {
    it("calls summary endpoint", async () => {
      const summary = {
        symbol: "000001",
        reportDate: "2024-09-30",
        revenueGrowth: 0.15,
        netProfitGrowth: 0.20,
        grossMargin: 0.45,
        roe: 0.12,
        debtRatio: 0.60,
      };
      const mock = mockFetch(true, summary);
      globalThis.fetch = mock;

      const result = await client.financial.summary("000001");
      expect(result.symbol).toBe("000001");
      expect(result.revenueGrowth).toBe(0.15);
      expect(mock).toHaveBeenCalledWith(
        "http://test:9500/financial/000001/summary",
        expect.anything(),
      );
    });

    it("calls valuation endpoint", async () => {
      const valuation = {
        symbol: "000001",
        pe: 12.5,
        pb: 1.8,
        ps: 2.1,
        peg: 0.9,
        dividendYield: 0.03,
        marketCap: 500000000000,
      };
      const mock = mockFetch(true, valuation);
      globalThis.fetch = mock;

      const result = await client.financial.valuation("000001");
      expect(result.symbol).toBe("000001");
      expect(result.pe).toBe(12.5);
      expect(mock).toHaveBeenCalledWith(
        "http://test:9500/financial/000001/valuation",
        expect.anything(),
      );
    });
  });

  // ---- ReferenceModule ----

  describe("reference", () => {
    it("calls get endpoint for stock info", async () => {
      const stockInfo = { symbol: "000001", name: "平安银行", industry: "银行", marketCap: 500000000000 };
      const mock = mockFetch(true, stockInfo);
      globalThis.fetch = mock;

      const result = await client.reference.get("000001");
      expect(result.symbol).toBe("000001");
      expect(result.name).toBe("平安银行");
      expect(mock).toHaveBeenCalledWith(
        "http://test:9500/reference/000001",
        expect.anything(),
      );
    });

    it("calls search endpoint", async () => {
      const searchResults = {
        keyword: "平安",
        results: [{ symbol: "000001", name: "平安银行", industry: "银行", marketCap: 500000000000 }],
      };
      const mock = mockFetch(true, searchResults);
      globalThis.fetch = mock;

      const result = await client.reference.search("平安");
      expect(result.keyword).toBe("平安");
      expect(result.results).toHaveLength(1);
      expect(mock).toHaveBeenCalledWith(
        "http://test:9500/reference/search?keyword=%E5%B9%B3%E5%AE%89",
        expect.anything(),
      );
    });
  });

  // ---- SectorModule ----

  describe("sector", () => {
    it("calls list endpoint", async () => {
      const sectorList = {
        sectors: [
          { code: "BK0001", name: "银行", constituentCount: 42 },
          { code: "BK0002", name: "白酒", constituentCount: 18 },
        ],
      };
      const mock = mockFetch(true, sectorList);
      globalThis.fetch = mock;

      const result = await client.sector.list();
      expect(result.sectors).toHaveLength(2);
      expect(result.sectors[0].name).toBe("银行");
      expect(mock).toHaveBeenCalledWith(
        "http://test:9500/sector/list",
        expect.anything(),
      );
    });

    it("calls constituents endpoint", async () => {
      const constituentsData = {
        code: "BK0001",
        name: "银行",
        constituents: [
          { symbol: "000001", name: "平安银行", weight: 0.15 },
          { symbol: "600036", name: "招商银行", weight: 0.20 },
        ],
      };
      const mock = mockFetch(true, constituentsData);
      globalThis.fetch = mock;

      const result = await client.sector.constituents("银行");
      expect(result.name).toBe("银行");
      expect(result.constituents).toHaveLength(2);
      expect(mock).toHaveBeenCalledWith(
        "http://test:9500/sector/%E9%93%B6%E8%A1%8C/constituents",
        expect.anything(),
      );
    });
  });

  // ---- MarketModule ----

  describe("market", () => {
    it("returns snapshot placeholder", async () => {
      const result = await client.market.snapshot("000001");
      expect(result).toEqual({ _note: "Market snapshot — Phase 2" });
    });
  });
});
