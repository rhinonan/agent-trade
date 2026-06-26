# Web Fetch Tool 设计文档

**日期**: 2026-06-26
**状态**: 已确认
**范围**: agent-trade 项目 — 新增免费联网搜索+网页抓取工具

---

## 背景

agent-trade 现有 `webSearchTool`（`lib/tools/web-search.ts`）依赖火山引擎 Search Infinity API（付费，需 `WEB_SEARCH_API_KEY`），且只返回搜索摘要，不支持网页全文抓取。

参考 FinGenius（HuaYaoAI/FinGenius）的 `web_search` 工具设计，新增一个**免费、零配置、支持全文抓取**的工具，与现有工具并存。

## 目标

- 新增 `web-fetch` 工具，遵循现有 `ToolDefinition` 接口
- DuckDuckGo + Bing 爬虫双引擎 fallback，无需任何 API Key
- 可选抓取搜索结果网页全文（`fetch_content` 参数）
- 与现有 `webSearchTool` 并存，Agent YAML 可按需选用
- 新增依赖最小化：`cheerio` + `duckduckgo-search`

## 非目标

- 不替换或修改现有 `webSearchTool`
- 不引入 headless browser（Playwright/Puppeteer）
- 不支持 Google/百度搜索（需要 API Key 或反爬复杂）

---

## 架构

### 文件结构

```
lib/tools/
├── types.ts              (不变)
├── web-search.ts         (不变，保留现有火山引擎工具)
├── index.ts              (加一行注册)
└── web-fetch/
    ├── index.ts           — 导出 webFetchTool: ToolDefinition
    ├── fetcher.ts         — WebContentFetcher：抓取+清洗网页
    ├── duckduckgo.ts      — DuckDuckGo 搜索引擎
    ├── bing.ts            — Bing 爬虫搜索引擎
    └── __tests__/
        ├── fetcher.test.ts
        ├── duckduckgo.test.ts
        ├── bing.test.ts
        └── web-fetch.test.ts
```

### 组件职责

#### 1. `SearchItem`（内部数据模型）

```ts
interface SearchItem {
  title: string;
  url: string;
  description: string;
}
```

搜索引擎统一返回此格式。

#### 2. `WebContentFetcher`（`fetcher.ts`）

- **输入**: URL 字符串
- **逻辑**: `fetch(url)` → `cheerio.load(html)` → 移除 `script, style, header, footer, nav` → `$("body").text()` → 空白规范化 → 截断到 10,000 字符
- **输出**: `string | null`（失败返回 null）
- **超时**: 15s（通过 `AbortSignal.timeout`）
- **UA**: 伪装 Chrome 91

#### 3. `DuckDuckGoSearchEngine`（`duckduckgo.ts`）

- 调用 `duckduckgo-search` npm 包的 `search()` 函数
- 参数：`query`, `maxResults: 5`
- 返回：`SearchItem[]`
- 异常时返回 `[]`，触发上层 fallback
- 使用 `ctx.signal` 控制中断

#### 4. `BingSearchEngine`（`bing.ts`）

- HTTP GET `https://www.bing.com/search?q=<query>`（伪装浏览器 UA）
- `cheerio` 解析 `<ol id="b_results">` → `<li class="b_algo">` → 提取 `h2 a`（标题+URL）、`p`（摘要）
- 最多翻页 5 页（每页 10 条），达到 `num_results` 后停止
- 返回：`SearchItem[]`

#### 5. `webFetchTool`（`web-fetch/index.ts`）

- 实现 `ToolDefinition` 接口
- 参数：
  - `query`（string, required）：搜索关键词
  - `fetch_content`（boolean, optional, default false）：是否抓取网页全文
- 流程：
  1. 先调 `DuckDuckGoSearchEngine`
  2. 失败（返回空数组）则 fallback 到 `BingSearchEngine`
  3. 全部失败则返回 error JSON
  4. 如果 `fetch_content=true`，用 `Promise.allSettled` 并发抓取所有结果的网页正文
  5. 返回结构化 JSON（含 query、results、source、fetched 标记）
- 总超时：30s（通过 `ctx.signal` + 独立 timeout）

### 返回格式

```json
{
  "query": "茅台 财报 2025",
  "source": "duckduckgo",
  "fetched_content": true,
  "results": [
    {
      "title": "...",
      "url": "https://...",
      "description": "...",
      "content": "全文内容（如果 fetch_content=true 且抓取成功）...",
      "content_error": null
    }
  ]
}
```

- `content` 字段仅在 `fetch_content=true` 时存在
- `content_error` 仅在单个 URL 抓取失败时存在（不阻塞其他结果）

### 错误处理

| 场景 | 行为 |
|------|------|
| DuckDuckGo 返回空 | 自动 fallback 到 Bing |
| Bing 也失败 | 返回 `{ error: "All search engines failed" }` |
| 单个 URL 抓取失败 | 标记 `content_error`，不影响其他结果 |
| 用户取消（ctx.signal） | 返回 `{ error: "Web fetch cancelled" }` |
| 总超时 30s | 返回 `{ error: "Web fetch timed out" }` |

### 依赖

```json
{
  "cheerio": "^1.0.0",
  "duckduckgo-search": "^1.0.0"
}
```

---

## 注册

在 `lib/tools/index.ts` 的 `toolsByName` Map 中加一行：

```ts
["web_fetch", webFetchTool],
```

Agent YAML 配置中即可通过 `web_fetch` 引用。

---

## 与现有 `webSearchTool` 的对比

| 维度 | webSearchTool（现有） | webFetchTool（新增） |
|------|----------------------|---------------------|
| 搜索来源 | 火山引擎 Search Infinity API | DuckDuckGo / Bing |
| 是否需要 API Key | 是 | 否 |
| 费用 | 付费 | 免费 |
| 网页全文 | 不支持 | 支持（可选） |
| 可靠性 | 高（商业 API） | 中（爬虫可能被限流） |
| 适用场景 | 生产环境高可靠搜索 | 开发/低成本/深度抓取 |

---

## 测试策略

- **单元测试**: `fetcher.test.ts` — mock `fetch`，验证 HTML 清洗逻辑
- **单元测试**: `duckduckgo.test.ts` — mock `duckduckgo-search` 返回值
- **单元测试**: `bing.test.ts` — mock Bing HTML 响应，验证解析
- **集成测试**: `web-fetch.test.ts` — 端到端搜索+抓取流程
- 所有测试使用 `vitest`，与项目现有测试框架一致

## 变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/tools/web-fetch/fetcher.ts` | 新增 | WebContentFetcher |
| `lib/tools/web-fetch/duckduckgo.ts` | 新增 | DuckDuckGo 引擎 |
| `lib/tools/web-fetch/bing.ts` | 新增 | Bing 爬虫引擎 |
| `lib/tools/web-fetch/index.ts` | 新增 | webFetchTool 主入口 |
| `lib/tools/web-fetch/__tests__/fetcher.test.ts` | 新增 | |
| `lib/tools/web-fetch/__tests__/duckduckgo.test.ts` | 新增 | |
| `lib/tools/web-fetch/__tests__/bing.test.ts` | 新增 | |
| `lib/tools/web-fetch/__tests__/web-fetch.test.ts` | 新增 | |
| `lib/tools/index.ts` | 修改 | 注册 webFetchTool |
| `package.json` | 修改 | 加 cheerio, duckduckgo-search |
