import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DataClient } from "../client.js";

function createMockResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response;
}

describe("DataClient", () => {
  let client: DataClient;

  beforeEach(() => {
    client = new DataClient({ baseUrl: "http://test:9500" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("health returns status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createMockResponse({ status: "ok", service: "agenttrade-data", version: "0.1.0" }),
    );
    const result = await client.health();
    expect(result.status).toBe("ok");
  });

  it("kline.get returns bars", async () => {
    const mockData = { symbol: "600519", period: "daily", bars: [{ date: "2026-01-01", open: 1800, close: 1820 }] };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createMockResponse(mockData));
    const result = await client.kline.get({ symbol: "600519", count: 1 });
    expect(result.symbol).toBe("600519");
    expect(result.bars).toHaveLength(1);
  });

  it("sector.list returns sectors", async () => {
    const mockData = { sectors: [{ code: "CPO", name: "光电共封装", constituentCount: 5 }] };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createMockResponse(mockData));
    const result = await client.sector.list();
    expect(result.sectors[0].code).toBe("CPO");
  });

  it("sector.constituents returns constituents", async () => {
    const mockData = { code: "CPO", name: "光电共封装", constituents: [{ symbol: "300394", name: "天孚通信" }] };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createMockResponse(mockData));
    const result = await client.sector.constituents("CPO");
    expect(result.constituents[0].symbol).toBe("300394");
  });

  it("handles 404 errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createMockResponse({ detail: "Not found" }, 404),
    );
    await expect(client.reference.get("999999")).rejects.toThrow("Data service error 404");
  });
});
