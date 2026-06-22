import { describe, it, expect } from "vitest";
import { parseLLMJson, parseSentiment } from "../parse.js";

describe("parseLLMJson", () => {
  it("parses ```json fenced block", () => {
    const result = parseLLMJson('```json\n{"key":"value"}\n```');
    expect(result).toEqual({ key: "value" });
  });

  it("parses ``` fenced block (no json tag)", () => {
    const result = parseLLMJson('```\n{"x":1}\n```');
    expect(result).toEqual({ x: 1 });
  });

  it("falls back to raw JSON", () => {
    const result = parseLLMJson('{"a": 42}');
    expect(result).toEqual({ a: 42 });
  });

  it("throws on invalid JSON", () => {
    expect(() => parseLLMJson("not json")).toThrow();
  });
});

describe("parseSentiment", () => {
  it("parses bullish", () => expect(parseSentiment("bullish")).toBe("bullish"));
  it("parses bearish", () => expect(parseSentiment("bearish")).toBe("bearish"));
  it("parses neutral", () => expect(parseSentiment("neutral")).toBe("neutral"));
  it("defaults to neutral for unknown", () => {
    expect(parseSentiment("unknown")).toBe("neutral");
    expect(parseSentiment(null)).toBe("neutral");
    expect(parseSentiment(42)).toBe("neutral");
  });
});
