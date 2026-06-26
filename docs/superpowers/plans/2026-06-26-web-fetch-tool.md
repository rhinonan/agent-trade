# Web Fetch Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `web-fetch` 工具——免费联网搜索+网页全文抓取，DuckDuckGo + Bing 双引擎 fallback，无需 API Key

**Architecture:** 4 个模块组成：`WebContentFetcher`（HTTP 抓取+HTML 清洗）、`DuckDuckGoSearchEngine`（免费搜索）、`BingSearchEngine`（爬虫 fallback）、`webFetchTool`（协调器，遵循现有 `ToolDefinition` 接口）。与现有 `webSearchTool` 并存。

**Tech Stack:** TypeScript, cheerio (HTML 解析), duckduckgo-search (免费搜索), vitest, Node.js 原生 fetch

## Global Constraints

- 遵循现有 `ToolDefinition` 接口 (`lib/tools/types.ts`)
- 测试使用 vitest + vi.fn() mock，与项目现有测试风格一致
- 命名规则：工具名 `web_fetch`，文件名为工具描述+功能
- 不引入 ESM-only 依赖冲突（项目已有 cheerio 0 处使用，需确认兼容性）
- `fetch_content` 默认 false，避免不必要的网络开销

---

### Task 1: 安装依赖 + 创建目录结构

**Files:**
- Modify: `package.json`（加 `cheerio`, `duckduckgo-search`）
- Create: `lib/tools/web-fetch/` 目录（空，后续任务填充）

**Interfaces:**
- Consumes: none
- Produces: `cheerio` `^1.0.0`, `duckduckgo-search` `^1.0.0` 可用

- [ ] **Step 1: 安装依赖**

```bash
cd /d/code2/agent-trade && pnpm add cheerio duckduckgo-search
```

Expected: packages installed, `package.json` 和 `pnpm-lock.yaml` 更新。

- [ ] **Step 2: 创建目录结构**

```bash
mkdir -p lib/tools/web-fetch/__tests__
```

- [ ] **Step 3: 验证 cheerio 可正常导入**

```bash
node -e "const cheerio = require('cheerio'); const \$ = cheerio.load('<html><body><p>hello</p></body></html>'); console.log(\$('body').text());"
```

Expected: 输出 `hello`

- [ ] **Step 4: Commit**

```bash
cd /d/code2/agent-trade && git add package.json pnpm-lock.yaml lib/tools/web-fetch/
git commit -m "chore: add cheerio, duckduckgo-search deps and web-fetch directory"
```

---

### Task 2: 实现 `WebContentFetcher`（fetch + HTML 清洗）

**Files:**
- Create: `lib/tools/web-fetch/fetcher.ts`
- Create: `lib/tools/web-fetch/__tests__/fetcher.test.ts`

**Interfaces:**
- Consumes: `cheerio` (from Task 1)
- Produces:
  ```ts
  export class WebContentFetcher {
    static async fetchContent(url: string, signal?: AbortSignal): Promise<string | null>
  }
  ```

- [ ] **Step 1: 写测试 — 正常 HTML 清洗**

Create `lib/tools/web-fetch/__tests__/fetcher.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebContentFetcher } from "../fetcher.js";

describe("WebContentFetcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches and cleans HTML content", async () => {
    const html = `<html>
      <head><script>console.log('remove me')</script><style>body {}</style></head>
      <body>
        <header>nav stuff</header>
        <nav>links</nav>
        <main><p>Hello   World</p><p>Second paragraph.</p></main>
        <footer>copyright</footer>
      </body>
    </html>`;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 200,
      text: () => Promise.resolve(html),
    } as Response);

    const content = await WebContentFetcher.fetchContent("https://example.com");
    expect(content).toContain("Hello World");
    expect(content).toContain("Second paragraph");
    expect(content).not.toContain("console.log");
    expect(content).not.toContain("nav stuff");
    expect(content).not.toContain("copyright");
    expect(content).not.toContain("links");
  });

  it("returns null on non-200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 404,
      statusText: "Not Found",
    } as Response);

    const content = await WebContentFetcher.fetchContent("https://example.com/404");
    expect(content).toBeNull();
  });

  it("returns null on fetch error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

    const content = await WebContentFetcher.fetchContent("https://example.com");
    expect(content).toBeNull();
  });

  it("truncates content to 10,000 characters", async () => {
    const longText = "x".repeat(15000);
    const html = `<html><body><p>${longText}</p></body></html>`;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 200,
      text: () => Promise.resolve(html),
    } as Response);

    const content = await WebContentFetcher.fetchContent("https://example.com");
    expect(content).not.toBeNull();
    expect(content!.length).toBeLessThanOrEqual(10000);
  });

  it("aborts when signal fires", async () => {
    const controller = new AbortController();
    controller.abort(); // abort immediately

    // Mock fetch to throw AbortError when signal is already aborted
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
      return Promise.resolve({ status: 200, text: () => Promise.resolve("ok") } as Response);
    });

    const content = await WebContentFetcher.fetchContent(
      "https://example.com",
      controller.signal,
    );
    expect(content).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /d/code2/agent-trade && npx vitest run lib/tools/web-fetch/__tests__/fetcher.test.ts
```

Expected: 全部 FAIL（`WebContentFetcher` 尚未实现）

- [ ] **Step 3: 实现 `WebContentFetcher`**

Create `lib/tools/web-fetch/fetcher.ts`:

```ts
import * as cheerio from "cheerio";

const MAX_CONTENT_LENGTH = 10_000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

export class WebContentFetcher {
  /**
   * Fetch and extract clean text content from a webpage.
   *
   * @param url - The URL to fetch
   * @param signal - Optional AbortSignal for cancellation
   * @returns Cleaned text content (≤10KB) or null on failure
   */
  static async fetchContent(
    url: string,
    signal?: AbortSignal,
  ): Promise<string | null> {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal,
      });

      if (response.status !== 200) {
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove non-content elements
      $("script, style, header, footer, nav, noscript, iframe, svg").remove();

      // Extract and normalize text
      const text = $("body").text().replace(/\s+/g, " ").trim();

      if (!text) return null;

      return text.slice(0, MAX_CONTENT_LENGTH);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return null;
      }
      return null;
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /d/code2/agent-trade && npx vitest run lib/tools/web-fetch/__tests__/fetcher.test.ts
```

Expected: 5 个测试全部 PASS

- [ ] **Step 5: Commit**

```bash
cd /d/code2/agent-trade && git add lib/tools/web-fetch/fetcher.ts lib/tools/web-fetch/__tests__/fetcher.test.ts
git commit -m "feat: add WebContentFetcher — fetch and clean HTML content"
```

---

### Task 3: 实现 `DuckDuckGoSearchEngine`

**Files:**
- Create: `lib/tools/web-fetch/duckduckgo.ts`
- Create: `lib/tools/web-fetch/__tests__/duckduckgo.test.ts`

**Interfaces:**
- Consumes: `duckduckgo-search` (from Task 1)
- Produces:
  ```ts
  export interface SearchItem {
    title: string;
    url: string;
    description: string;
  }

  export class DuckDuckGoSearchEngine {
    static async search(query: string, maxResults?: number): Promise<SearchItem[]>
  }
  ```

- [ ] **Step 1: 写测试**

Create `lib/tools/web-fetch/__tests__/duckduckgo.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DuckDuckGoSearchEngine } from "../duckduckgo.js";
import type { SearchItem } from "../duckduckgo.js";

// Mock the duckduckgo-search module
vi.mock("duckduckgo-search", () => ({
  search: vi.fn(),
}));

import { search as ddgSearch } from "duckduckgo-search";

describe("DuckDuckGoSearchEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns SearchItem[] for a successful search", async () => {
    const mockResults = [
      { title: "Result 1", url: "https://example.com/1", description: "Desc 1" },
      { title: "Result 2", url: "https://example.com/2", description: "Desc 2" },
    ];
    vi.mocked(ddgSearch).mockResolvedValueOnce(mockResults as any);

    const results = await DuckDuckGoSearchEngine.search("test query");
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: "Result 1",
      url: "https://example.com/1",
      description: "Desc 1",
    });
    expect(ddgSearch).toHaveBeenCalledWith("test query", expect.objectContaining({ max: 5 }));
  });

  it("returns empty array on search error", async () => {
    vi.mocked(ddgSearch).mockRejectedValueOnce(new Error("API error"));

    const results = await DuckDuckGoSearchEngine.search("test query");
    expect(results).toEqual([]);
  });

  it("handles results with missing fields gracefully", async () => {
    const mockResults = [
      { title: "", url: "https://example.com/1", description: "" },
    ];
    vi.mocked(ddgSearch).mockResolvedValueOnce(mockResults as any);

    const results = await DuckDuckGoSearchEngine.search("test query");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("");
    expect(results[0].url).toBe("https://example.com/1");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /d/code2/agent-trade && npx vitest run lib/tools/web-fetch/__tests__/duckduckgo.test.ts
```

Expected: 全部 FAIL（`DuckDuckGoSearchEngine` 尚未实现）

- [ ] **Step 3: 实现 `DuckDuckGoSearchEngine`**

Create `lib/tools/web-fetch/duckduckgo.ts`:

```ts
import { search as ddgSearch } from "duckduckgo-search";

export interface SearchItem {
  title: string;
  url: string;
  description: string;
}

const DEFAULT_MAX_RESULTS = 5;

export class DuckDuckGoSearchEngine {
  /**
   * Search DuckDuckGo and return structured results.
   *
   * @param query - The search query
   * @param maxResults - Maximum number of results to return (default: 5)
   * @returns SearchItem array (empty on failure)
   */
  static async search(
    query: string,
    maxResults: number = DEFAULT_MAX_RESULTS,
  ): Promise<SearchItem[]> {
    try {
      const rawResults = await ddgSearch(query, {
        max: maxResults,
      });

      const items: SearchItem[] = [];
      for (const item of rawResults) {
        if (typeof item === "object" && item !== null) {
          items.push({
            title: (item as any).title ?? "",
            url: (item as any).url ?? (item as any).href ?? "",
            description: (item as any).description ?? (item as any).snippet ?? "",
          });
        }
      }

      return items.filter((item) => item.url);
    } catch {
      return [];
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /d/code2/agent-trade && npx vitest run lib/tools/web-fetch/__tests__/duckduckgo.test.ts
```

Expected: 3 个测试全部 PASS

- [ ] **Step 5: Commit**

```bash
cd /d/code2/agent-trade && git add lib/tools/web-fetch/duckduckgo.ts lib/tools/web-fetch/__tests__/duckduckgo.test.ts
git commit -m "feat: add DuckDuckGoSearchEngine — free search with duckduckgo-search"
```

---

### Task 4: 实现 `BingSearchEngine`（爬虫 fallback）

**Files:**
- Create: `lib/tools/web-fetch/bing.ts`
- Create: `lib/tools/web-fetch/__tests__/bing.test.ts`

**Interfaces:**
- Consumes: `SearchItem` from `duckduckgo.ts` (Task 3), `cheerio` (Task 1)
- Produces:
  ```ts
  import type { SearchItem } from "./duckduckgo.js";

  export class BingSearchEngine {
    static async search(query: string, maxResults?: number): Promise<SearchItem[]>
  }
  ```

- [ ] **Step 1: 写测试**

Create `lib/tools/web-fetch/__tests__/bing.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BingSearchEngine } from "../bing.js";

describe("BingSearchEngine", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses Bing search results page correctly", async () => {
    const bingHtml = `<!DOCTYPE html>
    <html>
      <body>
        <ol id="b_results">
          <li class="b_algo">
            <h2><a href="https://example.com/first">First Result Title</a></h2>
            <p>This is the first result description snippet.</p>
          </li>
          <li class="b_algo">
            <h2><a href="https://example.com/second">Second Result</a></h2>
            <p>Description for the second result.</p>
          </li>
        </ol>
      </body>
    </html>`;

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 200,
      text: () => Promise.resolve(bingHtml),
    } as Response);

    const results = await BingSearchEngine.search("test query", 5);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      title: "First Result Title",
      url: "https://example.com/first",
      description: "This is the first result description snippet.",
    });
    expect(results[1].title).toBe("Second Result");
  });

  it("returns empty array when Bing blocks the request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 403,
      text: () => Promise.resolve(""),
    } as Response);

    const results = await BingSearchEngine.search("test query");
    expect(results).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Connection refused"));

    const results = await BingSearchEngine.search("test query");
    expect(results).toEqual([]);
  });

  it("encodes Chinese query in URL", async () => {
    const bingHtml = `<html><body><ol id="b_results"></ol></body></html>`;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      status: 200,
      text: () => Promise.resolve(bingHtml),
    } as Response);

    await BingSearchEngine.search("茅台 财报", 5);
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain(encodeURIComponent("茅台 财报"));
  });

  it("stops collecting when maxResults reached", async () => {
    // Generate 15 results across 2 pages
    const generateItems = (start: number, count: number) =>
      Array.from({ length: count }, (_, i) => {
        const n = start + i;
        return `<li class="b_algo"><h2><a href="https://example.com/${n}">Result ${n}</a></h2><p>Desc ${n}</p></li>`;
      }).join("");

    const page1Html = `<html><body><ol id="b_results">${generateItems(1, 10)}</ol><a title="Next page" href="/search?q=test&first=11">Next</a></body></html>`;
    const page2Html = `<html><body><ol id="b_results">${generateItems(11, 5)}</ol></body></html>`;

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve(page1Html),
      } as Response)
      .mockResolvedValueOnce({
        status: 200,
        text: () => Promise.resolve(page2Html),
      } as Response);

    const results = await BingSearchEngine.search("test", 8);
    expect(results).toHaveLength(8);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /d/code2/agent-trade && npx vitest run lib/tools/web-fetch/__tests__/bing.test.ts
```

Expected: 全部 FAIL（`BingSearchEngine` 尚未实现）

- [ ] **Step 3: 实现 `BingSearchEngine`**

Create `lib/tools/web-fetch/bing.ts`:

```ts
import * as cheerio from "cheerio";
import type { SearchItem } from "./duckduckgo.js";

const BING_HOST = "https://www.bing.com";
const BING_SEARCH_URL = "https://www.bing.com/search?q=";
const DEFAULT_MAX_RESULTS = 5;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

export class BingSearchEngine {
  /**
   * Scrape Bing search results as a fallback when DuckDuckGo fails.
   *
   * @param query - The search query (supports Chinese)
   * @param maxResults - Maximum results to return (default: 5)
   * @returns SearchItem array (empty on failure)
   */
  static async search(
    query: string,
    maxResults: number = DEFAULT_MAX_RESULTS,
  ): Promise<SearchItem[]> {
    const results: SearchItem[] = [];

    try {
      let nextUrl: string | null = `${BING_SEARCH_URL}${encodeURIComponent(query)}`;
      let first = 1;

      while (results.length < maxResults && nextUrl) {
        const response = await fetch(nextUrl, {
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            Referer: "https://www.bing.com/",
          },
        });

        if (response.status !== 200) break;

        const html = await response.text();
        const $ = cheerio.load(html);

        const olResults = $("#b_results");
        if (!olResults.length) break;

        const lis = olResults.find("li.b_algo");
        for (const li of lis) {
          if (results.length >= maxResults) break;

          try {
            const $li = $(li);
            const h2 = $li.find("h2");
            const title = h2.text().trim();
            const url = h2.find("a").attr("href")?.trim() ?? "";
            const description = $li.find("p").first().text().trim();

            if (url) {
              results.push({ title: title || `Bing Result ${first}`, url, description });
            }
            first++;
          } catch {
            // Skip malformed result items
            continue;
          }
        }

        // Check for next page
        const nextBtn = $('a[title="Next page"]');
        if (nextBtn.length) {
          const nextHref = nextBtn.attr("href");
          nextUrl = nextHref ? `${BING_HOST}${nextHref}` : null;
        } else {
          nextUrl = null;
        }
      }

      return results.slice(0, maxResults);
    } catch {
      return [];
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /d/code2/agent-trade && npx vitest run lib/tools/web-fetch/__tests__/bing.test.ts
```

Expected: 5 个测试全部 PASS

- [ ] **Step 5: Commit**

```bash
cd /d/code2/agent-trade && git add lib/tools/web-fetch/bing.ts lib/tools/web-fetch/__tests__/bing.test.ts
git commit -m "feat: add BingSearchEngine — scrape Bing as search fallback"
```

---

### Task 5: 实现 `webFetchTool` + 注册

**Files:**
- Create: `lib/tools/web-fetch/index.ts`
- Create: `lib/tools/web-fetch/__tests__/web-fetch.test.ts`
- Modify: `lib/tools/index.ts:1-6`（加 import），`lib/tools/index.ts:274-296`（注册到 toolsByName）

**Interfaces:**
- Consumes: `WebContentFetcher` (Task 2), `DuckDuckGoSearchEngine` + `SearchItem` (Task 3), `BingSearchEngine` (Task 4), `ToolDefinition` + `ToolContext` from `../types.js`
- Produces:
  ```ts
  export const webFetchTool: ToolDefinition
  ```

- [ ] **Step 1: 写集成测试**

Create `lib/tools/web-fetch/__tests__/web-fetch.test.ts`:

```ts
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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /d/code2/agent-trade && npx vitest run lib/tools/web-fetch/__tests__/web-fetch.test.ts
```

Expected: 全部 FAIL（`webFetchTool` 尚未实现）

- [ ] **Step 3: 实现 `webFetchTool`**

Create `lib/tools/web-fetch/index.ts`:

```ts
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
        description: "是否抓取每个搜索结果的网页全文内容。默认 false。开启后返回更详细的信息但耗时更长。",
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
      return JSON.stringify({ error: "All search engines failed to return results" });
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
          return {
            title: item.title,
            url: item.url,
            description: item.description,
            content,
            content_error: content === null ? "Failed to fetch content" : null,
          };
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
```

- [ ] **Step 4: 注册到 `toolsByName`**

Modify `lib/tools/index.ts`:

在文件顶部 import 区域加一行（约第 3-4 行之间）：

```ts
import { webFetchTool } from "./web-fetch/index.js";
```

在 `toolsByName` Map 中加一行（约第 295 行 `["web_search", webSearchTool],` 之后）：

```ts
  ["web_fetch", webFetchTool],
```

同时更新文件底的 export 语句（在 `export { webSearchTool }` 附近加）：

```ts
export { webSearchTool } from "./web-search.js";
export { webFetchTool } from "./web-fetch/index.js";
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd /d/code2/agent-trade && npx vitest run lib/tools/web-fetch/__tests__/web-fetch.test.ts
```

Expected: 8 个测试全部 PASS

- [ ] **Step 6: 运行全量工具测试确保无回归**

```bash
cd /d/code2/agent-trade && npx vitest run lib/tools/
```

Expected: 全部测试 PASS（含之前已有的 kline/macd/rsi/ma 测试）

- [ ] **Step 7: TypeScript 编译检查**

```bash
cd /d/code2/agent-trade && npx tsc --noEmit 2>&1 | head -30
```

Expected: 无新增类型错误

- [ ] **Step 8: Commit**

```bash
cd /d/code2/agent-trade && git add lib/tools/web-fetch/index.ts lib/tools/web-fetch/__tests__/web-fetch.test.ts lib/tools/index.ts
git commit -m "feat: add webFetchTool — free web search + content fetching with dual-engine fallback"
```

---

### Task 6 (optional): 端到端烟雾测试

**Files:**
- Create: `scripts/smoke-test-web-fetch.ts`（运行时测试脚本，不在 vitest 中）

**Interfaces:**
- Consumes: `webFetchTool` (Task 5)
- Produces: 人工验证通过/失败

- [ ] **Step 1: 创建冒烟脚本**

Create `scripts/smoke-test-web-fetch.ts`:

```ts
/**
 * Smoke test for web-fetch tool.
 * Run: npx tsx scripts/smoke-test-web-fetch.ts
 *
 * This makes real network calls — use sparingly.
 */
import { webFetchTool } from "../lib/tools/web-fetch/index.js";

async function main() {
  const ctx = {
    dataClient: {} as any,
    target: { type: "stock", code: "600519", name: "茅台" },
    executionState: {} as any,
    signal: new AbortController().signal,
  };

  console.log("=== Test 1: Search without content fetch ===");
  const r1 = await webFetchTool.execute({ query: "茅台 2025 财报" }, ctx);
  console.log(r1.slice(0, 500));
  console.log();

  console.log("=== Test 2: Search with content fetch ===");
  const r2 = await webFetchTool.execute(
    { query: "茅台 2025 财报", fetch_content: true },
    ctx,
  );
  console.log(r2.slice(0, 1000));
}

main().catch(console.error);
```

- [ ] **Step 2: 手动运行验证**

```bash
cd /d/code2/agent-trade && npx tsx scripts/smoke-test-web-fetch.ts
```

Expected: 返回真实搜索结果（不验证具体内容，确认流程正常即可）

- [ ] **Step 3: Commit**

```bash
cd /d/code2/agent-trade && git add scripts/smoke-test-web-fetch.ts
git commit -m "test: add smoke test script for web-fetch tool"
```

---

## Completion Checklist

- [ ] `pnpm add cheerio duckduckgo-search` 成功
- [ ] 8 个文件新建，1 个文件修改
- [ ] 21 个单元/集成测试全部 PASS
- [ ] 现有工具测试无回归
- [ ] `tsc --noEmit` 无新增错误
- [ ] Agent YAML 中可通过 `web_fetch` 引用新工具
- [ ] `fetch_content=true` 时可抓取网页全文，`false` 时只返回搜索摘要
