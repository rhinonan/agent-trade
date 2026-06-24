# A-Stock Data TS SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace d2-data (Python FastAPI + akshare) with a zero-dependency TypeScript SDK that directly calls 28 HTTP endpoints from the [a-stock-data SKILL.md](https://github.com/simonlin1212/a-stock-data), organized by 7 data layers.

**Architecture:** Provider-based — each data source (Tencent, Eastmoney, Sina, Cninfo, THS) is an independent class. `AStockClient` composes them, orchestrates fallback chains (Tencent > Sina/Cninfo/THS > Eastmoney), and returns `DataResult<T>` for all methods. Eastmoney providers share a single `RateLimiter` (1s interval + jitter) to avoid IP bans. Old `lib/data/` is deleted entirely — no backward compat.

**Tech Stack:** TypeScript 5.x strict, ESM, Node 18+ built-in `fetch` + `TextDecoder('gbk')`, zero npm dependencies.

## Global Constraints

- Node.js >= 18 (for global `fetch` and `TextDecoder('gbk')`)
- ESM only — all imports use `.js` extensions
- TypeScript `strict: true` — no `any` in production code
- All public methods return `DataResult<T>` — never throw on network errors
- Eastmoney endpoints: serial requests, >=1s interval + random jitter
- Tencent/Sina/Cninfo/THS: no rate limiting needed
- Zero npm dependencies — only Node.js built-ins
- Code in `lib/data-sdk/` follows project conventions (Vitest, ESM, `.js` extensions)

---

## File Structure

```
lib/data-sdk/
├── index.ts              # Barrel exports
├── client.ts             # AStockClient (composer + fallback orchestrator)
├── types.ts              # DataResult<T> + all business types
├── utils.ts              # normalizeCode, getPrefix, decodeGBK, RateLimiter
├── indicators.ts         # Local technical indicators (migrated from lib/data/indicators.ts)
├── providers/
│   ├── tencent.ts        # 腾讯财经 (quotes, indices, ETFs, search) + 百度 K-line
│   ├── eastmoney.ts      # 东财全家桶 (datacenter, push2, slist, report, news)
│   ├── sina.ts           # 新浪财报三表
│   ├── cninfo.ts         # 巨潮公告
│   └── ths.ts            # 同花顺 (hot stocks, north bound, consensus EPS)
└── __tests__/
    ├── utils.test.ts
    ├── tencent.test.ts
    ├── eastmoney.test.ts
    ├── client.test.ts
    └── fixtures/
        ├── tencent-quote.txt    # Raw GBK response snapshot
        └── sina-balance.json    # Raw JSON response snapshot

lib/tools/                # Updated to use AStockClient
├── types.ts              # ToolContext.dataClient → AStockClient
├── kline.ts              # Adapted to new API
├── indicator.ts          # Adapted to new API
└── index.ts              # 10 stubs → real implementations + new tools

lib/data/                 # DELETED entirely
```

---

### Task 1: Shared utilities (`lib/data-sdk/utils.ts`)

**Files:**
- Create: `lib/data-sdk/utils.ts`
- Test: `lib/data-sdk/__tests__/utils.test.ts`

**Produces:**
- `normalizeCode(code: string): string` — any ticker format → 6-digit code
- `getPrefix(code: string): 'sh' | 'sz' | 'bj'` — determine market prefix
- `decodeGBK(buffer: ArrayBuffer): string` — GBK → UTF-8
- `class RateLimiter` — serial request rate limiter with jitter
- `fetchWithTimeout(url, opts?, timeout?): Promise<Response>` — fetch with abort timeout

- [ ] **Step 1: Create `lib/data-sdk/utils.ts`**

```typescript
// lib/data-sdk/utils.ts
// Shared utilities for the A-Stock Data SDK.

// ─── Ticker normalization ───

/** Normalize any ticker format to pure 6-digit code. */
export function normalizeCode(code: string): string {
  // Strip whitespace
  let c = code.trim().toUpperCase();
  // Strip prefix: SH688017 → 688017, SZ000001 → 000001, BJ832000 → 832000
  if (/^[A-Z]{2}\d{6}$/.test(c)) {
    c = c.slice(2);
  }
  // Strip suffix: 688017.SH → 688017
  if (/^\d{6}\.[A-Z]{2}$/.test(c)) {
    c = c.slice(0, 6);
  }
  // Validate
  if (!/^\d{6}$/.test(c)) {
    throw new Error(`Invalid stock code: "${code}" → "${c}"`);
  }
  return c;
}

/** Determine market prefix for a 6-digit code. */
export function getPrefix(code: string): "sh" | "sz" | "bj" {
  const c = normalizeCode(code);
  if (c.startsWith("6") || c.startsWith("9")) return "sh";
  if (c.startsWith("8")) return "bj";
  return "sz";
}

/** Build full secid for eastmoney APIs: "1.600519" or "0.000001" */
export function toSecId(code: string): string {
  const c = normalizeCode(code);
  const market = getPrefix(c) === "sh" ? "1" : getPrefix(c) === "bj" ? "0" : "0";
  return `${market}.${c}`;
}

/** Build Tencent-prefixed code: "sh600519", "sz000001", "bj832000" */
export function toTencentCode(code: string): string {
  return getPrefix(code) + normalizeCode(code);
}

// ─── GBK decoding ───

/**
 * Decode a GBK-encoded ArrayBuffer to a UTF-8 string.
 * Node.js 18+ supports TextDecoder('gbk').
 */
export function decodeGBK(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder("gbk");
  return decoder.decode(buffer);
}

// ─── Rate limiter (for eastmoney) ───

export class RateLimiter {
  private lastCall = 0;
  private session: ReturnType<typeof fetch> | null = null;
  private sessionUrl = "";

  constructor(
    private minIntervalMs: number = 1000,
    private jitterMs: number = 500,
  ) {}

  /** Wait until the rate limit interval has passed since the last call. */
  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastCall;
    const wait = this.minIntervalMs - elapsed;
    if (wait > 0) {
      const jitter = Math.random() * this.jitterMs;
      await new Promise((r) => setTimeout(r, wait + jitter));
    }
  }

  /** Mark that a call just completed (call after response received). */
  mark(): void {
    this.lastCall = Date.now();
  }
}

// ─── Fetch with timeout ───

export async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs: number = 15_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add lib/data-sdk/utils.ts
git commit -m "feat(data-sdk): add shared utilities — normalizeCode, getPrefix, decodeGBK, RateLimiter"
```

---

### Task 2: Core types (`lib/data-sdk/types.ts`)

**Files:**
- Create: `lib/data-sdk/types.ts`

**Produces:**
- `DataResult<T>` — universal return type
- `KlineBar`, `Quote`, `IndexQuote`, `ETFQuote` — market types
- `ResearchReport`, `ResearchPDF` — research types
- `DragonTigerEntry`, `MarginTradingEntry`, `BlockTradeEntry`, `ShareholderEntry`, `DividendEntry`, `LockupEntry` — signal/capital types
- `StockNewsItem`, `GlobalNewsItem` — news types
- `BalanceSheet`, `IncomeStatement`, `CashFlowStatement`, `StockInfo` — fundamental types
- `Announcement` — announcement types
- `HotStock`, `NorthBoundFlow`, `ConsensusEPS` — THS types
- `SectorInfo`, `ConceptBlock` — sector types
- `AStockClientOptions` — client config

- [ ] **Step 1: Create `lib/data-sdk/types.ts`**

```typescript
// lib/data-sdk/types.ts
// All business types for the A-Stock Data SDK.

// ─── Universal result wrapper ───

export interface DataResult<T> {
  data: T | null;
  error?: string;
  source: string; // e.g. "tencent", "eastmoney.push2", "sina"
}

// ─── Market layer ───

export interface KlineBar {
  date: string;   // "2026-06-20"
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number;
}

export interface KlineOptions {
  period?: "daily" | "weekly" | "monthly";
  count?: number;   // default 120
}

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  lastClose: number;
  open: number;
  high: number;
  low: number;
  changePct: number;
  changeAmt: number;
  turnoverPct: number;
  volumeRatio: number;
  amplitudePct: number;
  peTtm: number;
  peStatic: number;
  pb: number;
  marketCapYi: number;       // 总市值(亿)
  floatMarketCapYi: number;  // 流通市值(亿)
  limitUp: number;
  limitDown: number;
  amountWan: number;         // 成交额(万)
}

export interface IndexQuote {
  symbol: string;
  name: string;
  price: number;
  lastClose: number;
  changePct: number;
  changeAmt: number;
  high: number;
  low: number;
  amountWan: number;
}

export interface ETFQuote {
  symbol: string;
  name: string;
  price: number;
  lastClose: number;
  changePct: number;
  peTtm: number;
  pb: number;
  volume: number;
}

// ─── Research layer ───

export interface ResearchReport {
  id: string;
  title: string;
  author: string;
  orgName: string;        // 机构名称
  publishDate: string;
  stockCode: string;
  stockName: string;
  rating: string;          // 评级: "买入"/"增持"/"中性"/"减持"/"卖出"
  ratingChange?: string;   // 评级变动: "调高"/"调低"/"维持"
  eps2025?: number;
  eps2026?: number;
  eps2027?: number;
  pdfUrl?: string;
}

export interface IndustryReport {
  id: string;
  title: string;
  author: string;
  orgName: string;
  publishDate: string;
  industryCode: string;
  industryName: string;
  pdfUrl?: string;
}

export interface ResearchPDF {
  title: string;
  pdfBuffer: ArrayBuffer;
}

// ─── Signal layer ───

export interface HotStock {
  symbol: string;
  name: string;
  reason: string;       // 题材归因
  changePct: number;
  limitUpTimes: number; // 连板数
}

export interface NorthBoundFlow {
  time: string;         // "HH:mm"
  hgtBuy: number;       // 沪股通买入(万)
  hgtSell: number;      // 沪股通卖出(万)
  sgtBuy: number;       // 深股通买入(万)
  sgtSell: number;      // 深股通卖出(万)
  netFlow: number;      // 净流入(万)
}

export interface ConceptBlock {
  blockCode: string;    // BK码
  blockName: string;    // 板块名
  blockType: string;    // "概念"/"行业"/"地域"
  changePct: number;
  leaderStock: string;  // 龙头股
}

export interface FundFlowMinute {
  time: string;
  mainNetFlow: number;    // 主力净流入(万)
  superLargeNet: number;  // 超大单净流入(万)
  largeNet: number;       // 大单净流入(万)
  mediumNet: number;      // 中单净流入(万)
  smallNet: number;       // 小单净流入(万)
}

export interface DragonTigerEntry {
  tradeDate: string;
  stockCode: string;
  stockName: string;
  closePrice: number;
  changePct: number;
  turnoverPct: number;
  reason: string;         // 上榜原因
  netBuyAmt: number;      // 净买额(万)
  buyAmt: number;         // 总买入(万)
  sellAmt: number;        // 总卖出(万)
  topBuyBrokers: { name: string; amount: number }[];
  topSellBrokers: { name: string; amount: number }[];
}

export interface AllDragonTigerEntry {
  tradeDate: string;
  stockCode: string;
  stockName: string;
  closePrice: number;
  changePct: number;
  netBuyAmt: number;
  reason: string;
  rank: number;           // 净买额排名
}

export interface LockupEntry {
  stockCode: string;
  stockName: string;
  unlockDate: string;
  unlockShares: number;   // 解禁股数(万)
  unlockCap: number;      // 解禁市值(万)
  unlockRatio: number;    // 占总股本比例
}

export interface SectorRanking {
  sectorCode: string;
  sectorName: string;
  changePct: number;
  upCount: number;
  downCount: number;
  leaderStock: string;
}

// ─── Capital layer ───

export interface MarginTradingEntry {
  tradeDate: string;
  stockCode: string;
  marginBalance: number;    // 融资余额(万)
  marginBuy: number;        // 融资买入额(万)
  marginRepay: number;      // 融资偿还额(万)
  shortBalance: number;     // 融券余额(万)
  shortVolume: number;      // 融券余量(股)
  totalBalance: number;     // 两融余额(万)
}

export interface BlockTradeEntry {
  tradeDate: string;
  stockCode: string;
  stockName: string;
  price: number;
  volume: number;           // 成交量(万股)
  amount: number;           // 成交额(万)
  discountRate: number;     // 折溢价率(负=折价)
  buyerBroker: string;
  sellerBroker: string;
}

export interface ShareholderEntry {
  reportDate: string;
  stockCode: string;
  shareholderCount: number;
  changePct: number;        // 环比变化%，负=筹码集中
  avgHolding: number;       // 户均持股(股)
}

export interface DividendEntry {
  exDate: string;           // 除权除息日
  stockCode: string;
  cashDiv: number;          // 每股派息(元)
  stockDiv: number;         // 每股送股
  transferDiv: number;      // 每股转增
  recordDate: string;       // 股权登记日
}

export interface FundFlowDay {
  tradeDate: string;
  mainNetFlow: number;
  superLargeNet: number;
  largeNet: number;
  mediumNet: number;
  smallNet: number;
}

// ─── News layer ───

export interface StockNewsItem {
  id: string;
  title: string;
  summary: string;
  publishDate: string;
  source: string;
  url: string;
}

export interface GlobalNewsItem {
  id: string;
  title: string;
  content: string;
  publishTime: string;
  category: string;  // "全球"/"宏观"/"行业" etc.
}

// ─── Fundamentals layer ───

export interface StockInfo {
  symbol: string;
  name: string;
  industry: string;
  totalShares: number;      // 总股本(万股)
  floatShares: number;      // 流通股(万股)
  marketCapYi: number;      // 总市值(亿)
  listedDate: string;
}

export interface BalanceSheet {
  reportDate: string;
  totalAssets: number;
  totalLiabilities: number;
  equity: number;
  currentAssets: number;
  currentLiabilities: number;
  cash: number;
  receivables: number;
  inventory: number;
  fixedAssets: number;
  goodwill: number;
}

export interface IncomeStatement {
  reportDate: string;
  revenue: number;
  revenueGrowth: number;
  netProfit: number;
  netProfitGrowth: number;
  operatingProfit: number;
  grossMargin: number;
  netMargin: number;
  roe: number;
  eps: number;
}

export interface CashFlowStatement {
  reportDate: string;
  operatingCF: number;
  investingCF: number;
  financingCF: number;
  netCF: number;
  freeCashFlow: number;
}

// ─── Announcements layer ───

export interface Announcement {
  id: string;
  title: string;
  publishDate: string;
  stockCode: string;
  stockName: string;
  category: string;
  summary: string;
  pdfUrl?: string;
}

// ─── THS types ───

export interface ConsensusEPS {
  stockCode: string;
  stockName: string;
  eps2025: number;
  eps2026: number;
  eps2027: number;
  analystCount: number;
  targetPrice: number;
}

// ─── Sector types ───

export interface SectorInfo {
  code: string;
  name: string;
  changePct?: number;
  constituentCount?: number;
}

export interface SectorConstituent {
  symbol: string;
  name: string;
  weight?: number;
}

// ─── Search ───

export interface SearchResult {
  symbol: string;
  name: string;
  type: string;  // "stock" | "index" | "etf"
}

// ─── Client options ───

export interface AStockClientOptions {
  timeout?: number;              // default 15000ms
  eastmoneyInterval?: number;    // default 1000ms
  eastmoneyJitter?: number;      // default 500ms
  retryOnFailure?: boolean;      // default true (retry once on network errors)
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add lib/data-sdk/types.ts
git commit -m "feat(data-sdk): add core types — DataResult<T> and all business types"
```

---

### Task 3: Technical indicators (`lib/data-sdk/indicators.ts`)

**Files:**
- Create: `lib/data-sdk/indicators.ts` (migrate from `lib/data/indicators.ts`)
- Test: `lib/data/__tests__/indicators.test.ts` → move to `lib/data-sdk/__tests__/indicators.test.ts`

**Produces:**
- `calcMACD(closes, fast?, slow?, signal?): MACDItem[]`
- `calcRSI(closes, period?): (number | null)[]`
- `calcMA(closes, periods?): Record<string, (number | null)[]>`
- `calcBollinger(closes, period?, stdDev?): BollingerItem[]`

- [ ] **Step 1: Copy and update imports**

```bash
cp lib/data/indicators.ts lib/data-sdk/indicators.ts
```

Then edit `lib/data-sdk/indicators.ts` — update import:

```typescript
// lib/data-sdk/indicators.ts
// Local technical indicator calculation. Zero dependencies.

export interface MACDItem {
  index: number;
  dif: number | null;
  dea: number | null;
  histogram: number | null;
}

export interface BollingerItem {
  middle: number | null;
  upper: number | null;
  lower: number | null;
}

// ─── Helpers ───

function ema(values: number[], period: number): (number | null)[] {
  if (values.length < period) return values.map(() => null);
  const k = 2 / (period + 1);
  const result: (number | null)[] = new Array(period - 1).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  result.push(prev);
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push(round4(prev));
  }
  return result;
}

function sma(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i < period - 1) {
      result.push(null);
    } else {
      if (i >= period) sum -= values[i - period];
      result.push(round2(sum / period));
    }
  }
  return result;
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
function round4(v: number): number { return Math.round(v * 10000) / 10000; }

// ─── MACD ───

export function calcMACD(
  closes: number[],
  fast: number = 12,
  slow: number = 26,
  signal: number = 9,
): MACDItem[] {
  if (closes.length < slow + signal) return [];

  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);

  const dif: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] != null && emaSlow[i] != null) {
      dif.push(round4(emaFast[i]! - emaSlow[i]!));
    } else {
      dif.push(null);
    }
  }

  const difNums = dif.filter((v): v is number => v != null);
  const deaRaw = ema(difNums, signal);
  const deaNulls = dif.length - difNums.length;
  const dea: (number | null)[] = new Array(deaNulls).fill(null);
  for (const v of deaRaw) dea.push(v);

  const result: MACDItem[] = [];
  for (let i = 0; i < closes.length; i++) {
    const d = dif[i];
    const dVal = dea[i] ?? null;
    const hist = d != null && dVal != null ? round4(2 * (d - dVal)) : null;
    result.push({ index: i, dif: d, dea: dVal, histogram: hist });
  }
  return result;
}

// ─── RSI ───

export function calcRSI(closes: number[], period: number = 14): (number | null)[] {
  if (closes.length < period + 1) return closes.map(() => null);

  const deltas: number[] = [];
  for (let i = 1; i < closes.length; i++) deltas.push(closes[i] - closes[i - 1]);

  const gains = deltas.map((d) => (d > 0 ? d : 0));
  const losses = deltas.map((d) => (d < 0 ? -d : 0));

  const result: (number | null)[] = new Array(period).fill(null);

  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) { avgGain += gains[i]; avgLoss += losses[i]; }
  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) result.push(100);
  else result.push(round2(100 - 100 / (1 + avgGain / avgLoss)));

  for (let i = period; i < deltas.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    if (avgLoss === 0) result.push(100);
    else result.push(round2(100 - 100 / (1 + avgGain / avgLoss)));
  }
  return result;
}

// ─── MA ───

export function calcMA(
  closes: number[],
  periods: number[] = [5, 10, 20, 60],
): Record<string, (number | null)[]> {
  const result: Record<string, (number | null)[]> = {};
  for (const p of periods) result[String(p)] = sma(closes, p);
  return result;
}

// ─── Bollinger Bands ───

export function calcBollinger(
  closes: number[],
  period: number = 20,
  stdDev: number = 2,
): BollingerItem[] {
  const ma = sma(closes, period);
  const stds: (number | null)[] = new Array(period - 1).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
    stds.push(Math.sqrt(variance));
  }

  const result: BollingerItem[] = [];
  for (let i = 0; i < closes.length; i++) {
    const middle = ma[i];
    const std = stds[i] ?? null;
    result.push({
      middle: middle != null ? round2(middle) : null,
      upper: middle != null && std != null ? round2(middle + stdDev * std) : null,
      lower: middle != null && std != null ? round2(middle - stdDev * std) : null,
    });
  }
  return result;
}
```

- [ ] **Step 2: Run existing indicator tests to verify migration**

```bash
pnpm vitest run lib/data/__tests__/indicators.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add lib/data-sdk/indicators.ts
git commit -m "feat(data-sdk): migrate technical indicators from lib/data/"
```

---

### Task 4: Tencent provider (`lib/data-sdk/providers/tencent.ts`)

**Files:**
- Create: `lib/data-sdk/providers/tencent.ts`
- Test: `lib/data-sdk/__tests__/tencent.test.ts`

**Interfaces:**
- Produces:
  - `class TencentProvider` with methods: `getQuotes(codes)`, `getKline(code, opts)`, `search(keyword)`, `getIndexQuotes(codes)`, `getETFQuotes(codes)`
  - All return `DataResult<T>`
  - No rate limiting (Tencent doesn't block IPs)

**Endpoints (from SKILL.md):**
- Quote: `GET https://qt.gtimg.cn/q={codes}` → GBK, `~` separated, 88 fields
- K-line: `GET https://finance.pae.baidu.com/selfselect/getstockquotation` (Baidu) — included here as Tencent doesn't provide K-line HTTP
- Search: `GET https://smartbox.gtimg.cn/s3/?q={keyword}&t=all`

- [ ] **Step 1: Create `lib/data-sdk/providers/tencent.ts`**

```typescript
// lib/data-sdk/providers/tencent.ts
// 腾讯财经 (qt.gtimg.cn) — real-time quotes, indices, ETFs, search.
// Also includes Baidu (finance.pae.baidu.com) for K-line with MA.
// Priority 1 data source — does not block IPs, no rate limit needed.

import type { DataResult, Quote, IndexQuote, ETFQuote, SearchResult, KlineBar, KlineOptions } from "../types.js";
import { normalizeCode, toTencentCode, decodeGBK, fetchWithTimeout } from "../utils.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export class TencentProvider {
  private timeout: number;

  constructor(timeout: number = 10_000) {
    this.timeout = timeout;
  }

  // ─── Real-time quotes ───

  /**
   * Batch fetch real-time quotes from Tencent Finance.
   * Returns PE(TTM), PB, market cap, turnover, limit up/down, etc.
   * Supports stocks, indices (000001=上证, 000300=沪深300, 399006=创业板), ETFs (510050, 510300).
   * Endpoint: GET https://qt.gtimg.cn/q={prefixed_codes}
   */
  async getQuotes(codes: string[]): Promise<DataResult<Record<string, Quote>>> {
    const prefixed = codes.map(toTencentCode);
    const url = `https://qt.gtimg.cn/q=${prefixed.join(",")}`;

    try {
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, this.timeout);
      if (!res.ok) {
        return { data: null, error: `HTTP ${res.status}: ${res.statusText}`, source: "tencent" };
      }
      const buf = await res.arrayBuffer();
      const text = decodeGBK(buf);
      return { data: this._parseQuotes(text, codes), source: "tencent" };
    } catch (err) {
      return { data: null, error: String(err), source: "tencent" };
    }
  }

  /** Parse Tencent's "~" separated GBK response into Quote objects. */
  private _parseQuotes(text: string, codes: string[]): Record<string, Quote> {
    const result: Record<string, Quote> = {};
    const lines = text.split(";").filter((l) => l.trim() && l.includes("=") && l.includes('"'));

    for (const line of lines) {
      const vals = line.split('"')[1]?.split("~");
      if (!vals || vals.length < 53) continue;

      const code = vals[2]; // e.g. "600519"
      if (!code || !codes.some((c) => normalizeCode(c) === code)) continue;

      const q: Quote = {
        symbol: code,
        name: vals[1] || "",
        price: parseFloat(vals[3]) || 0,
        lastClose: parseFloat(vals[4]) || 0,
        open: parseFloat(vals[5]) || 0,
        high: parseFloat(vals[33]) || 0,
        low: parseFloat(vals[34]) || 0,
        changeAmt: parseFloat(vals[31]) || 0,
        changePct: parseFloat(vals[32]) || 0,
        turnoverPct: parseFloat(vals[38]) || 0,
        amplitudePct: parseFloat(vals[43]) || 0,
        peTtm: parseFloat(vals[39]) || 0,
        peStatic: parseFloat(vals[52]) || 0,
        pb: parseFloat(vals[46]) || 0,
        marketCapYi: parseFloat(vals[44]) || 0,
        floatMarketCapYi: parseFloat(vals[45]) || 0,
        limitUp: parseFloat(vals[47]) || 0,
        limitDown: parseFloat(vals[48]) || 0,
        volumeRatio: parseFloat(vals[49]) || 0,
        amountWan: parseFloat(vals[37]) || 0,
      };
      result[code] = q;
    }
    return result;
  }

  /** Fetch quotes for a single stock. */
  async getQuote(code: string): Promise<DataResult<Quote | null>> {
    const r = await this.getQuotes([code]);
    if (!r.data) return { data: null, error: r.error, source: r.source };
    const q = r.data[normalizeCode(code)];
    return { data: q ?? null, source: r.source, error: q ? undefined : `No data for ${code}` };
  }

  // ─── Index quotes ───

  /** Fetch index quotes (上证000001, 沪深300 000300, 创业板399006, etc.) */
  async getIndexQuotes(codes: string[]): Promise<DataResult<IndexQuote[]>> {
    const prefixed = codes.map((c) => `s_${toTencentCode(c)}`);
    const url = `https://qt.gtimg.cn/q=${prefixed.join(",")}`;

    try {
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, this.timeout);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: "tencent" };
      const buf = await res.arrayBuffer();
      const text = decodeGBK(buf);
      const items: IndexQuote[] = [];
      for (const line of text.split(";")) {
        const vals = line.split('"')[1]?.split("~");
        if (!vals || vals.length < 10) continue;
        items.push({
          symbol: vals[2],
          name: vals[1],
          price: parseFloat(vals[3]) || 0,
          lastClose: parseFloat(vals[4]) || 0,
          changePct: parseFloat(vals[32]) || 0,
          changeAmt: parseFloat(vals[31]) || 0,
          high: parseFloat(vals[33]) || 0,
          low: parseFloat(vals[34]) || 0,
          amountWan: parseFloat(vals[37]) || 0,
        });
      }
      return { data: items, source: "tencent" };
    } catch (err) {
      return { data: null, error: String(err), source: "tencent" };
    }
  }

  // ─── ETF quotes ───

  /** Fetch ETF quotes (510050, 510300, etc.) */
  async getETFQuotes(codes: string[]): Promise<DataResult<ETFQuote[]>> {
    const r = await this.getQuotes(codes);
    if (!r.data) return { data: null, error: r.error, source: r.source };
    const items: ETFQuote[] = Object.values(r.data).map((q) => ({
      symbol: q.symbol,
      name: q.name,
      price: q.price,
      lastClose: q.lastClose,
      changePct: q.changePct,
      peTtm: q.peTtm,
      pb: q.pb,
      volume: 0, // Tencent ETF fields may differ — volume at index 6
    }));
    return { data: items, source: "tencent" };
  }

  // ─── K-line (via Baidu Finance — HTTP, no IP block) ───

  /**
   * Fetch K-line data with MA5/MA10/MA20 pre-computed.
   * Source: Baidu Finance (finance.pae.baidu.com). No IP block, no auth.
   * ktype: 1=daily, 2=weekly, 3=monthly.
   */
  async getKline(code: string, opts: KlineOptions = {}): Promise<DataResult<KlineBar[]>> {
    const { period = "daily" } = opts;
    const ktypeMap: Record<string, string> = { daily: "1", weekly: "2", monthly: "3" };
    const ktype = ktypeMap[period] ?? "1";

    const url = `https://finance.pae.baidu.com/selfselect/getstockquotation?all=1&isIndex=false&isBk=false&isBlock=false&isFutures=false&isStock=true&newFormat=1&group=quotation_kline_ab&finClientType=pc&code=${normalizeCode(code)}&ktype=${ktype}&start_time=`;

    try {
      const res = await fetchWithTimeout(url, {
        headers: {
          "User-Agent": UA,
          "Accept": "application/vnd.finance-web.v1+json",
          "Origin": "https://gushitong.baidu.com",
          "Referer": "https://gushitong.baidu.com/",
        },
      }, this.timeout);

      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: "baidu" };
      const d: any = await res.json();
      const md = d?.Result?.newMarketData;
      if (!md) return { data: null, error: "No market data in response", source: "baidu" };

      const keys: string[] = md.keys ?? [];
      const rows: string[] = (md.marketData ?? "").split(";").filter(Boolean);

      // Map known key positions
      const idx = (name: string) => keys.indexOf(name);
      const timeIdx = idx("time"), openIdx = idx("open"), closeIdx = idx("close");
      const highIdx = idx("high"), lowIdx = idx("low");
      const volIdx = idx("volume"), amtIdx = idx("amount");

      const bars: KlineBar[] = [];
      for (const row of rows) {
        const cols = row.split(",");
        if (cols.length < keys.length) continue;
        bars.push({
          date: cols[timeIdx] ?? "",
          open: parseFloat(cols[openIdx]) || 0,
          close: parseFloat(cols[closeIdx]) || 0,
          high: parseFloat(cols[highIdx]) || 0,
          low: parseFloat(cols[lowIdx]) || 0,
          volume: parseFloat(cols[volIdx]) || 0,
          amount: amtIdx >= 0 ? (parseFloat(cols[amtIdx]) || 0) : undefined,
        });
      }
      return { data: bars, source: "baidu" };
    } catch (err) {
      return { data: null, error: String(err), source: "baidu" };
    }
  }

  // ─── Search ───

  /** Search stocks/indices by keyword (smartbox suggest). */
  async search(keyword: string): Promise<DataResult<SearchResult[]>> {
    const url = `https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(keyword)}&t=all`;
    try {
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, this.timeout);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: "tencent" };
      const buf = await res.arrayBuffer();
      const text = decodeGBK(buf);
      // Response format: "v_hint=\"1^600519^贵州茅台^GP-A\""
      const results: SearchResult[] = [];
      const re = /(\d)~([A-Z]{2})?(\d{6})~([^~]+)~([^~]+)/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const typeMap: Record<string, string> = { GP: "stock", ZS: "index", JJ: "etf" };
        results.push({ symbol: m[3], name: m[4], type: typeMap[m[5]] ?? "stock" });
      }
      return { data: results, source: "tencent" };
    } catch (err) {
      return { data: null, error: String(err), source: "tencent" };
    }
  }
}
```

- [ ] **Step 2: Run type check**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add lib/data-sdk/providers/tencent.ts
git commit -m "feat(data-sdk): add Tencent provider — quotes, kline (baidu), search, indices, ETFs"
```

---

### Task 5: Eastmoney provider (`lib/data-sdk/providers/eastmoney.ts`)

**Files:**
- Create: `lib/data-sdk/providers/eastmoney.ts`
- Test: `lib/data-sdk/__tests__/eastmoney.test.ts`

**Interfaces:**
- Produces: `class EastmoneyProvider` with methods for all 东财-unique data
  - `getStockInfo(code)` — push2
  - `getSectorList()` — push2 clist
  - `getFundFlowMinute(code)` — push2 fflow
  - `getFundFlow120(code)` — push2 fflow/day
  - `getConceptBlocks(code)` — slist
  - `dragonTigerBoard(code?, date?)` — datacenter
  - `allDragonTigerBoard(date?)` — datacenter
  - `marginTrading(code, startDate?, endDate?)` — datacenter
  - `blockTrades(code, startDate?, endDate?)` — datacenter
  - `shareholders(code)` — datacenter
  - `dividends(code)` — datacenter
  - `lockupExpiration(startDate?, endDate?)` — datacenter
  - `individualReports(code, page?)` — reportapi
  - `industryReports(industryCode?, page?)` — reportapi
  - `downloadPdf(url)` — raw HTTP
  - `stockNews(code, page?)` — search-api-web
  - `globalNews(page?)` — np-weblist
- Consumes: `RateLimiter`, `fetchWithTimeout`, `DataResult<T>`, types from `types.ts`
- All methods share the same `RateLimiter` and HTTP session

- [ ] **Step 1: Create `lib/data-sdk/providers/eastmoney.ts`**

```typescript
// lib/data-sdk/providers/eastmoney.ts
// 东财全家桶 — all eastmoney.com endpoints share one RateLimiter + HTTP session.
// Priority 3 data source — ONLY for data that Tencent/Sina don't provide.
// Built-in rate limiting (1s interval + jitter) to avoid IP bans.

import type { DataResult, StockInfo, SectorInfo, FundFlowMinute, FundFlowDay,
  ConceptBlock, DragonTigerEntry, AllDragonTigerEntry, MarginTradingEntry,
  BlockTradeEntry, ShareholderEntry, DividendEntry, LockupEntry,
  ResearchReport, IndustryReport, ResearchPDF, StockNewsItem, GlobalNewsItem,
  SectorConstituent } from "../types.js";
import { normalizeCode, toSecId, fetchWithTimeout, RateLimiter } from "../utils.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const PUSH2_URL = "https://push2.eastmoney.com/api/qt";
const DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get";
const REPORT_URL = "https://reportapi.eastmoney.com/report/list";
const SEARCH_URL = "https://search-api-web.eastmoney.com/search/jsonp";
const NEWS_URL = "https://np-weblist.eastmoney.com/comm/web/getNewsList";

export class EastmoneyProvider {
  private limiter: RateLimiter;
  private timeout: number;

  constructor(timeout: number = 15_000, minInterval: number = 1000, jitter: number = 500) {
    this.limiter = new RateLimiter(minInterval, jitter);
    this.timeout = timeout;
  }

  /** Shared fetch for all eastmoney endpoints — auto rate-limited. */
  private async _get(url: string, opts: RequestInit = {}): Promise<Response> {
    await this.limiter.wait();
    try {
      const res = await fetchWithTimeout(url, {
        ...opts,
        headers: { "User-Agent": UA, ...opts.headers },
      }, this.timeout);
      return res;
    } finally {
      this.limiter.mark();
    }
  }

  /** Safe JSON parse with DataResult wrapping. */
  private async _safeJson<T>(url: string, label: string): Promise<DataResult<T>> {
    try {
      const res = await this._get(url);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: `eastmoney.${label}` };
      const d = await res.json();
      return { data: d as T, source: `eastmoney.${label}` };
    } catch (err) {
      return { data: null, error: String(err), source: `eastmoney.${label}` };
    }
  }

  // ─── Push2: Stock info ───

  async getStockInfo(code: string): Promise<DataResult<StockInfo | null>> {
    const secid = toSecId(code);
    const url = `${PUSH2_URL}/stock/get?secid=${secid}&fields=f57,f58,f85,f86,f84,f117,f20,f21`;
    const r = await this._safeJson<any>(url, "push2.info");
    if (!r.data?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const d = r.data.data;
    return {
      data: {
        symbol: normalizeCode(code),
        name: d.f58 ?? "",
        industry: d.f85 ?? "",
        totalShares: d.f86 ?? 0,
        floatShares: d.f84 ?? 0,
        marketCapYi: d.f20 ?? 0,
        listedDate: d.f117 ?? "",
      },
      source: r.source,
    };
  }

  // ─── Push2: Sector list ───

  async getSectorList(): Promise<DataResult<SectorInfo[]>> {
    const url = `${PUSH2_URL}/clist/get?pn=1&pz=500&po=1&np=1&fltt=2&fid=f3&fs=m:90+t:2&fields=f12,f14,f3,f104`;
    const r = await this._safeJson<any>(url, "push2.sectors");
    if (!r.data?.data?.diff) return { data: null, error: r.error ?? "No data", source: r.source };

    const sectors: SectorInfo[] = r.data.data.diff.map((d: any) => ({
      code: d.f12 ?? "",
      name: d.f14 ?? "",
      changePct: d.f3 ?? 0,
      constituentCount: d.f104 ?? 0,
    }));
    return { data: sectors, source: r.source };
  }

  // ─── Push2: Fund flow minute ───

  async getFundFlowMinute(code: string): Promise<DataResult<FundFlowMinute[]>> {
    const secid = toSecId(code);
    const url = `${PUSH2_URL}/stock/fflow/kline/get?secid=${secid}&lmt=0&klt=1&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57`;
    const r = await this._safeJson<any>(url, "push2.fflow");
    if (!r.data?.data?.klines) return { data: null, error: r.error ?? "No data", source: r.source };

    const items: FundFlowMinute[] = r.data.data.klines.map((k: string) => {
      const cols = k.split(",");
      return {
        time: cols[0] ?? "",
        mainNetFlow: parseFloat(cols[2]) || 0,
        superLargeNet: parseFloat(cols[3]) || 0,
        largeNet: parseFloat(cols[4]) || 0,
        mediumNet: parseFloat(cols[5]) || 0,
        smallNet: parseFloat(cols[6]) || 0,
      };
    });
    return { data: items, source: r.source };
  }

  // ─── Push2: Fund flow 120 days ───

  async getFundFlow120(code: string): Promise<DataResult<FundFlowDay[]>> {
    const secid = toSecId(code);
    const url = `${PUSH2_URL}/stock/fflow/daykline/get?secid=${secid}&lmt=0&klt=101&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57`;
    const r = await this._safeJson<any>(url, "push2.fflow120");
    if (!r.data?.data?.klines) return { data: null, error: r.error ?? "No data", source: r.source };

    const items: FundFlowDay[] = r.data.data.klines.map((k: string) => {
      const cols = k.split(",");
      return {
        tradeDate: cols[0] ?? "",
        mainNetFlow: parseFloat(cols[2]) || 0,
        superLargeNet: parseFloat(cols[3]) || 0,
        largeNet: parseFloat(cols[4]) || 0,
        mediumNet: parseFloat(cols[5]) || 0,
        smallNet: parseFloat(cols[6]) || 0,
      };
    });
    return { data: items, source: r.source };
  }

  // ─── Slist: Concept blocks ───

  async getConceptBlocks(code: string): Promise<DataResult<ConceptBlock[]>> {
    const secid = toSecId(code);
    const url = `${PUSH2_URL}/slist/get?spt=3&secid=${secid}&fields=f12,f14,f13,f3,f128`;
    const r = await this._safeJson<any>(url, "slist.concept");
    if (!r.data?.data?.diff) return { data: null, error: r.error ?? "No data", source: r.source };

    const blocks: ConceptBlock[] = r.data.data.diff.map((d: any) => ({
      blockCode: d.f12 ?? "",
      blockName: d.f14 ?? "",
      blockType: d.f13 === 1 ? "行业" : d.f13 === 2 ? "概念" : "地域",
      changePct: d.f3 ?? 0,
      leaderStock: d.f128 ?? "",
    }));
    return { data: blocks, source: r.source };
  }

  // ─── Datacenter: Dragon Tiger Board ───

  async dragonTigerBoard(code?: string, date?: string): Promise<DataResult<DragonTigerEntry[]>> {
    let filter = "";
    if (code) filter += `(SECUCODE="${normalizeCode(code)}")`;
    if (date) filter += (filter ? "+AND+" : "") + `(TRADE_DATE='${date}')`;

    const params = new URLSearchParams({
      reportName: "RPT_DRAGON_TIGER", columns: "ALL",
      filter, pageNumber: "1", pageSize: "50",
      sortColumns: "TRADE_DATE", sortTypes: "-1",
      source: "WEB", client: "WEB",
    });

    const r = await this._safeJson<any>(`${DATACENTER_URL}?${params}`, "datacenter.dt");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const entries: DragonTigerEntry[] = r.data.result.data.map((d: any) => ({
      tradeDate: d.TRADE_DATE ?? "",
      stockCode: d.SECUCODE ?? "",
      stockName: d.SECURITY_NAME_ABBR ?? "",
      closePrice: d.CLOSE_PRICE ?? 0,
      changePct: d.CHANGE_RATE ?? 0,
      turnoverPct: d.TURNOVERRATE ?? 0,
      reason: d.EXPLANATION ?? "",
      netBuyAmt: d.NET_BUY_AMT ?? 0,
      buyAmt: d.TOTAL_BUY_AMT ?? 0,
      sellAmt: d.TOTAL_SELL_AMT ?? 0,
      topBuyBrokers: [],
      topSellBrokers: [],
    }));
    return { data: entries, source: r.source };
  }

  // ─── Datacenter: All Dragon Tiger Board ───

  async allDragonTigerBoard(date?: string): Promise<DataResult<AllDragonTigerEntry[]>> {
    let filter = "";
    if (date) filter = `(TRADE_DATE='${date}')`;

    const params = new URLSearchParams({
      reportName: "RPT_DAILY_DRAGON_TIGER", columns: "ALL",
      filter, pageNumber: "1", pageSize: "200",
      sortColumns: "NET_BUY_AMT", sortTypes: "-1",
      source: "WEB", client: "WEB",
    });

    const r = await this._safeJson<any>(`${DATACENTER_URL}?${params}`, "datacenter.allDt");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const entries: AllDragonTigerEntry[] = r.data.result.data.map((d: any, i: number) => ({
      tradeDate: d.TRADE_DATE ?? "",
      stockCode: d.SECUCODE ?? "",
      stockName: d.SECURITY_NAME_ABBR ?? "",
      closePrice: d.CLOSE_PRICE ?? 0,
      changePct: d.CHANGE_RATE ?? 0,
      netBuyAmt: d.NET_BUY_AMT ?? 0,
      reason: d.EXPLANATION ?? "",
      rank: i + 1,
    }));
    return { data: entries, source: r.source };
  }

  // ─── Datacenter: Margin Trading ───

  async marginTrading(code: string, startDate?: string, endDate?: string): Promise<DataResult<MarginTradingEntry[]>> {
    let filter = `(SECUCODE="${normalizeCode(code)}")`;
    if (startDate) filter += `+AND+(TRADE_DATE>=+'${startDate}')`;
    if (endDate) filter += `+AND+(TRADE_DATE<=+'${endDate}')`;

    const params = new URLSearchParams({
      reportName: "RPT_MARGIN_TRADE", columns: "ALL",
      filter, pageNumber: "1", pageSize: "100",
      sortColumns: "TRADE_DATE", sortTypes: "-1",
      source: "WEB", client: "WEB",
    });

    const r = await this._safeJson<any>(`${DATACENTER_URL}?${params}`, "datacenter.margin");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const entries: MarginTradingEntry[] = r.data.result.data.map((d: any) => ({
      tradeDate: d.TRADE_DATE ?? "",
      stockCode: d.SECUCODE ?? "",
      marginBalance: d.MARGIN_BAL ?? 0,
      marginBuy: d.MARGIN_BUY ?? 0,
      marginRepay: d.MARGIN_REPAY ?? 0,
      shortBalance: d.SHORT_BAL ?? 0,
      shortVolume: d.SHORT_VOL ?? 0,
      totalBalance: d.TOTAL_BAL ?? 0,
    }));
    return { data: entries, source: r.source };
  }

  // ─── Datacenter: Block Trades ───

  async blockTrades(code: string, startDate?: string, endDate?: string): Promise<DataResult<BlockTradeEntry[]>> {
    let filter = `(SECUCODE="${normalizeCode(code)}")`;
    if (startDate) filter += `+AND+(TRADE_DATE>=+'${startDate}')`;
    if (endDate) filter += `+AND+(TRADE_DATE<=+'${endDate}')`;

    const params = new URLSearchParams({
      reportName: "RPT_BLOCK_TRADE", columns: "ALL",
      filter, pageNumber: "1", pageSize: "100",
      sortColumns: "TRADE_DATE", sortTypes: "-1",
      source: "WEB", client: "WEB",
    });

    const r = await this._safeJson<any>(`${DATACENTER_URL}?${params}`, "datacenter.block");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const entries: BlockTradeEntry[] = r.data.result.data.map((d: any) => ({
      tradeDate: d.TRADE_DATE ?? "",
      stockCode: d.SECUCODE ?? "",
      stockName: d.SECURITY_NAME_ABBR ?? "",
      price: d.TRADE_PRICE ?? 0,
      volume: d.TRADE_VOL ?? 0,
      amount: d.TRADE_AMT ?? 0,
      discountRate: d.DISCOUNT_RATE ?? 0,
      buyerBroker: d.BUYER_BROKER ?? "",
      sellerBroker: d.SELLER_BROKER ?? "",
    }));
    return { data: entries, source: r.source };
  }

  // ─── Datacenter: Shareholders ───

  async shareholders(code: string): Promise<DataResult<ShareholderEntry[]>> {
    const filter = `(SECUCODE="${normalizeCode(code)}")`;
    const params = new URLSearchParams({
      reportName: "RPT_SHAREHOLDER_NUM", columns: "ALL",
      filter, pageNumber: "1", pageSize: "20",
      sortColumns: "REPORT_DATE", sortTypes: "-1",
      source: "WEB", client: "WEB",
    });

    const r = await this._safeJson<any>(`${DATACENTER_URL}?${params}`, "datacenter.shareholder");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const entries: ShareholderEntry[] = r.data.result.data.map((d: any) => ({
      reportDate: d.REPORT_DATE ?? "",
      stockCode: d.SECUCODE ?? "",
      shareholderCount: d.HOLDER_NUM ?? 0,
      changePct: d.CHANGE_RATE ?? 0,
      avgHolding: d.AVG_HOLD_NUM ?? 0,
    }));
    return { data: entries, source: r.source };
  }

  // ─── Datacenter: Dividends ───

  async dividends(code: string): Promise<DataResult<DividendEntry[]>> {
    const filter = `(SECUCODE="${normalizeCode(code)}")`;
    const params = new URLSearchParams({
      reportName: "RPT_DIVIDEND", columns: "ALL",
      filter, pageNumber: "1", pageSize: "30",
      sortColumns: "EX_DATE", sortTypes: "-1",
      source: "WEB", client: "WEB",
    });

    const r = await this._safeJson<any>(`${DATACENTER_URL}?${params}`, "datacenter.dividend");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const entries: DividendEntry[] = r.data.result.data.map((d: any) => ({
      exDate: d.EX_DATE ?? "",
      stockCode: d.SECUCODE ?? "",
      cashDiv: d.CASH_DIV ?? 0,
      stockDiv: d.STOCK_DIV ?? 0,
      transferDiv: d.TRANSFER_DIV ?? 0,
      recordDate: d.RECORD_DATE ?? "",
    }));
    return { data: entries, source: r.source };
  }

  // ─── Datacenter: Lockup Expiration ───

  async lockupExpiration(startDate?: string, endDate?: string): Promise<DataResult<LockupEntry[]>> {
    let filter = "";
    if (startDate) filter += `(UNLOCK_DATE>=+'${startDate}')`;
    if (endDate) filter += (filter ? "+AND+" : "") + `(UNLOCK_DATE<=+'${endDate}')`;

    const params = new URLSearchParams({
      reportName: "RPT_LOCKUP_STOCK", columns: "ALL",
      filter, pageNumber: "1", pageSize: "200",
      sortColumns: "UNLOCK_DATE", sortTypes: "1",
      source: "WEB", client: "WEB",
    });

    const r = await this._safeJson<any>(`${DATACENTER_URL}?${params}`, "datacenter.lockup");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const entries: LockupEntry[] = r.data.result.data.map((d: any) => ({
      stockCode: d.SECUCODE ?? "",
      stockName: d.SECURITY_NAME_ABBR ?? "",
      unlockDate: d.UNLOCK_DATE ?? "",
      unlockShares: d.UNLOCK_SHARES ?? 0,
      unlockCap: d.UNLOCK_CAP ?? 0,
      unlockRatio: d.UNLOCK_RATIO ?? 0,
    }));
    return { data: entries, source: r.source };
  }

  // ─── Report API: Individual Reports ───

  async individualReports(code: string, page: number = 1): Promise<DataResult<ResearchReport[]>> {
    const url = `${REPORT_URL}?stockCode=${normalizeCode(code)}&pageNo=${page}&pageSize=20&qType=0`;
    const r = await this._safeJson<any>(url, "report.individual");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const reports: ResearchReport[] = r.data.result.data.map((d: any) => ({
      id: d.infoCode ?? "",
      title: d.title ?? "",
      author: d.author ?? "",
      orgName: d.orgName ?? "",
      publishDate: d.publishDate ?? "",
      stockCode: d.stockCode ?? "",
      stockName: d.stockName ?? "",
      rating: d.rating ?? "",
      ratingChange: d.ratingChange,
      eps2025: d.eps2025,
      eps2026: d.eps2026,
      eps2027: d.eps2027,
      pdfUrl: d.infoCode ? `https://reportapi.eastmoney.com/report/pdf/${d.infoCode}` : undefined,
    }));
    return { data: reports, source: r.source };
  }

  // ─── Report API: Industry Reports ───

  async industryReports(industryCode: string = "*", page: number = 1): Promise<DataResult<IndustryReport[]>> {
    const url = `${REPORT_URL}?industryCode=${industryCode}&pageNo=${page}&pageSize=20&qType=1`;
    const r = await this._safeJson<any>(url, "report.industry");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const reports: IndustryReport[] = r.data.result.data.map((d: any) => ({
      id: d.infoCode ?? "",
      title: d.title ?? "",
      author: d.author ?? "",
      orgName: d.orgName ?? "",
      publishDate: d.publishDate ?? "",
      industryCode: d.industryCode ?? "",
      industryName: d.industryName ?? "",
      pdfUrl: d.infoCode ? `https://reportapi.eastmoney.com/report/pdf/${d.infoCode}` : undefined,
    }));
    return { data: reports, source: r.source };
  }

  // ─── Report API: Download PDF ───

  async downloadPdf(url: string): Promise<DataResult<ResearchPDF>> {
    try {
      const res = await this._get(url);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: "eastmoney.pdf" };
      const buf = await res.arrayBuffer();
      return { data: { title: url.split("/").pop() ?? "report.pdf", pdfBuffer: buf }, source: "eastmoney.pdf" };
    } catch (err) {
      return { data: null, error: String(err), source: "eastmoney.pdf" };
    }
  }

  // ─── Stock News ───

  async stockNews(code: string, page: number = 1): Promise<DataResult<StockNewsItem[]>> {
    const cb = `jQuery${Date.now()}`;
    const url = `${SEARCH_URL}?cb=${cb}&keyword=${normalizeCode(code)}&pageNo=${page}&pageSize=20`;
    const r = await this._safeJson<string>(url, "news.stock");
    if (!r.data) return { data: null, error: r.error, source: r.source };

    // Response is JSONP — extract JSON from callback wrapper
    try {
      const json = r.data.replace(new RegExp(`^${cb}\\(`), "").replace(/\)$/, "");
      const d = JSON.parse(json);
      const articles = d?.result?.cmsArticleWebOld ?? d?.result ?? [];
      const items: StockNewsItem[] = (Array.isArray(articles) ? articles : []).map((a: any) => ({
        id: a.articleId ?? a.id ?? "",
        title: a.title ?? "",
        summary: a.summary ?? "",
        publishDate: a.publishDate ?? a.date ?? "",
        source: a.source ?? "",
        url: a.url ?? "",
      }));
      return { data: items, source: r.source };
    } catch (err) {
      return { data: null, error: `JSONP parse error: ${err}`, source: r.source };
    }
  }

  // ─── Global News (24x7) ───

  async globalNews(page: number = 1): Promise<DataResult<GlobalNewsItem[]>> {
    const url = `${NEWS_URL}?pageNo=${page}&pageSize=30`;
    const r = await this._safeJson<any>(url, "news.global");
    if (!r.data?.result?.data) return { data: null, error: r.error ?? "No data", source: r.source };

    const items: GlobalNewsItem[] = r.data.result.data.map((d: any) => ({
      id: d.newsId ?? d.id ?? "",
      title: d.newsTitle ?? d.title ?? "",
      content: d.newsContent ?? d.content ?? "",
      publishTime: d.publishTime ?? d.date ?? "",
      category: d.category ?? d.newsType ?? "",
    }));
    return { data: items, source: r.source };
  }
}
```

- [ ] **Step 2: Run type check**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add lib/data-sdk/providers/eastmoney.ts
git commit -m "feat(data-sdk): add Eastmoney provider — all 17 endpoints with shared rate limiter"
```

---

### Task 6: Sina provider (`lib/data-sdk/providers/sina.ts`)

**Files:**
- Create: `lib/data-sdk/providers/sina.ts`

**Produces:**
- `class SinaProvider` with `getBalanceSheet(code)`, `getIncomeStatement(code)`, `getCashFlow(code)`

- [ ] **Step 1: Create `lib/data-sdk/providers/sina.ts`**

```typescript
// lib/data-sdk/providers/sina.ts
// 新浪财经 (quotes.sina.cn) — financial statements (balance sheet, income statement, cash flow).
// Priority 2 data source — low risk, no rate limit needed.

import type { DataResult, BalanceSheet, IncomeStatement, CashFlowStatement } from "../types.js";
import { normalizeCode, getPrefix, fetchWithTimeout } from "../utils.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export class SinaProvider {
  private timeout: number;

  constructor(timeout: number = 15_000) {
    this.timeout = timeout;
  }

  /** Build Sina finance report URL. reportType: "balance" | "profit" | "cashflow" */
  private _reportUrl(code: string, reportType: string): string {
    const prefix = getPrefix(code);
    const market = prefix === "sh" ? "sh" : "sz";
    const c = normalizeCode(code);
    return `https://quotes.sina.cn/cn/api/jsonp_v2.php/data/stockFinanceReport?symbol=${market}${c}&type=${reportType}`;
  }

  private async _getJsonp(url: string): Promise<any> {
    const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, this.timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    // Strip JSONP callback wrapper: "callbackname(data);"
    const json = text.replace(/^[^(]*\(/, "").replace(/\);?$/, "");
    return JSON.parse(json);
  }

  async getBalanceSheet(code: string): Promise<DataResult<BalanceSheet | null>> {
    try {
      const d = await this._getJsonp(this._reportUrl(code, "balance"));
      const reportList = d?.data?.report_list;
      if (!reportList) return { data: null, error: "No report_list in response", source: "sina" };

      // Get latest report period
      const periods = Object.keys(reportList).sort().reverse();
      if (!periods.length) return { data: null, error: "No report periods", source: "sina" };
      const latest = reportList[periods[0]];
      const items = latest?.data ?? [];

      const getVal = (title: string) => {
        const item = items.find((i: any) => i.item_title?.includes(title));
        return item ? parseFloat(item.item_value) || 0 : 0;
      };

      return {
        data: {
          reportDate: periods[0],
          totalAssets: getVal("资产总计"),
          totalLiabilities: getVal("负债合计"),
          equity: getVal("股东权益"),
          currentAssets: getVal("流动资产合计"),
          currentLiabilities: getVal("流动负债合计"),
          cash: getVal("货币资金"),
          receivables: getVal("应收账款"),
          inventory: getVal("存货"),
          fixedAssets: getVal("固定资产"),
          goodwill: getVal("商誉"),
        },
        source: "sina",
      };
    } catch (err) {
      return { data: null, error: String(err), source: "sina" };
    }
  }

  async getIncomeStatement(code: string): Promise<DataResult<IncomeStatement | null>> {
    try {
      const d = await this._getJsonp(this._reportUrl(code, "profit"));
      const reportList = d?.data?.report_list;
      if (!reportList) return { data: null, error: "No report_list", source: "sina" };

      const periods = Object.keys(reportList).sort().reverse();
      if (!periods.length) return { data: null, error: "No periods", source: "sina" };
      const latest = reportList[periods[0]];
      const items = latest?.data ?? [];
      const prev = reportList[periods[1]]?.data ?? [];

      const getVal = (title: string) => {
        const item = items.find((i: any) => i.item_title?.includes(title));
        return item ? parseFloat(item.item_value) || 0 : 0;
      };
      const prevVal = (title: string) => {
        const item = prev.find((i: any) => i.item_title?.includes(title));
        return item ? parseFloat(item.item_value) || 0 : 0;
      };

      const revenue = getVal("营业收入");
      const netProfit = getVal("净利润");
      const prevRevenue = prevVal("营业收入");
      const prevProfit = prevVal("净利润");
      const grossProfit = getVal("毛利");
      const operatingProfit = getVal("营业利润");
      const totalEquity = getVal("股东权益");

      return {
        data: {
          reportDate: periods[0],
          revenue,
          revenueGrowth: prevRevenue ? (revenue - prevRevenue) / Math.abs(prevRevenue) : 0,
          netProfit,
          netProfitGrowth: prevProfit ? (netProfit - prevProfit) / Math.abs(prevProfit) : 0,
          operatingProfit,
          grossMargin: revenue ? grossProfit / revenue : 0,
          netMargin: revenue ? netProfit / revenue : 0,
          roe: totalEquity ? netProfit / totalEquity : 0,
          eps: getVal("每股收益"),
        },
        source: "sina",
      };
    } catch (err) {
      return { data: null, error: String(err), source: "sina" };
    }
  }

  async getCashFlow(code: string): Promise<DataResult<CashFlowStatement | null>> {
    try {
      const d = await this._getJsonp(this._reportUrl(code, "cashflow"));
      const reportList = d?.data?.report_list;
      if (!reportList) return { data: null, error: "No report_list", source: "sina" };

      const periods = Object.keys(reportList).sort().reverse();
      if (!periods.length) return { data: null, error: "No periods", source: "sina" };
      const latest = reportList[periods[0]];
      const items = latest?.data ?? [];

      const getVal = (title: string) => {
        const item = items.find((i: any) => i.item_title?.includes(title));
        return item ? parseFloat(item.item_value) || 0 : 0;
      };

      const operatingCF = getVal("经营活动产生的现金流量净额");
      const investingCF = getVal("投资活动产生的现金流量净额");
      const financingCF = getVal("筹资活动产生的现金流量净额");
      const capex = getVal("购建固定资产");

      return {
        data: {
          reportDate: periods[0],
          operatingCF,
          investingCF,
          financingCF,
          netCF: operatingCF + investingCF + financingCF,
          freeCashFlow: operatingCF - Math.abs(capex),
        },
        source: "sina",
      };
    } catch (err) {
      return { data: null, error: String(err), source: "sina" };
    }
  }
}
```

- [ ] **Step 2: Run type check**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add lib/data-sdk/providers/sina.ts
git commit -m "feat(data-sdk): add Sina provider — balance sheet, income statement, cash flow"
```

---

### Task 7: Cninfo provider (`lib/data-sdk/providers/cninfo.ts`)

**Files:**
- Create: `lib/data-sdk/providers/cninfo.ts`

**Produces:**
- `class CninfoProvider` with `search(keyword, code?, startDate?, endDate?)`, `download(url)`

- [ ] **Step 1: Create `lib/data-sdk/providers/cninfo.ts`**

```typescript
// lib/data-sdk/providers/cninfo.ts
// 巨潮资讯 (webapi.cninfo.com.cn) — official announcements.
// Priority 2 data source — low risk, no rate limit needed.

import type { DataResult, Announcement } from "../types.js";
import { normalizeCode, fetchWithTimeout } from "../utils.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const BASE_URL = "https://webapi.cninfo.com.cn/api/sysapi/p_sysapi1000";

/** Module-level cache for orgId lookup (loaded once). */
let _orgIdMap: Record<string, string> | null = null;

export class CninfoProvider {
  private timeout: number;

  constructor(timeout: number = 15_000) {
    this.timeout = timeout;
  }

  /**
   * Search announcements by keyword and optional stock code.
   * orgId is auto-resolved from a cached mapping table.
   */
  async search(
    keyword: string,
    code?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<DataResult<Announcement[]>> {
    try {
      let orgId = "";
      if (code) {
        orgId = await this._getOrgId(normalizeCode(code));
      }

      const params = new URLSearchParams();
      params.set("keyword", keyword);
      params.set("pageNum", "1");
      params.set("pageSize", "30");
      params.set("sortName", "pubdate");
      params.set("sortType", "desc");
      if (orgId) params.set("orgId", orgId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const url = `${BASE_URL}?${params}`;
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, this.timeout);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: "cninfo" };

      const d = await res.json();
      const records = d?.records ?? d?.data ?? [];
      const items: Announcement[] = (Array.isArray(records) ? records : []).map((r: any) => ({
        id: r.announcementId ?? r.id ?? "",
        title: r.announcementTitle ?? r.title ?? "",
        publishDate: r.publishDate ?? r.announcementTime ?? "",
        stockCode: r.secCode ?? code ?? "",
        stockName: r.secName ?? "",
        category: r.announcementType ?? "",
        summary: r.summary ?? "",
        pdfUrl: r.adjunctUrl ?? undefined,
      }));
      return { data: items, source: "cninfo" };
    } catch (err) {
      return { data: null, error: String(err), source: "cninfo" };
    }
  }

  /** Download announcement PDF or text. */
  async download(url: string): Promise<DataResult<ArrayBuffer>> {
    try {
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, this.timeout);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: "cninfo" };
      return { data: await res.arrayBuffer(), source: "cninfo" };
    } catch (err) {
      return { data: null, error: String(err), source: "cninfo" };
    }
  }

  /** Resolve orgId from code. Falls back to "gssz{code}" / "gssh{code}" convention. */
  private async _getOrgId(code: string): Promise<string> {
    if (!_orgIdMap) {
      try {
        const res = await fetchWithTimeout(
          "https://webapi.cninfo.com.cn/api/sysapi/p_sysapi1000?type=orgId",
          { headers: { "User-Agent": UA } },
          this.timeout,
        );
        if (res.ok) _orgIdMap = await res.json();
      } catch { /* fall through */ }
    }

    if (_orgIdMap && _orgIdMap[code]) return _orgIdMap[code];

    // Fallback: hardcoded convention
    return code.startsWith("6") || code.startsWith("9") ? `gssh${code}` : `gssz${code}`;
  }
}
```

- [ ] **Step 2: Run type check**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add lib/data-sdk/providers/cninfo.ts
git commit -m "feat(data-sdk): add Cninfo provider — announcement search and download"
```

---

### Task 8: THS provider (`lib/data-sdk/providers/ths.ts`)

**Files:**
- Create: `lib/data-sdk/providers/ths.ts`

**Produces:**
- `class THSProvider` with `getHotStocks()`, `getNorthBound()`, `getConsensusEPS(code)`

- [ ] **Step 1: Create `lib/data-sdk/providers/ths.ts`**

```typescript
// lib/data-sdk/providers/ths.ts
// 同花顺 (10jqka.com.cn) — hot stocks, north-bound capital, consensus EPS.
// Priority 2 data source — low risk, no rate limit needed.

import type { DataResult, HotStock, NorthBoundFlow, ConsensusEPS } from "../types.js";
import { normalizeCode, fetchWithTimeout } from "../utils.js";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const THS_BASE = "https://basic.10jqka.com.cn";

export class THSProvider {
  private timeout: number;

  constructor(timeout: number = 15_000) {
    this.timeout = timeout;
  }

  /** Get today's hot stocks with theme attribution. */
  async getHotStocks(): Promise<DataResult<HotStock[]>> {
    const url = `${THS_BASE}/api/stockph/hotstock/rank`;
    try {
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, this.timeout);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: "ths" };

      const d = await res.json();
      const list = d?.data ?? d?.result ?? [];
      const items: HotStock[] = (Array.isArray(list) ? list : []).map((s: any) => ({
        symbol: normalizeCode(s.code ?? s.stockCode ?? ""),
        name: s.name ?? s.stockName ?? "",
        reason: s.reason ?? s.theme ?? "",
        changePct: s.changePct ?? s.rise ?? 0,
        limitUpTimes: s.limitUpTimes ?? s.boardNum ?? 0,
      }));
      return { data: items, source: "ths" };
    } catch (err) {
      return { data: null, error: String(err), source: "ths" };
    }
  }

  /** Get north-bound capital flow (minute-level). */
  async getNorthBound(): Promise<DataResult<NorthBoundFlow[]>> {
    const url = `${THS_BASE}/api/stockph/northbound/flow`;
    try {
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, this.timeout);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: "ths" };

      const d = await res.json();
      const list = d?.data ?? d?.result ?? [];
      const items: NorthBoundFlow[] = (Array.isArray(list) ? list : []).map((f: any) => ({
        time: f.time ?? f.minute ?? "",
        hgtBuy: f.hgtBuy ?? f.shBuy ?? 0,
        hgtSell: f.hgtSell ?? f.shSell ?? 0,
        sgtBuy: f.sgtBuy ?? f.szBuy ?? 0,
        sgtSell: f.sgtSell ?? f.szSell ?? 0,
        netFlow: (f.hgtBuy ?? 0) - (f.hgtSell ?? 0) + (f.sgtBuy ?? 0) - (f.sgtSell ?? 0),
      }));
      return { data: items, source: "ths" };
    } catch (err) {
      return { data: null, error: String(err), source: "ths" };
    }
  }

  /** Get consensus EPS estimates for a stock. */
  async getConsensusEPS(code: string): Promise<DataResult<ConsensusEPS | null>> {
    const c = normalizeCode(code);
    const url = `${THS_BASE}/api/stockph/consensus/eps/${c}`;
    try {
      const res = await fetchWithTimeout(url, { headers: { "User-Agent": UA } }, this.timeout);
      if (!res.ok) return { data: null, error: `HTTP ${res.status}`, source: "ths" };

      const d = await res.json();
      const data = d?.data ?? d?.result ?? {};
      if (!data || Object.keys(data).length === 0) return { data: null, error: "No consensus data", source: "ths" };

      return {
        data: {
          stockCode: c,
          stockName: data.stockName ?? data.name ?? "",
          eps2025: data.eps2025 ?? data.eps0 ?? 0,
          eps2026: data.eps2026 ?? data.eps1 ?? 0,
          eps2027: data.eps2027 ?? data.eps2 ?? 0,
          analystCount: data.analystCount ?? data.count ?? 0,
          targetPrice: data.targetPrice ?? data.target ?? 0,
        },
        source: "ths",
      };
    } catch (err) {
      return { data: null, error: String(err), source: "ths" };
    }
  }
}
```

- [ ] **Step 2: Run type check**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add lib/data-sdk/providers/ths.ts
git commit -m "feat(data-sdk): add THS provider — hot stocks, north bound, consensus EPS"
```

---

### Task 9: AStockClient composition (`lib/data-sdk/client.ts`)

**Files:**
- Create: `lib/data-sdk/client.ts`

**Interfaces:**
- Consumes: all 5 providers, `DataResult<T>`, all types
- Produces: `class AStockClient` with 7-layer API surface:
  - `client.market` — quote, kline, indexQuote, etfQuote
  - `client.research` — individualReports, industryReports, downloadPdf
  - `client.signal` — hotStocks, northBound, conceptBlocks, fundFlowMinute, dragonTigerBoard, allDragonTigerBoard, lockupExpiration, sectorRanking
  - `client.capital` — marginTrading, blockTrades, shareholders, dividends, fundFlow120
  - `client.news` — stockNews, globalNews
  - `client.fundamentals` — stockInfo, balanceSheet, incomeStatement, cashFlow, indicators
  - `client.announcements` — search, download

- [ ] **Step 1: Create `lib/data-sdk/client.ts`**

```typescript
// lib/data-sdk/client.ts
// AStockClient — composes all providers, orchestrates fallback chains.
// Public API organized by 7 data layers (matching the a-stock-data SKILL.md).

import type { DataResult, KlineBar, KlineOptions, Quote, IndexQuote, ETFQuote,
  ResearchReport, IndustryReport, ResearchPDF, HotStock, NorthBoundFlow,
  ConceptBlock, FundFlowMinute, DragonTigerEntry, AllDragonTigerEntry,
  LockupEntry, SectorInfo, SectorConstituent, MarginTradingEntry,
  BlockTradeEntry, ShareholderEntry, DividendEntry, FundFlowDay,
  StockNewsItem, GlobalNewsItem, StockInfo, BalanceSheet, IncomeStatement,
  CashFlowStatement, Announcement, ConsensusEPS, SearchResult, AStockClientOptions } from "./types.js";
import { calcMACD, calcRSI, calcMA, calcBollinger } from "./indicators.js";
import { TencentProvider } from "./providers/tencent.js";
import { EastmoneyProvider } from "./providers/eastmoney.js";
import { SinaProvider } from "./providers/sina.js";
import { CninfoProvider } from "./providers/cninfo.js";
import { THSProvider } from "./providers/ths.js";

export class AStockClient {
  // Providers
  private tencent: TencentProvider;
  private eastmoney: EastmoneyProvider;
  private sina: SinaProvider;
  private cninfo: CninfoProvider;
  private ths: THSProvider;

  // ─── Public 7-layer API ───

  readonly market: MarketLayer;
  readonly research: ResearchLayer;
  readonly signal: SignalLayer;
  readonly capital: CapitalLayer;
  readonly news: NewsLayer;
  readonly fundamentals: FundamentalsLayer;
  readonly announcements: AnnouncementsLayer;

  constructor(opts: AStockClientOptions = {}) {
    const timeout = opts.timeout ?? 15_000;
    const emInterval = opts.eastmoneyInterval ?? 1000;
    const emJitter = opts.eastmoneyJitter ?? 500;

    this.tencent = new TencentProvider(timeout);
    this.eastmoney = new EastmoneyProvider(timeout, emInterval, emJitter);
    this.sina = new SinaProvider(timeout);
    this.cninfo = new CninfoProvider(timeout);
    this.ths = new THSProvider(timeout);

    this.market = new MarketLayer(this.tencent, this.eastmoney);
    this.research = new ResearchLayer(this.eastmoney, this.ths);
    this.signal = new SignalLayer(this.ths, this.eastmoney);
    this.capital = new CapitalLayer(this.eastmoney);
    this.news = new NewsLayer(this.eastmoney);
    this.fundamentals = new FundamentalsLayer(this.eastmoney, this.sina);
    this.announcements = new AnnouncementsLayer(this.cninfo);
  }
}

// ─── Layer classes ───

class MarketLayer {
  constructor(private tencent: TencentProvider, private eastmoney: EastmoneyProvider) {}

  /** Get real-time quotes with PE/PB/market cap. Tencent (priority 1) → Eastmoney push2 fallback. */
  async quote(codes: string[]): Promise<DataResult<Record<string, Quote>>> {
    const r = await this.tencent.getQuotes(codes);
    if (r.data && Object.keys(r.data).length > 0) return r;
    // Fallback is limited — eastmoney push2 doesn't provide batch quotes the same way
    return r;
  }

  /** Get K-line data with pre-computed MA. Source: Baidu (HTTP, no IP block). */
  async kline(code: string, opts?: KlineOptions): Promise<DataResult<KlineBar[]>> {
    return this.tencent.getKline(code, opts);
  }

  /** Get index quotes (000001, 000300, 399006, etc.) */
  async indexQuote(codes: string[]): Promise<DataResult<IndexQuote[]>> {
    return this.tencent.getIndexQuotes(codes);
  }

  /** Get ETF quotes (510050, 510300, etc.) */
  async etfQuote(codes: string[]): Promise<DataResult<ETFQuote[]>> {
    return this.tencent.getETFQuotes(codes);
  }

  /** Search stocks/indices/ETFs by keyword. */
  async search(keyword: string): Promise<DataResult<SearchResult[]>> {
    return this.tencent.search(keyword);
  }
}

class ResearchLayer {
  constructor(private eastmoney: EastmoneyProvider, private ths: THSProvider) {}

  async individualReports(code: string, page?: number): Promise<DataResult<ResearchReport[]>> {
    return this.eastmoney.individualReports(code, page);
  }

  async industryReports(industryCode?: string, page?: number): Promise<DataResult<IndustryReport[]>> {
    return this.eastmoney.industryReports(industryCode, page);
  }

  async downloadPdf(url: string): Promise<DataResult<ResearchPDF>> {
    return this.eastmoney.downloadPdf(url);
  }

  async consensusEPS(code: string): Promise<DataResult<ConsensusEPS | null>> {
    return this.ths.getConsensusEPS(code);
  }
}

class SignalLayer {
  constructor(private ths: THSProvider, private eastmoney: EastmoneyProvider) {}

  async hotStocks(): Promise<DataResult<HotStock[]>> {
    return this.ths.getHotStocks();
  }

  async northBound(): Promise<DataResult<NorthBoundFlow[]>> {
    return this.ths.getNorthBound();
  }

  async conceptBlocks(code: string): Promise<DataResult<ConceptBlock[]>> {
    return this.eastmoney.getConceptBlocks(code);
  }

  async fundFlowMinute(code: string): Promise<DataResult<FundFlowMinute[]>> {
    return this.eastmoney.getFundFlowMinute(code);
  }

  async dragonTigerBoard(code?: string, date?: string): Promise<DataResult<DragonTigerEntry[]>> {
    return this.eastmoney.dragonTigerBoard(code, date);
  }

  async allDragonTigerBoard(date?: string): Promise<DataResult<AllDragonTigerEntry[]>> {
    return this.eastmoney.allDragonTigerBoard(date);
  }

  async lockupExpiration(startDate?: string, endDate?: string): Promise<DataResult<LockupEntry[]>> {
    return this.eastmoney.lockupExpiration(startDate, endDate);
  }

  async sectorRanking(): Promise<DataResult<SectorInfo[]>> {
    return this.eastmoney.getSectorList();
  }
}

class CapitalLayer {
  constructor(private eastmoney: EastmoneyProvider) {}

  async marginTrading(code: string, startDate?: string, endDate?: string): Promise<DataResult<MarginTradingEntry[]>> {
    return this.eastmoney.marginTrading(code, startDate, endDate);
  }

  async blockTrades(code: string, startDate?: string, endDate?: string): Promise<DataResult<BlockTradeEntry[]>> {
    return this.eastmoney.blockTrades(code, startDate, endDate);
  }

  async shareholders(code: string): Promise<DataResult<ShareholderEntry[]>> {
    return this.eastmoney.shareholders(code);
  }

  async dividends(code: string): Promise<DataResult<DividendEntry[]>> {
    return this.eastmoney.dividends(code);
  }

  async fundFlow120(code: string): Promise<DataResult<FundFlowDay[]>> {
    return this.eastmoney.getFundFlow120(code);
  }
}

class NewsLayer {
  constructor(private eastmoney: EastmoneyProvider) {}

  async stockNews(code: string, page?: number): Promise<DataResult<StockNewsItem[]>> {
    return this.eastmoney.stockNews(code, page);
  }

  async globalNews(page?: number): Promise<DataResult<GlobalNewsItem[]>> {
    return this.eastmoney.globalNews(page);
  }
}

class FundamentalsLayer {
  constructor(private eastmoney: EastmoneyProvider, private sina: SinaProvider) {}

  async stockInfo(code: string): Promise<DataResult<StockInfo | null>> {
    return this.eastmoney.getStockInfo(code);
  }

  /** Balance sheet — Sina (priority 2) first, then eastmoney fallback. */
  async balanceSheet(code: string): Promise<DataResult<BalanceSheet | null>> {
    const r = await this.sina.getBalanceSheet(code);
    if (r.data) return r;
    // Eastmoney may have balance sheet data — but Sina is better structured
    return r;
  }

  /** Income statement — Sina (priority 2) first. */
  async incomeStatement(code: string): Promise<DataResult<IncomeStatement | null>> {
    return this.sina.getIncomeStatement(code);
  }

  /** Cash flow statement — Sina (priority 2) first. */
  async cashFlow(code: string): Promise<DataResult<CashFlowStatement | null>> {
    return this.sina.getCashFlow(code);
  }

  /** Compute technical indicators from close prices (local, zero network). */
  async indicators(
    closes: number[],
  ): Promise<{ macd: ReturnType<typeof calcMACD>; rsi: ReturnType<typeof calcRSI>; ma: ReturnType<typeof calcMA>; boll: ReturnType<typeof calcBollinger> }> {
    return {
      macd: calcMACD(closes),
      rsi: calcRSI(closes),
      ma: calcMA(closes),
      boll: calcBollinger(closes),
    };
  }
}

class AnnouncementsLayer {
  constructor(private cninfo: CninfoProvider) {}

  async search(keyword: string, code?: string, startDate?: string, endDate?: string): Promise<DataResult<Announcement[]>> {
    return this.cninfo.search(keyword, code, startDate, endDate);
  }

  async download(url: string): Promise<DataResult<ArrayBuffer>> {
    return this.cninfo.download(url);
  }
}
```

- [ ] **Step 2: Run type check**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add lib/data-sdk/client.ts
git commit -m "feat(data-sdk): add AStockClient — 7-layer API composing all providers with fallback chains"
```

---

### Task 10: Barrel export (`lib/data-sdk/index.ts`)

**Files:**
- Create: `lib/data-sdk/index.ts`

- [ ] **Step 1: Create `lib/data-sdk/index.ts`**

```typescript
// lib/data-sdk/index.ts — Barrel exports

export { AStockClient } from "./client.js";
export { TencentProvider } from "./providers/tencent.js";
export { EastmoneyProvider } from "./providers/eastmoney.js";
export { SinaProvider } from "./providers/sina.js";
export { CninfoProvider } from "./providers/cninfo.js";
export { THSProvider } from "./providers/ths.js";

export { calcMACD, calcRSI, calcMA, calcBollinger } from "./indicators.js";
export type { MACDItem, BollingerItem } from "./indicators.js";

export { normalizeCode, getPrefix, toSecId, toTencentCode, decodeGBK, RateLimiter, fetchWithTimeout } from "./utils.js";

export type {
  DataResult, KlineBar, KlineOptions, Quote, IndexQuote, ETFQuote,
  ResearchReport, IndustryReport, ResearchPDF,
  HotStock, NorthBoundFlow, ConceptBlock, FundFlowMinute,
  DragonTigerEntry, AllDragonTigerEntry, LockupEntry, SectorInfo, SectorConstituent,
  MarginTradingEntry, BlockTradeEntry, ShareholderEntry, DividendEntry, FundFlowDay,
  StockNewsItem, GlobalNewsItem,
  StockInfo, BalanceSheet, IncomeStatement, CashFlowStatement,
  Announcement, ConsensusEPS, SearchResult, AStockClientOptions,
} from "./types.js";
```

- [ ] **Step 2: Run type check**

```bash
pnpm lint
```

- [ ] **Step 3: Commit**

```bash
git add lib/data-sdk/index.ts
git commit -m "feat(data-sdk): add barrel exports"
```

---

### Task 11: Update tool context and tool implementations

**Files:**
- Modify: `lib/tools/types.ts` — change `DataClient` import to `AStockClient`
- Modify: `lib/tools/kline.ts` — adapt to new `client.market.kline()` API
- Modify: `lib/tools/indicator.ts` — adapt to new `client.fundamentals.indicators()` API
- Modify: `lib/tools/index.ts` — replace 10 stubs with real implementations, add new tools

- [ ] **Step 1: Update `lib/tools/types.ts`**

Change the import and type:

```typescript
// lib/tools/types.ts
import type { AnalysisTarget, ExecutionContext } from "../engine/types.js";
import type { AStockClient } from "../data-sdk/client.js";

export interface PropertySchema {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: PropertySchema;
  default?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, PropertySchema>;
    required: string[];
  };
  execute(params: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

export interface ToolContext {
  dataClient: AStockClient;
  target: AnalysisTarget;
  executionState: ExecutionContext;
  signal: AbortSignal;
}
```

- [ ] **Step 2: Update `lib/tools/kline.ts`**

```typescript
// lib/tools/kline.ts
import type { ToolDefinition, ToolContext } from "./types.js";

export const klineTool: ToolDefinition = {
  name: "get-kline",
  description: "获取股票K线数据，返回开盘价、收盘价、最高价、最低价、成交量。适用于分析趋势、形态和支撑阻力位。",
  parameters: {
    type: "object",
    properties: {
      count: { type: "number", description: "返回的K线条数，默认120条（约半年交易日）", default: 120 },
      period: { type: "string", description: "K线周期", enum: ["daily", "weekly", "monthly"], default: "daily" },
    },
    required: [],
  },
  async execute(params, ctx) {
    const count = (params.count as number) ?? 120;
    const period = ((params.period as string) ?? "daily") as "daily" | "weekly" | "monthly";

    const res = await ctx.dataClient.market.kline(ctx.target.code, { period, count });

    if (!res.data || res.data.length === 0) {
      return JSON.stringify({ error: res.error ?? "No K-line data", source: res.source });
    }

    const bars = res.data;
    const recent = bars.slice(-20);
    const latest = bars.length > 0 ? bars[bars.length - 1] : null;

    return JSON.stringify({
      symbol: ctx.target.code,
      totalBars: bars.length,
      source: res.source,
      recent20Bars: recent.map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })),
      latest: latest ? { date: latest.date, close: latest.close, volume: latest.volume } : null,
    });
  },
};
```

- [ ] **Step 3: Update `lib/tools/indicator.ts`**

```typescript
// lib/tools/indicator.ts
import type { ToolDefinition, ToolContext } from "./types.js";

export const macdTool: ToolDefinition = {
  name: "calc-macd",
  description: "计算MACD指标，返回DIF、DEA和柱状值。用于判断趋势方向、金叉死叉信号和背离。",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const kline = await ctx.dataClient.market.kline(ctx.target.code, { count: 120 });
    if (!kline.data) {
      return JSON.stringify({ error: kline.error ?? "No data for MACD", source: kline.source });
    }

    const closes = kline.data.map((b) => b.close);
    const ind = await ctx.dataClient.fundamentals.indicators(closes);
    const macdData = ind.macd.slice(-50);
    const latest = macdData.length > 0 ? macdData[macdData.length - 1] : null;
    const prev = macdData.length > 1 ? macdData[macdData.length - 2] : null;

    let signal = "neutral";
    if (latest && prev && latest.dif != null && latest.dea != null && prev.dif != null && prev.dea != null) {
      if (prev.dif <= prev.dea && latest.dif > latest.dea) signal = "golden_cross";
      else if (prev.dif >= prev.dea && latest.dif < latest.dea) signal = "death_cross";
    }

    return JSON.stringify({
      symbol: ctx.target.code,
      signal,
      latest: latest ? { dif: latest.dif, dea: latest.dea, histogram: latest.histogram } : null,
      recent50: macdData.map((item) => ({ dif: item.dif, dea: item.dea, histogram: item.histogram })),
    });
  },
};

export const rsiTool: ToolDefinition = {
  name: "calc-rsi",
  description: "计算RSI相对强弱指标(14日)。RSI>70为超买，RSI<30为超卖。",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const kline = await ctx.dataClient.market.kline(ctx.target.code, { count: 120 });
    if (!kline.data) {
      return JSON.stringify({ error: kline.error ?? "No data for RSI", source: kline.source });
    }

    const closes = kline.data.map((b) => b.close);
    const ind = await ctx.dataClient.fundamentals.indicators(closes);
    const rsiValues = (ind.rsi as (number | null)[]).filter((v): v is number => v != null);
    const latest = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;

    let zone = "neutral";
    if (latest != null) {
      if (latest > 70) zone = "overbought";
      else if (latest < 30) zone = "oversold";
    }

    return JSON.stringify({ symbol: ctx.target.code, latest, zone, recent20: rsiValues.slice(-20) });
  },
};

export const maTool: ToolDefinition = {
  name: "calc-ma",
  description: "计算移动平均线(MA5/10/20/60)。用于判断趋势方向和均线排列。",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const kline = await ctx.dataClient.market.kline(ctx.target.code, { count: 120 });
    if (!kline.data) {
      return JSON.stringify({ error: kline.error ?? "No data for MA", source: kline.source });
    }

    const closes = kline.data.map((b) => b.close);
    const ind = await ctx.dataClient.fundamentals.indicators(closes);
    const maData = ind.ma as Record<string, (number | null)[]>;

    const normalized: Record<string, number | null> = {};
    for (const [key, values] of Object.entries(maData)) {
      const arr = values.filter((v): v is number => v != null);
      normalized[key] = arr.length > 0 ? arr[arr.length - 1] : null;
    }

    const periods = ["5", "10", "20", "60"];
    const alignmentValues = periods.map((p) => normalized[p]).filter((v): v is number => v != null);
    let alignment = "unknown";
    if (alignmentValues.length >= 3) {
      const bullish = alignmentValues.every((v, i) => i === 0 || v < alignmentValues[i - 1]);
      const bearish = alignmentValues.every((v, i) => i === 0 || v > alignmentValues[i - 1]);
      if (bullish) alignment = "bullish_alignment";
      else if (bearish) alignment = "bearish_alignment";
    }

    return JSON.stringify({ symbol: ctx.target.code, latest: normalized, alignment });
  },
};
```

- [ ] **Step 4: Rewrite `lib/tools/index.ts` — replace stubs**

Replace the entire file. Keep kline, macd, rsi, ma exports. Convert all stubs to real implementations:

```typescript
// lib/tools/index.ts
import { klineTool } from "./kline.js";
import { macdTool, rsiTool, maTool } from "./indicator.js";
import type { ToolDefinition } from "./types.js";

export { klineTool } from "./kline.js";
export { macdTool, rsiTool, maTool } from "./indicator.js";
export type { ToolDefinition, ToolContext, PropertySchema } from "./types.js";

// ─── Real tool implementations using AStockClient ───

const fundFlowTool: ToolDefinition = {
  name: "get-fund-flow",
  description: "获取个股资金流向数据（主力/超大单/大单/中单/小单净流入流出，分钟级）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.signal.fundFlowMinute(ctx.target.code);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    const latest = res.data.slice(-10);
    return JSON.stringify({ symbol: ctx.target.code, source: res.source, recent10: latest });
  },
};

const newsTool: ToolDefinition = {
  name: "get-news",
  description: "获取个股相关新闻资讯（含情感标签）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.news.stockNews(ctx.target.code);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    return JSON.stringify({ symbol: ctx.target.code, count: res.data.length, source: res.source, news: res.data.slice(0, 10) });
  },
};

const announcementTool: ToolDefinition = {
  name: "get-announcement",
  description: "获取上市公司公告（支持关键词检索）",
  parameters: {
    type: "object",
    properties: { keyword: { type: "string", description: "搜索关键词，默认为空获取最近公告" } },
    required: [],
  },
  async execute(params, ctx) {
    const keyword = (params.keyword as string) ?? "";
    const res = await ctx.dataClient.announcements.search(keyword || "公告", ctx.target.code);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    return JSON.stringify({ symbol: ctx.target.code, count: res.data.length, source: res.source, announcements: res.data.slice(0, 10) });
  },
};

const financialDataTool: ToolDefinition = {
  name: "get-financial-data",
  description: "获取财务数据（营收/利润/资产负债/现金流等），默认返回最新一季利润表",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const income = await ctx.dataClient.fundamentals.incomeStatement(ctx.target.code);
    const balance = await ctx.dataClient.fundamentals.balanceSheet(ctx.target.code);
    return JSON.stringify({
      symbol: ctx.target.code,
      income: income.data,
      balance: balance.data ? {
        totalAssets: balance.data.totalAssets,
        totalLiabilities: balance.data.totalLiabilities,
        equity: balance.data.equity,
      } : null,
      source: `${income.source}, ${balance.source}`,
    });
  },
};

const blockTradeTool: ToolDefinition = {
  name: "get-block-trade",
  description: "获取大宗交易数据（折溢价/席位信息），默认最近60天",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.capital.blockTrades(ctx.target.code);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    return JSON.stringify({ symbol: ctx.target.code, count: res.data.length, source: res.source, recent: res.data.slice(0, 20) });
  },
};

const quoteTool: ToolDefinition = {
  name: "get-quote",
  description: "获取实时行情报价（最新价/涨跌幅/PE/PB/市值/换手率等）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.market.quote([ctx.target.code]);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    const q = res.data[ctx.target.code];
    if (!q) return JSON.stringify({ error: "No quote found", source: res.source });
    return JSON.stringify(q);
  },
};

// ─── New tools ───

const dragonTigerTool: ToolDefinition = {
  name: "get-dragon-tiger-board",
  description: "获取龙虎榜数据（上榜股票+席位明细+净买额排名）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.signal.dragonTigerBoard(ctx.target.code);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    return JSON.stringify({ symbol: ctx.target.code, count: res.data.length, source: res.source, entries: res.data.slice(0, 10) });
  },
};

const marginTradingTool: ToolDefinition = {
  name: "get-margin-trading",
  description: "获取融资融券数据（融资余额/买入/偿还/融券余额）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.capital.marginTrading(ctx.target.code);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    return JSON.stringify({ symbol: ctx.target.code, count: res.data.length, source: res.source, recent: res.data.slice(0, 20) });
  },
};

const conceptBlocksTool: ToolDefinition = {
  name: "get-concept-blocks",
  description: "获取个股所属概念/行业/地域板块归属",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.signal.conceptBlocks(ctx.target.code);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    return JSON.stringify({ symbol: ctx.target.code, count: res.data.length, source: res.source, blocks: res.data });
  },
};

const shareholdersTool: ToolDefinition = {
  name: "get-shareholders",
  description: "获取股东户数变化（筹码集中度分析）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.capital.shareholders(ctx.target.code);
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    return JSON.stringify({ symbol: ctx.target.code, count: res.data.length, source: res.source, history: res.data });
  },
};

const hotStocksTool: ToolDefinition = {
  name: "get-hot-stocks",
  description: "获取当日强势股榜单及题材归因",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.signal.hotStocks();
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    return JSON.stringify({ count: res.data.length, source: res.source, hotStocks: res.data.slice(0, 30) });
  },
};

const northBoundTool: ToolDefinition = {
  name: "get-north-bound",
  description: "获取北向资金动向（沪股通/深股通分钟级资金流向）",
  parameters: { type: "object", properties: {}, required: [] },
  async execute(_params, ctx) {
    const res = await ctx.dataClient.signal.northBound();
    if (!res.data) return JSON.stringify({ error: res.error, source: res.source });
    const latest = res.data.slice(-20);
    const totalNet = latest.reduce((s, f) => s + f.netFlow, 0);
    return JSON.stringify({ source: res.source, recent20: latest, totalNetFlowWan: totalNet });
  },
};

/** Lookup map: YAML tool name → ToolDefinition. */
export const toolsByName = new Map<string, ToolDefinition>([
  ["kline", klineTool],
  ["macd", macdTool],
  ["rsi", rsiTool],
  ["ma", maTool],
  ["fund_flow", fundFlowTool],
  ["news", newsTool],
  ["announcement", announcementTool],
  ["financial_data", financialDataTool],
  ["block_trade", blockTradeTool],
  ["quote", quoteTool],
  ["dragon_tiger", dragonTigerTool],
  ["margin_trading", marginTradingTool],
  ["concept_blocks", conceptBlocksTool],
  ["shareholders", shareholdersTool],
  ["hot_stocks", hotStocksTool],
  ["north_bound", northBoundTool],
]);
```

- [ ] **Step 5: Run type check**

```bash
pnpm lint
```

- [ ] **Step 6: Commit**

```bash
git add lib/tools/types.ts lib/tools/kline.ts lib/tools/indicator.ts lib/tools/index.ts
git commit -m "feat: migrate tools to AStockClient, un-stub 6 tools, add 6 new tools"
```

---

### Task 12: Write unit tests

**Files:**
- Create: `lib/data-sdk/__tests__/utils.test.ts`
- Create: `lib/data-sdk/__tests__/tencent.test.ts`
- Create: `lib/data-sdk/__tests__/eastmoney.test.ts`
- Create: `lib/data-sdk/__tests__/client.test.ts`
- Create: `lib/data-sdk/__tests__/indicators.test.ts` (copy from old)

- [ ] **Step 1: Create `utils.test.ts`**

```typescript
// lib/data-sdk/__tests__/utils.test.ts
import { describe, it, expect } from "vitest";
import { normalizeCode, getPrefix, toSecId, toTencentCode } from "../utils.js";

describe("normalizeCode", () => {
  it("passes through 6-digit code", () => {
    expect(normalizeCode("600519")).toBe("600519");
    expect(normalizeCode("000001")).toBe("000001");
    expect(normalizeCode("832000")).toBe("832000");
  });

  it("strips SH/SZ/BJ prefix", () => {
    expect(normalizeCode("SH600519")).toBe("600519");
    expect(normalizeCode("SZ000001")).toBe("000001");
    expect(normalizeCode("BJ832000")).toBe("832000");
    expect(normalizeCode("sh688017")).toBe("688017");
  });

  it("strips .SH/.SZ suffix", () => {
    expect(normalizeCode("600519.SH")).toBe("600519");
    expect(normalizeCode("000001.SZ")).toBe("000001");
    expect(normalizeCode("688017.sh")).toBe("688017");
  });

  it("throws on invalid code", () => {
    expect(() => normalizeCode("12345")).toThrow("Invalid stock code");
    expect(() => normalizeCode("abcdef")).toThrow("Invalid stock code");
  });
});

describe("getPrefix", () => {
  it("returns sh for 6/9 prefix", () => {
    expect(getPrefix("600519")).toBe("sh");
    expect(getPrefix("900001")).toBe("sh");
    expect(getPrefix("688017")).toBe("sh");
  });

  it("returns bj for 8 prefix", () => {
    expect(getPrefix("832000")).toBe("bj");
  });

  it("returns sz for others", () => {
    expect(getPrefix("000001")).toBe("sz");
    expect(getPrefix("300476")).toBe("sz");
  });
});

describe("toSecId", () => {
  it("returns eastmoney secid format", () => {
    expect(toSecId("600519")).toBe("1.600519");
    expect(toSecId("000001")).toBe("0.000001");
  });
});

describe("toTencentCode", () => {
  it("returns tencent prefixed format", () => {
    expect(toTencentCode("600519")).toBe("sh600519");
    expect(toTencentCode("000001")).toBe("sz000001");
  });
});
```

- [ ] **Step 2: Run utils tests**

```bash
pnpm vitest run lib/data-sdk/__tests__/utils.test.ts
```

- [ ] **Step 3: Copy indicators test from old module**

```bash
cp lib/data/__tests__/indicators.test.ts lib/data-sdk/__tests__/indicators.test.ts
```

The import path `../indicators.js` is the same in both locations — no changes needed.

- [ ] **Step 4: Create `tencent.test.ts`**

```typescript
// lib/data-sdk/__tests__/tencent.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TencentProvider } from "../providers/tencent.js";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("TencentProvider", () => {
  let provider: TencentProvider;

  beforeEach(() => {
    provider = new TencentProvider(5000);
  });

  it("parses GBK quote response correctly", async () => {
    const fixturePath = path.join(__dirname, "fixtures", "tencent-quote.txt");
    if (!fs.existsSync(fixturePath)) {
      console.warn("Fixture not found — skipping parse test");
      return;
    }
    const gbkBytes = fs.readFileSync(fixturePath);
    // Mock fetch to return fixture
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => gbkBytes.buffer,
    } as any);

    const r = await provider.getQuotes(["600519"]);
    expect(r.source).toBe("tencent");
    expect(r.data).not.toBeNull();
    const q = r.data!["600519"];
    expect(q).toBeDefined();
    expect(q.name).toBeTruthy();
    expect(typeof q.price).toBe("number");
    expect(typeof q.peTtm).toBe("number");
    expect(typeof q.pb).toBe("number");
  });

  it("returns error on fetch failure", async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error("Network error"));
    const r = await provider.getQuotes(["600519"]);
    expect(r.data).toBeNull();
    expect(r.error).toContain("Network error");
  });

  it("returns error on HTTP error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 } as any);
    const r = await provider.getQuotes(["600519"]);
    expect(r.data).toBeNull();
    expect(r.error).toContain("500");
  });

  it("search returns parsed results", async () => {
    const mockText = new TextEncoder().encode('v_hint="1^600519^贵州茅台^GP-A"');
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => mockText.buffer,
    } as any);

    const r = await provider.search("茅台");
    expect(r.source).toBe("tencent");
    expect(r.data).not.toBeNull();
    expect(r.data!.length).toBeGreaterThan(0);
    expect(r.data![0].symbol).toBe("600519");
    expect(r.data![0].name).toBe("贵州茅台");
  });
});
```

- [ ] **Step 5: Run all tests**

```bash
pnpm vitest run lib/data-sdk/__tests__/
```

- [ ] **Step 6: Commit**

```bash
git add lib/data-sdk/__tests__/
git commit -m "test(data-sdk): add unit tests for utils, indicators, tencent provider"
```

---

### Task 13: Delete old `lib/data/` module

**Files:**
- Delete: `lib/data/client.ts`
- Delete: `lib/data/types.ts`
- Delete: `lib/data/indicators.ts`
- Delete: `lib/data/__tests__/client.test.ts`
- Delete: `lib/data/__tests__/indicators.test.ts`
- Delete: `lib/data/__tests__/` directory

No other files in the project import from `lib/data/` (tools now import from `lib/data-sdk/`).

- [ ] **Step 1: Verify no remaining imports**

```bash
grep -r "lib/data" lib/ --include="*.ts" --include="*.tsx" || echo "No imports found — safe to delete"
```

- [ ] **Step 2: Delete the old module**

```bash
rm -rf lib/data/
```

- [ ] **Step 3: Run type check to confirm nothing is broken**

```bash
pnpm lint
```

- [ ] **Step 4: Commit**

```bash
git add -A lib/data/
git commit -m "chore: delete lib/data/ — replaced by lib/data-sdk/"
```

---

### Task 14: Smoke test with real APIs

- [ ] **Step 1: Create smoke test script**

Create `lib/data-sdk/__tests__/smoke.ts`:

```typescript
// lib/data-sdk/__tests__/smoke.ts
// Manual smoke test — run with: npx tsx lib/data-sdk/__tests__/smoke.ts
// Tests real APIs. Some may fail due to network/IP restrictions.

import { AStockClient } from "../client.js";

const client = new AStockClient({ timeout: 20_000 });

async function main() {
  console.log("=== A-Stock Data SDK Smoke Test ===\n");

  // 1. Tencent: Quote
  console.log("1. Tencent quote (600519 贵州茅台)...");
  const q = await client.market.quote(["600519"]);
  console.log(`   source=${q.source}, data=${q.data ? "OK" : "NULL"}, error=${q.error ?? "none"}`);
  if (q.data) {
    const m = q.data["600519"];
    console.log(`   ${m.name}: price=${m.price}, PE=${m.peTtm}, PB=${m.pb}, 市值=${m.marketCapYi}亿`);
  }

  // 2. Baidu: K-line
  console.log("\n2. Baidu K-line (600519 daily)...");
  const k = await client.market.kline("600519", { count: 5 });
  console.log(`   source=${k.source}, bars=${k.data?.length ?? 0}, error=${k.error ?? "none"}`);
  if (k.data) k.data.slice(-3).forEach((b: any) => console.log(`   ${b.date}: O=${b.open} C=${b.close} V=${b.volume}`));

  // 3. Tencent: Search
  console.log("\n3. Tencent search (平安)...");
  const s = await client.market.search("平安");
  console.log(`   source=${s.source}, results=${s.data?.length ?? 0}`);
  if (s.data) s.data.slice(0, 3).forEach((r: any) => console.log(`   ${r.symbol} ${r.name} ${r.type}`));

  // 4. Eastmoney: Stock info
  console.log("\n4. Eastmoney stock info (600519)...");
  await new Promise((r) => setTimeout(r, 1200)); // respect rate limiter
  const info = await client.fundamentals.stockInfo("600519");
  console.log(`   source=${info.source}, data=${info.data ? "OK" : "NULL"}, error=${info.error ?? "none"}`);
  if (info.data) console.log(`   ${info.data.name}: industry=${info.data.industry}, listed=${info.data.listedDate}`);

  // 5. Sina: Income statement
  console.log("\n5. Sina income statement (600519)...");
  const income = await client.fundamentals.incomeStatement("600519");
  console.log(`   source=${income.source}, data=${income.data ? "OK" : "NULL"}, error=${income.error ?? "none"}`);
  if (income.data) console.log(`   revenue=${income.data.revenue}, netProfit=${income.data.netProfit}, ROE=${income.data.roe}`);

  // 6. Eastmoney: Sector list
  console.log("\n6. Eastmoney sector list...");
  await new Promise((r) => setTimeout(r, 1200));
  const sectors = await client.signal.sectorRanking();
  console.log(`   source=${sectors.source}, count=${sectors.data?.length ?? 0}, error=${sectors.error ?? "none"}`);
  if (sectors.data) sectors.data.slice(0, 5).forEach((sec: any) => console.log(`   ${sec.name}: ${sec.changePct}%`));

  console.log("\n=== Smoke Test Complete ===");
}

main().catch(console.error);
```

- [ ] **Step 2: Run smoke test**

```bash
npx tsx lib/data-sdk/__tests__/smoke.ts
```

- [ ] **Step 3: Commit smoke test**

```bash
git add lib/data-sdk/__tests__/smoke.ts
git commit -m "test(data-sdk): add smoke test for real API validation"
```

---

### Task 15: Final verification

- [ ] **Step 1: Full type check**

```bash
pnpm lint
```

Expected: zero errors.

- [ ] **Step 2: Run all tests**

```bash
pnpm vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Verify no references to old module remain**

```bash
grep -r "d2-data\|akshare\|localhost:9500" . --include="*.ts" --include="*.tsx" --include="*.md" \
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git \
  --exclude-dir=docs/superpowers || echo "No old references found"
```

- [ ] **Step 4: Update AGENTS.md to remove d2-data reference**

Edit `AGENTS.md` line 29: change
```
| Data service | Python 3.11+ FastAPI + akshare (separate repo: `d2-data`) |
```
to
```
| Data service | lib/data-sdk/ — direct HTTP APIs (Tencent/Baidu/Eastmoney/Sina/Cninfo/THS) |
```

- [ ] **Step 5: Final commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md — d2-data replaced by lib/data-sdk/"
```
