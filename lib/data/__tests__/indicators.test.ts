import { describe, it, expect } from "vitest";
import { calcMACD, calcRSI, calcMA, calcBollinger } from "../indicators.js";

// Generate a simple uptrend price series: 100 .. 100 + N*0.5
function uptrend(n: number): number[] {
  return Array.from({ length: n }, (_, i) => 100 + i * 0.5);
}

describe("calcMACD", () => {
  it("returns empty for insufficient data", () => {
    expect(calcMACD([100, 101, 102])).toEqual([]);
  });

  it("returns MACD items for sufficient data", () => {
    const closes = uptrend(200);
    const result = calcMACD(closes);
    expect(result.length).toBe(200);
    // Last items should have valid DIF/DEA/histogram
    const last = result[result.length - 1];
    expect(last.dif).toBeTypeOf("number");
    expect(last.dea).toBeTypeOf("number");
    expect(last.histogram).toBeTypeOf("number");
  });

  it("nullifies early indices where not enough data", () => {
    const closes = uptrend(200);
    const result = calcMACD(closes);
    // EMA_slow(26) starts at index 25, so DIF is null before that
    expect(result[24].dif).toBeNull();
    expect(result[25].dif).toBeTypeOf("number");
  });
});

describe("calcRSI", () => {
  it("returns all null for insufficient data", () => {
    const result = calcRSI([100, 101, 102], 14);
    expect(result.every((v) => v === null)).toBe(true);
  });

  it("returns RSI values for sufficient data", () => {
    // Oscillating prices to create RSI variation
    const closes: number[] = [];
    let price = 100;
    for (let i = 0; i < 50; i++) {
      price += (i % 7 < 3 ? 1 : -1) * 0.5;
      closes.push(price);
    }
    const result = calcRSI(closes, 14);
    // First 14 values are null
    for (let i = 0; i < 14; i++) expect(result[i]).toBeNull();
    // Remaining values should be numbers between 0 and 100
    for (let i = 14; i < result.length; i++) {
      expect(result[i]).toBeTypeOf("number");
      expect(result[i]!).toBeGreaterThanOrEqual(0);
      expect(result[i]!).toBeLessThanOrEqual(100);
    }
  });

  it("returns 100 for all-up moves", () => {
    const closes = uptrend(30);
    const result = calcRSI(closes, 14);
    const last = result[result.length - 1];
    expect(last).toBe(100);
  });
});

describe("calcMA", () => {
  it("returns MA values with numeric string keys", () => {
    const closes = uptrend(100);
    const result = calcMA(closes, [5, 10, 20]);
    expect(result).toHaveProperty("5");
    expect(result).toHaveProperty("10");
    expect(result).toHaveProperty("20");
  });

  it("nullifies early values where not enough data", () => {
    const closes = uptrend(100);
    const result = calcMA(closes, [5]);
    expect(result["5"][0]).toBeNull();
    expect(result["5"][1]).toBeNull();
    expect(result["5"][2]).toBeNull();
    expect(result["5"][3]).toBeNull();
    expect(result["5"][4]).toBeTypeOf("number"); // 5th value has enough data
  });

  it("computes correct SMA values", () => {
    const closes = [10, 20, 30, 40, 50];
    const result = calcMA(closes, [3]);
    // SMA(3): [null, null, 20, 30, 40]
    expect(result["3"]).toEqual([null, null, 20, 30, 40]);
  });
});

describe("calcBollinger", () => {
  it("returns Bollinger item array", () => {
    const closes = uptrend(50);
    const result = calcBollinger(closes, 20);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(50);
    const last = result[result.length - 1];
    expect(last).toHaveProperty("middle");
    expect(last).toHaveProperty("upper");
    expect(last).toHaveProperty("lower");
  });

  it("upper > middle > lower for uptrend", () => {
    const closes = uptrend(50);
    const result = calcBollinger(closes, 20);
    const last = result[result.length - 1];
    expect(last.upper!).toBeGreaterThan(last.middle!);
    expect(last.middle!).toBeGreaterThan(last.lower!);
  });

  it("nullifies early values", () => {
    const closes = uptrend(50);
    const result = calcBollinger(closes, 20);
    expect(result[18].middle).toBeNull();
    expect(result[19].middle).toBeTypeOf("number"); // 20th value
  });
});
