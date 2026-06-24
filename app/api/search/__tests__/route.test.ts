import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockSearch } = vi.hoisted(() => ({
  mockSearch: vi.fn<
    (keyword: string) => Promise<{
      data: { symbol: string; name: string; type: string }[] | null;
      error?: string;
      source: string;
    }>
  >(),
}));

vi.mock("@/lib/data-sdk/index.js", () => ({
  AStockClient: vi.fn().mockImplementation(() => ({
    market: {
      search: mockSearch,
    },
  })),
}));

import { GET } from "../route.js";

describe("GET /api/search", () => {
  beforeEach(() => {
    mockSearch.mockResolvedValue({
      data: [{ symbol: "600519", name: "贵州茅台", type: "stock" }],
      source: "tencent",
    });
  });

  it("returns search results for valid keyword", async () => {
    const req = new NextRequest("http://localhost:3000/api/search?keyword=600");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].symbol).toBe("600519");
  });

  it("returns 400 when keyword is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/search");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns empty results on data service error", async () => {
    mockSearch.mockRejectedValue(new Error("Connection refused"));
    const { GET: GET2 } = await import("../route.js");
    const req = new NextRequest("http://localhost:3000/api/search?keyword=600");
    const res = await GET2(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});
