// lib/data-sdk/__tests__/utils.test.ts
import { describe, it, expect } from "vitest";
import { normalizeCode, getPrefix, toSecId, toTencentCode } from "../utils.js";

describe("normalizeCode", () => {
  it("passes through 6-digit code", () => {
    expect(normalizeCode("600519")).toBe("600519");
    expect(normalizeCode("000001")).toBe("000001");
    expect(normalizeCode("832000")).toBe("832000");
  });

  it("strips SH/SZ/BJ prefix", () => {
    expect(normalizeCode("SH600519")).toBe("600519");
    expect(normalizeCode("SZ000001")).toBe("000001");
    expect(normalizeCode("BJ832000")).toBe("832000");
    expect(normalizeCode("sh688017")).toBe("688017");
  });

  it("strips .SH/.SZ suffix", () => {
    expect(normalizeCode("600519.SH")).toBe("600519");
    expect(normalizeCode("000001.SZ")).toBe("000001");
    expect(normalizeCode("688017.sh")).toBe("688017");
  });

  it("throws on invalid code", () => {
    expect(() => normalizeCode("12345")).toThrow("Invalid stock code");
    expect(() => normalizeCode("abcdef")).toThrow("Invalid stock code");
  });
});

describe("getPrefix", () => {
  it("returns sh for 6/9 prefix", () => {
    expect(getPrefix("600519")).toBe("sh");
    expect(getPrefix("900001")).toBe("sh");
    expect(getPrefix("688017")).toBe("sh");
  });

  it("returns bj for 8 prefix", () => {
    expect(getPrefix("832000")).toBe("bj");
  });

  it("returns sz for others", () => {
    expect(getPrefix("000001")).toBe("sz");
    expect(getPrefix("300476")).toBe("sz");
  });
});

describe("toSecId", () => {
  it("returns eastmoney secid format", () => {
    expect(toSecId("600519")).toBe("1.600519");
    expect(toSecId("000001")).toBe("0.000001");
  });
});

describe("toTencentCode", () => {
  it("returns tencent prefixed format", () => {
    expect(toTencentCode("600519")).toBe("sh600519");
    expect(toTencentCode("000001")).toBe("sz000001");
  });
});
