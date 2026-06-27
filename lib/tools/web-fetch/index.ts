import type { ToolDefinition, ToolContext } from "../types.js";
import { WebContentFetcher } from "./fetcher.js";
import { DuckDuckGoSearchEngine } from "./duckduckgo.js";
import type { SearchItem } from "./duckduckgo.js";
import { BingSearchEngine } from "./bing.js";

const FETCH_CONTENT_TIMEOUT_MS = 15_000;

export const webFetchTool: ToolDefinition = {
  name: "web_fetch",
  description:
    "免费联网搜索+网页全文抓取。使用 DuckDuckGo/Bing 搜索引擎（无需 API Key），" +
    "支持可选抓取搜索结果网页的完整文本内容。" +
    "参数 query 为搜索关键词（支持中文），fetch_content 为是否抓取全文（默认 false）。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词，支持中文。例如：'茅台 2025年一季度 财报'",
      },
      fetch_content: {
        type: "boolean",
        description:
          "是否抓取每个搜索结果的网页全文内容。默认 false。开启后返回更详细的信息但耗时更长。",
        default: false,
      },
    },
    required: ["query"],
  },

  async execute(
    params: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<string> {
    const query = String(params.query ?? "").trim();
    if (!query) {
      return JSON.stringify({ error: "query is required and must be non-empty" });
    }

    const fetchContent = params.fetch_content === true;

    // Check if already cancelled
    if (ctx.signal.aborted) {
      return JSON.stringify({ error: "Web fetch cancelled" });
    }

    // 1. Search with DuckDuckGo, fallback to Bing
    let results: SearchItem[] = [];
    let source = "duckduckgo";

    try {
      results = await DuckDuckGoSearchEngine.search(query, 5);
    } catch {
      // DuckDuckGo threw — will try Bing
    }

    if (results.length === 0) {
      source = "bing";
      try {
        results = await BingSearchEngine.search(query, 5);
      } catch {
        // Bing also failed
      }
    }

    if (results.length === 0) {
      return JSON.stringify({
        error: "All search engines failed to return results",
      });
    }

    // 2. Optionally fetch full content for each result
    if (fetchContent) {
      const contentPromises = results.map(async (item) => {
        try {
          const timeoutSignal = AbortSignal.timeout(FETCH_CONTENT_TIMEOUT_MS);
          const composedSignal = AbortSignal.any([ctx.signal, timeoutSignal]);

          const content = await WebContentFetcher.fetchContent(
            item.url,
            composedSignal,
          );

          const result: Record<string, unknown> = {
            title: item.title,
            url: item.url,
            description: item.description,
            content,
          };
          if (content === null) {
            result.content_error = "Failed to fetch content";
          }
          return result;
        } catch {
          return {
            title: item.title,
            url: item.url,
            description: item.description,
            content: null,
            content_error: "Failed to fetch content",
          };
        }
      });

      const enrichedResults = await Promise.all(contentPromises);

      return JSON.stringify(
        {
          query,
          source,
          fetched_content: true,
          results: enrichedResults,
        },
        null,
        2,
      );
    }

    // Without content fetching
    return JSON.stringify(
      {
        query,
        source,
        fetched_content: false,
        results: results.map((item) => ({
          title: item.title,
          url: item.url,
          description: item.description,
        })),
      },
      null,
      2,
    );
  },
};
