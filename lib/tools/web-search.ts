import type { ToolDefinition } from "./types.js";

export const webSearchTool: ToolDefinition = {
  name: "web-search",
  description:
    "联网搜索最新信息，覆盖雪球/头条/东方财富/微信公众号等中文财经来源。" +
    "用于获取财报数据、机构预期、市场解读、行业动态等时效性信息。" +
    "参数 query 为搜索关键词，返回标题、URL、摘要和来源。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词，支持中文。例如：'茅台 2025年一季度 财报 营收 净利润'",
      },
    },
    required: ["query"],
  },
  async execute(params) {
    const apiKey = process.env.WEB_SEARCH_API_KEY;
    if (!apiKey) {
      return JSON.stringify({
        error: "WEB_SEARCH_API_KEY not configured. Set it in .env to enable web search.",
        hint: "Get your API key from https://console.volcengine.com/search-infinity/api-key",
      });
    }

    const query = String(params.query ?? "");
    if (!query.trim()) {
      return JSON.stringify({ error: "query is required and must be non-empty" });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch("https://api.volcengine.com/web_search/v1/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query: query.trim(),
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return JSON.stringify({
          error: `Web search API returned ${response.status} ${response.statusText}`,
          detail: body.slice(0, 500),
        });
      }

      const data = await response.json();
      return JSON.stringify(data, null, 2);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return JSON.stringify({ error: "Web search timed out after 15s" });
      }
      return JSON.stringify({
        error: `Web search failed: ${(err as Error).message}`,
      });
    }
  },
};
