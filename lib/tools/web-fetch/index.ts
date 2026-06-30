import type { ToolDefinition, ToolContext } from "../types.js";
import { WebContentFetcher } from "./fetcher.js";
import { DuckDuckGoSearchEngine } from "./duckduckgo.js";
import type { SearchItem } from "./duckduckgo.js";
import { BingSearchEngine } from "./bing.js";

/**
 * Web 抓取工具 — 免费联网搜索 + 可选网页全文抓取。
 *
 * 工具链：
 * 1. 搜索 — DuckDuckGo（优先）→ Bing（回退），均无需 API Key
 * 2. 可选内容抓取 — 对搜索结果 URL 逐一抓取网页全文（通过 cheerio 提取纯文本）
 *
 * 为什么需要双引擎回退：DuckDuckGo 在中国大陆可能被屏蔽，此时自动回退到 Bing。
 */

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

    // 检查是否已取消
    if (ctx.signal.aborted) {
      return JSON.stringify({ error: "Web fetch cancelled" });
    }

    // 组合用户取消信号和 30 秒总超时
    const overallTimeout = AbortSignal.timeout(30_000);
    const composedSignal = AbortSignal.any([ctx.signal, overallTimeout]);

    // 1. DuckDuckGo 搜索，失败回退到 Bing
    let results: SearchItem[] = [];
    let source = "duckduckgo";

    try {
      results = await DuckDuckGoSearchEngine.search(query, 5, composedSignal);
    } catch (err) {
      console.warn(
        `[web_fetch] DuckDuckGo search threw for "${query}":`,
        err instanceof Error ? err.message : String(err),
      );
    }

    // DuckDuckGo 后检查超时/取消
    if (overallTimeout.aborted) {
      return JSON.stringify({ error: "Web fetch timed out after 30s" });
    }
    if (ctx.signal.aborted) {
      return JSON.stringify({ error: "Web fetch cancelled" });
    }

    if (results.length === 0) {
      source = "bing";
      try {
        results = await BingSearchEngine.search(query, 5, composedSignal);
      } catch (err) {
        console.warn(
          `[web_fetch] Bing search threw for "${query}":`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    // Bing 后检查超时/取消
    if (overallTimeout.aborted) {
      return JSON.stringify({ error: "Web fetch timed out after 30s" });
    }
    if (ctx.signal.aborted) {
      return JSON.stringify({ error: "Web fetch cancelled" });
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
          const composedSignal = AbortSignal.any([ctx.signal, overallTimeout, timeoutSignal]);

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
        } catch (err) {
          console.warn(
            `[web_fetch] Content fetch failed for "${item.url}":`,
            err instanceof Error ? err.message : String(err),
          );
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
