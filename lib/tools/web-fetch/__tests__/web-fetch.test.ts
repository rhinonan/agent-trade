import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ToolContext } from "../../../tools/types.js";

// Mock all sub-modules before importing the tool
vi.mock("../duckduckgo.js", () => ({
  DuckDuckGoSearchEngine: {
    search: vi.fn(),
  },
}));

vi.mock("../bing.js", () => ({
  BingSearchEngine: {
    search: vi.fn(),
  },
}));

vi.mock("../fetcher.js", () => ({
  WebContentFetcher: {
    fetchContent: vi.fn(),
  },
}));

import { webFetchTool } from "../index.js";
import { DuckDuckGoSearchEngine } from "../duckduckgo.js";
import { BingSearchEngine } from "../bing.js";
import { WebContentFetcher } from "../fetcher.js";

function mockCtx(signal?: AbortSignal): ToolContext {
  return {
    dataClient: {} as any,
    target: { type: "stock", code: "600519", name: "茅台" },
    executionState: {
      target: { type: "stock", code: "600519", name: "茅台" },
      task: "test",
      findings: [],
      debateRounds: [],
      workflowName: "test",
      startedAt: Date.now(),
    },
    signal: signal ?? new AbortController().signal,
  };
}

function mockSearchResult(title: string, url: string, description: string) {
  return { title, url, description };
}

describe("webFetchTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has correct name and parameters", () => {
    expect(webFetchTool.name).toBe("web_fetch");
    expect(webFetchTool.parameters.required).toContain("query");
    expect(webFetchTool.parameters.properties).toHaveProperty("query");
    expect(webFetchTool.parameters.properties).toHaveProperty("fetch_content");
  });

  it("searches with DuckDuckGo and returns results without content", async () => {
    vi.mocked(DuckDuckGoSearchEngine.search).mockResolvedValueOnce([
      mockSearchResult("茅台财报", "https://example.com/1", "摘要内容"),
    ]);

    const result = await webFetchTool.execute({ query: "茅台 财报" }, mockCtx());
    const parsed = JSON.parse(result);

    expect(parsed.query).toBe("茅台 财报");
    expect(parsed.source).toBe("duckduckgo");
    expect(parsed.fetched_content).toBe(false);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].title).toBe("茅台财报");
    expect(parsed.results[0].content).toBeUndefined();
  });

  it("falls back to Bing when DuckDuckGo returns empty", async () => {
    vi.mocked(DuckDuckGoSearchEngine.search).mockResolvedValueOnce([]);
    vi.mocked(BingSearchEngine.search).mockResolvedValueOnce([
      mockSearchResult("Bing Result", "https://bing-result.com", "Bing desc"),
    ]);

    const result = await webFetchTool.execute({ query: "test" }, mockCtx());
    const parsed = JSON.parse(result);

    expect(parsed.source).toBe("bing");
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0].title).toBe("Bing Result");
  });

  it("fetches content for each result when fetch_content=true", async () => {
    vi.mocked(DuckDuckGoSearchEngine.search).mockResolvedValueOnce([
      mockSearchResult("Result 1", "https://example.com/1", "desc1"),
      mockSearchResult("Result 2", "https://example.com/2", "desc2"),
    ]);
    vi.mocked(WebContentFetcher.fetchContent)
      .mockResolvedValueOnce("Full content of page 1.")
      .mockResolvedValueOnce("Full content of page 2.");

    const result = await webFetchTool.execute(
      { query: "test", fetch_content: true },
      mockCtx(),
    );
    const parsed = JSON.parse(result);

    expect(parsed.fetched_content).toBe(true);
    expect(parsed.results[0].content).toBe("Full content of page 1.");
    expect(parsed.results[1].content).toBe("Full content of page 2.");
  });

  it("handles partial content fetch failures gracefully", async () => {
    vi.mocked(DuckDuckGoSearchEngine.search).mockResolvedValueOnce([
      mockSearchResult("Good", "https://example.com/good", "desc"),
      mockSearchResult("Bad", "https://example.com/bad", "desc"),
    ]);
    vi.mocked(WebContentFetcher.fetchContent)
      .mockResolvedValueOnce("Content works.")
      .mockResolvedValueOnce(null);

    const result = await webFetchTool.execute(
      { query: "test", fetch_content: true },
      mockCtx(),
    );
    const parsed = JSON.parse(result);

    expect(parsed.results[0].content).toBe("Content works.");
    expect(parsed.results[0].content_error).toBeUndefined();
    expect(parsed.results[1].content).toBeNull();
    expect(parsed.results[1].content_error).toBe("Failed to fetch content");
  });

  it("returns error when both engines fail", async () => {
    vi.mocked(DuckDuckGoSearchEngine.search).mockResolvedValueOnce([]);
    vi.mocked(BingSearchEngine.search).mockResolvedValueOnce([]);

    const result = await webFetchTool.execute({ query: "test" }, mockCtx());
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("All search engines failed to return results");
  });

  it("returns error when query is empty", async () => {
    const result = await webFetchTool.execute({ query: "" }, mockCtx());
    const parsed = JSON.parse(result);

    expect(parsed.error).toContain("non-empty");
  });

  it("returns error when user cancels via signal", async () => {
    const controller = new AbortController();
    controller.abort();

    vi.mocked(DuckDuckGoSearchEngine.search).mockRejectedValueOnce(
      new DOMException("Aborted", "AbortError"),
    );

    const result = await webFetchTool.execute(
      { query: "test" },
      mockCtx(controller.signal),
    );
    const parsed = JSON.parse(result);

    expect(parsed.error).toBe("Web fetch cancelled");
  });
});
