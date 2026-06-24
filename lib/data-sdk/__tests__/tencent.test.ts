// lib/data-sdk/__tests__/tencent.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TencentProvider } from "../providers/tencent.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("TencentProvider", () => {
  let provider: TencentProvider;

  beforeEach(() => {
    provider = new TencentProvider(5000);
  });

  it("parses GBK quote response correctly", async () => {
    const fixturePath = path.join(__dirname, "fixtures", "tencent-quote.txt");
    if (!fs.existsSync(fixturePath)) {
      console.warn("Fixture not found — skipping parse test");
      return;
    }
    const gbkBytes = fs.readFileSync(fixturePath);
    // Mock fetch to return fixture
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => gbkBytes.buffer,
    } as any);

    const r = await provider.getQuotes(["600519"]);
    expect(r.source).toBe("tencent");
    expect(r.data).not.toBeNull();
    const q = r.data!["600519"];
    expect(q).toBeDefined();
    expect(q.name).toBeTruthy();
    expect(typeof q.price).toBe("number");
    expect(typeof q.peTtm).toBe("number");
    expect(typeof q.pb).toBe("number");
  });

  it("returns error on fetch failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));
    const r = await provider.getQuotes(["600519"]);
    expect(r.data).toBeNull();
    expect(r.error).toContain("Network error");
  });

  it("returns error on HTTP error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 } as any);
    const r = await provider.getQuotes(["600519"]);
    expect(r.data).toBeNull();
    expect(r.error).toContain("500");
  });

  it("search returns parsed results", async () => {
    // Use ASCII-only mock data — real API uses GBK, but TextEncoder produces
    // UTF-8 bytes which decodeGBK would garble for non-ASCII chars.
    const mockText = new TextEncoder().encode('v_hint="1~600519~MaoTai~GP-A"');
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => mockText.buffer,
    } as any);

    const r = await provider.search("茅台");
    expect(r.source).toBe("tencent");
    expect(r.data).not.toBeNull();
    expect(r.data!.length).toBeGreaterThan(0);
    expect(r.data![0].symbol).toBe("600519");
    expect(r.data![0].name).toBe("MaoTai");
  });
});
