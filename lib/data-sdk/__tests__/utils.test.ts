import { describe, it, expect } from "vitest";
import {
  normalizeCode,
  getPrefix,
  toSecId,
  toTencentCode,
} from "../utils.js";

describe("normalizeCode", () => {
  it("returns pure 6-digit code unchanged", () => {
    expect(normalizeCode("600519")).toBe("600519");
    expect(normalizeCode("000001")).toBe("000001");
    expect(normalizeCode("832000")).toBe("832000");
  });

  it("strips two-letter prefix", () => {
    expect(normalizeCode("SH600519")).toBe("600519");
    expect(normalizeCode("SZ000001")).toBe("000001");
    expect(normalizeCode("BJ832000")).toBe("832000");
    expect(normalizeCode("sh600519")).toBe("600519");
  });

  it("strips dot suffix", () => {
    expect(normalizeCode("600519.SH")).toBe("600519");
    expect(normalizeCode("000001.SZ")).toBe("000001");
    expect(normalizeCode("832000.BJ")).toBe("832000");
  });

  it("trims whitespace", () => {
    expect(normalizeCode(" 600519 ")).toBe("600519");
    expect(normalizeCode("\t000001\n")).toBe("000001");
  });

  it("throws on invalid code", () => {
    expect(() => normalizeCode("")).toThrow("Invalid stock code");
    expect(() => normalizeCode("12345")).toThrow("Invalid stock code");
    expect(() => normalizeCode("ABCDEF")).toThrow("Invalid stock code");
    expect(() => normalizeCode("1234567")).toThrow("Invalid stock code");
    expect(() => normalizeCode("INVALID")).toThrow("Invalid stock code");
  });
});

describe("getPrefix", () => {
  it("returns 'sh' for codes starting with 6 or 9", () => {
    expect(getPrefix("600519")).toBe("sh");
    expect(getPrefix("688017")).toBe("sh");
    expect(getPrefix("900001")).toBe("sh");
  });

  it("returns 'bj' for codes starting with 8", () => {
    expect(getPrefix("832000")).toBe("bj");
    expect(getPrefix("830000")).toBe("bj");
  });

  it("returns 'sz' for codes starting with 0, 2, or 3", () => {
    expect(getPrefix("000001")).toBe("sz");
    expect(getPrefix("002001")).toBe("sz");
    expect(getPrefix("300001")).toBe("sz");
  });

  it("handles prefixed and suffixed inputs", () => {
    expect(getPrefix("SH600519")).toBe("sh");
    expect(getPrefix("000001.SZ")).toBe("sz");
    expect(getPrefix("BJ832000")).toBe("bj");
  });
});

describe("toSecId", () => {
  it("returns '1.' prefix for Shanghai stocks", () => {
    expect(toSecId("600519")).toBe("1.600519");
    expect(toSecId("688017")).toBe("1.688017");
  });

  it("returns '0.' prefix for Shenzhen and Beijing stocks", () => {
    expect(toSecId("000001")).toBe("0.000001");
    expect(toSecId("300001")).toBe("0.300001");
    expect(toSecId("832000")).toBe("0.832000");
  });
});

describe("toTencentCode", () => {
  it("prepends market prefix", () => {
    expect(toTencentCode("600519")).toBe("sh600519");
    expect(toTencentCode("000001")).toBe("sz000001");
    expect(toTencentCode("832000")).toBe("bj832000");
  });

  it("handles already-prefixed code", () => {
    expect(toTencentCode("SH600519")).toBe("sh600519");
    expect(toTencentCode("000001.SZ")).toBe("sz000001");
  });
});
