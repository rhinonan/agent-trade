import { describe, it, expect, vi, beforeEach } from "vitest";
import { DuckDuckGoSearchEngine } from "../duckduckgo.js";

// Mock the duckduckgo-search module — the package exports a SearchApi instance
// with an async generator method text() that yields {title, href, body}.
vi.mock("duckduckgo-search", () => ({
  default: {
    text: vi.fn(),
  },
}));

import ddgSearch from "duckduckgo-search";

function mockAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const item of items) {
        yield item;
      }
    },
  };
}

describe("DuckDuckGoSearchEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns SearchItem[] for a successful search", async () => {
    const mockResults = [
      { title: "Result 1", href: "https://example.com/1", body: "Desc 1" },
      { title: "Result 2", href: "https://example.com/2", body: "Desc 2" },
    ];
    vi.mocked(ddgSearch.text).mockReturnValue(mockAsyncIterable(mockResults));

    const results = await DuckDuckGoSearchEngine.search("test query");
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: "Result 1",
      url: "https://example.com/1",
      description: "Desc 1",
    });
    expect(ddgSearch.text).toHaveBeenCalledWith("test query");
  });

  it("returns empty array on search error", async () => {
    vi.mocked(ddgSearch.text).mockImplementation(() => {
      throw new Error("API error");
    });

    const results = await DuckDuckGoSearchEngine.search("test query");
    expect(results).toEqual([]);
  });

  it("handles results with missing fields gracefully", async () => {
    const mockResults = [
      { title: "", href: "https://example.com/1", body: "" },
    ];
    vi.mocked(ddgSearch.text).mockReturnValue(mockAsyncIterable(mockResults));

    const results = await DuckDuckGoSearchEngine.search("test query");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("");
    expect(results[0].url).toBe("https://example.com/1");
  });

  it("respects maxResults parameter", async () => {
    const mockResults = Array.from({ length: 10 }, (_, i) => ({
      title: `Result ${i + 1}`,
      href: `https://example.com/${i + 1}`,
      body: `Desc ${i + 1}`,
    }));
    vi.mocked(ddgSearch.text).mockReturnValue(mockAsyncIterable(mockResults));

    const results = await DuckDuckGoSearchEngine.search("test query", 3);
    expect(results).toHaveLength(3);
  });
});
