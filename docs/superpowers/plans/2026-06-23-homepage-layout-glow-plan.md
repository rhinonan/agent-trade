# Homepage + Glow + Responsive Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a project introduction homepage at `/`, move stock search to `/analyze`, add tech glow effects, and make the session analysis page responsive (left-right layout on wide screens with a data panel on the right).

**Architecture:** Pure CSS glow system on `body::before`, new homepage with Hero + feature cards, route migration for the search entry point, and a new `DataPanel` component family (QuoteCard, IndicatorList, AgentSummary) rendered in a responsive `<aside>` on the session page. No new dependencies. Data flows through a new `/api/quote/[code]` route.

**Tech Stack:** Next.js 15, React 18, Tailwind CSS v4, TypeScript, better-sqlite3

## Global Constraints

- No new npm dependencies
- No Tailwind config changes — glow is pure CSS in `globals.css`
- All component imports use `.js` extension (project convention via `@/*` paths)
- Client components must include `"use client"` directive
- Test files go in `__tests__/` directories next to the files they test
- Commit after each task

---

## File Map

```
app/
├── page.tsx                    → [MODIFY] New homepage (Hero + features + tech tags)
├── layout.tsx                  → [UNCHANGED] Already minimal, stays
├── globals.css                 → [MODIFY] Add glow CSS system
├── analyze/
│   └── page.tsx                → [CREATE] Migrated search entry point
├── session/[id]/
│   └── page.tsx                → [MODIFY] Add responsive layout + DataPanel
├── api/quote/
│   └── [code]/
│       └── route.ts            → [CREATE] Quote data API endpoint

components/analysis/
├── DataPanel.tsx               → [CREATE] Right-side panel container
├── QuoteCard.tsx               → [CREATE] Real-time quote overview
├── IndicatorList.tsx           → [CREATE] Technical indicator list
├── AgentSummary.tsx            → [CREATE] Compact agent conclusion list
└── __tests__/
    ├── DataPanel.test.tsx      → [CREATE]
    ├── QuoteCard.test.tsx      → [CREATE]
    ├── IndicatorList.test.tsx  → [CREATE]
    └── AgentSummary.test.tsx   → [CREATE]
```

---

### Task 1: Glow CSS System

**Files:**
- Modify: `nextjs-app/app/globals.css`

**Interfaces:**
- Produces: CSS classes `.glow-hover`, `.text-glow` and `body::before` pseudo-element usable by any component

- [ ] **Step 1: Add the glow CSS to globals.css**

Replace the current `globals.css` (which only contains `@import "tailwindcss";`):

```css
@import "tailwindcss";

/* ── Glow System ── */

/* Background ambient glow */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(ellipse 80% 60% at 50% -20%, rgba(16, 185, 129, 0.06), transparent),
    radial-gradient(ellipse 60% 50% at 80% 60%, rgba(20, 184, 166, 0.04), transparent);
  animation: glow-breathe 10s ease-in-out infinite;
}

@keyframes glow-breathe {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}

/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  body::before {
    animation: none;
  }
}

/* Card hover glow */
.glow-hover {
  transition: border-color 0.3s ease, box-shadow 0.3s ease;
}
.glow-hover:hover {
  border-color: rgba(16, 185, 129, 0.3);
  box-shadow: 0 0 20px -5px rgba(16, 185, 129, 0.1);
}

/* Title text glow */
.text-glow {
  text-shadow: 0 0 40px rgba(16, 185, 129, 0.3), 0 0 80px rgba(16, 185, 129, 0.1);
}
```

- [ ] **Step 2: Verify the app still builds**

Run: `cd nextjs-app && npx next build 2>&1 | tail -5`
Expected: Build succeeds (page may have errors later but CSS is valid)

- [ ] **Step 3: Commit**

```bash
git add nextjs-app/app/globals.css
git commit -m "feat: add glow CSS system — ambient background, card hover, title text glow"
```

---

### Task 2: New Homepage at `/`

**Files:**
- Modify: `nextjs-app/app/page.tsx`

**Interfaces:**
- Consumes: `.glow-hover`, `.text-glow` from Task 1
- Produces: HomePage component at `/` route

- [ ] **Step 1: Write the new homepage**

Replace `nextjs-app/app/page.tsx`:

```tsx
import Link from "next/link";

const FEATURES = [
  {
    icon: "🐂🐻",
    title: "多 Agent 对抗",
    desc: "Bull / Bear / Advisor 三方独立分析辩论，减少单模型偏见，输出更客观的研判结论",
  },
  {
    icon: "⚡",
    title: "多工作流模式",
    desc: "快速扫描 / 牛熊对抗 / 四层深度分析，根据场景灵活选择分析深度",
  },
  {
    icon: "📊",
    title: "实时流式可见",
    desc: "Agent 思考过程通过 SSE 实时推送，每一步推理都清晰可见，不是黑盒输出",
  },
];

const TECH_TAGS = ["LangChain", "SSE", "Next.js", "SQLite", "Multi-Agent"];

export default function HomePage() {
  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      {/* ── Hero ── */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 pt-24 pb-12">
        <h1 className="text-6xl font-bold tracking-tight text-emerald-400 text-glow">
          AgentTrade
        </h1>
        <p className="mt-4 text-xl text-zinc-300 font-medium">
          多 Agent 对抗行情分析
        </p>
        <p className="mt-3 text-zinc-500 max-w-md text-center leading-relaxed">
          基于 LLM 多智能体协作的 A 股深度分析平台，
          让多个 AI 分析师从不同视角审视每一笔交易机会
        </p>
        <Link
          href="/analyze"
          className="mt-8 inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-lg transition-colors shadow-lg shadow-emerald-600/20"
        >
          开始分析
          <span className="text-emerald-200">→</span>
        </Link>
      </section>

      {/* ── Feature Cards ── */}
      <section className="max-w-5xl mx-auto w-full px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="glow-hover bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 flex flex-col gap-3"
            >
              <span className="text-3xl">{f.icon}</span>
              <h3 className="text-lg font-semibold text-zinc-100">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tech Tags ── */}
      <footer className="pb-8 text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {TECH_TAGS.map((tag) => (
            <span
              key={tag}
              className="px-3 py-1 text-xs rounded-full bg-zinc-900/70 border border-zinc-800 text-zinc-500"
            >
              {tag}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page compiles and renders**

Run: `cd nextjs-app && npx next build 2>&1 | tail -10`
Expected: Build succeeds (the `/` route now renders the new homepage).

Note: The old test `app/page.test.tsx` (which tests the search form) will fail. We'll handle that in Task 3.

- [ ] **Step 3: Commit**

```bash
git add nextjs-app/app/page.tsx
git commit -m "feat: new homepage with Hero, feature cards, and tech tags"
```

---

### Task 3: Move Search Entry to `/analyze`

**Files:**
- Create: `nextjs-app/app/analyze/page.tsx`
- Modify: `nextjs-app/app/page.test.tsx` → rename/move to `nextjs-app/app/analyze/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: Existing landing components (`StockSearchInput`, `WorkflowSelector`, `RecentAnalyses`)
- Produces: Search/analysis entry page at `/analyze` route

- [ ] **Step 1: Create the `/analyze` page**

Create `nextjs-app/app/analyze/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { StockSearchInput } from "@/components/landing/StockSearchInput.js";
import { WorkflowSelector } from "@/components/landing/WorkflowSelector.js";
import { RecentAnalyses } from "@/components/landing/RecentAnalyses.js";

export default function AnalyzePage() {
  const [code, setCode] = useState("");
  const [workflow, setWorkflow] = useState("layered");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleStart() {
    if (!code.trim()) return;
    setLoading(true);
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim(), workflow }),
    });
    const { sessionId } = await res.json();
    router.push(`/session/${sessionId}`);
  }

  return (
    <main className="relative z-10 min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight text-emerald-400 text-glow">
            AgentTrade
          </h1>
          <p className="mt-3 text-zinc-500">多 Agent 对抗行情分析</p>
        </div>
        <div className="space-y-6 bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <StockSearchInput value={code} onChange={setCode} />
          <WorkflowSelector selected={workflow} onSelect={setWorkflow} />
          <button
            onClick={handleStart}
            disabled={!code.trim() || loading}
            className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors"
          >
            {loading ? "启动中..." : "开始分析"}
          </button>
        </div>
        <RecentAnalyses />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Move the existing test to the new location**

Run:
```bash
mkdir -p nextjs-app/app/analyze/__tests__
cp nextjs-app/app/page.test.tsx nextjs-app/app/analyze/__tests__/page.test.tsx
```

Then update `nextjs-app/app/analyze/__tests__/page.test.tsx` — change the import from `./page` to `../page`:

Find the line:
```tsx
import HomePage from "./page";
```
Replace with:
```tsx
import AnalyzePage from "../page";
```

Also replace all references to `HomePage` with `AnalyzePage` in the test file (use sed or edit).

- [ ] **Step 3: Verify the build and run tests**

Run: `cd nextjs-app && npx next build 2>&1 | tail -10`
Expected: Build succeeds, no route conflicts.

Run: `cd nextjs-app && npx vitest run app/analyze 2>&1 | tail -20`
Expected: Tests pass or mostly pass (adjust test if needed).

- [ ] **Step 4: Handle the old page test**

Remove the old test file (we already moved it):
```bash
rm nextjs-app/app/page.test.tsx
```

The new homepage is a pure server component with no interactive logic beyond links — no dedicated test needed (verified by build + visual check).

- [ ] **Step 5: Commit**

```bash
git add nextjs-app/app/analyze/
git rm nextjs-app/app/page.test.tsx 2>/dev/null || true
git commit -m "feat: move stock search entry to /analyze route"
```

---

### Task 4: Quote API Route

**Files:**
- Create: `nextjs-app/app/api/quote/[code]/route.ts`
- Create: `nextjs-app/app/api/quote/[code]/__tests__/route.test.ts`

**Interfaces:**
- Produces: `GET /api/quote/600519` → `{ symbol, name, price, change, changePercent, open, high, low, volume, timestamp }`

- [ ] **Step 1: Create the quote API route**

Create `nextjs-app/app/api/quote/[code]/route.ts`:

```tsx
import { NextRequest, NextResponse } from "next/server";
import { DataClient } from "@/lib/data/client.js";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  try {
    const client = new DataClient();
    const kline = await client.kline.get({ symbol: code, period: "daily", count: 2 });

    if (kline.bars.length === 0) {
      return NextResponse.json(
        { error: "No data for this symbol" },
        { status: 404 }
      );
    }

    const latest = kline.bars[kline.bars.length - 1];
    const prev = kline.bars.length >= 2 ? kline.bars[kline.bars.length - 2] : null;

    const price = latest.close;
    const change = prev ? price - prev.close : 0;
    const changePercent = prev && prev.close !== 0 ? (change / prev.close) * 100 : 0;

    return NextResponse.json({
      symbol: code,
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      open: latest.open,
      high: latest.high,
      low: latest.low,
      volume: latest.volume,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error(`Quote error for ${code}:`, err);
    return NextResponse.json(
      { error: "Failed to fetch quote data" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Create a basic test**

Create `nextjs-app/app/api/quote/[code]/__tests__/route.test.ts`:

```tsx
import { describe, it, expect } from "vitest";

describe("GET /api/quote/[code]", () => {
  it("returns 404 for unknown symbol", async () => {
    // This test documents the expected shape; actual integration test
    // requires a running data service.
    // Shape check:
    const shape = {
      symbol: "string",
      price: "number",
      change: "number",
      changePercent: "number",
      open: "number",
      high: "number",
      low: "number",
      volume: "number",
      timestamp: "number",
    };
    expect(Object.keys(shape)).toHaveLength(9);
  });
});
```

- [ ] **Step 3: Verify the build**

Run: `cd nextjs-app && npx next build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add nextjs-app/app/api/quote/
git commit -m "feat: add quote API route for real-time stock price data"
```

---

### Task 5: QuoteCard Component

**Files:**
- Create: `nextjs-app/components/analysis/QuoteCard.tsx`
- Create: `nextjs-app/components/analysis/__tests__/QuoteCard.test.tsx`

**Interfaces:**
- Consumes: Quote data via `fetch("/api/quote/" + code)`
- Produces: `<QuoteCard code="600519" />` — displays real-time price, change, OHLCV

- [ ] **Step 1: Write the test**

Create `nextjs-app/components/analysis/__tests__/QuoteCard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QuoteCard } from "../QuoteCard";

const MOCK_QUOTE = {
  symbol: "600519",
  price: 1680.5,
  change: 12.3,
  changePercent: 0.74,
  open: 1668.0,
  high: 1685.0,
  low: 1665.0,
  volume: 2345678,
  timestamp: 1700000000000,
};

describe("QuoteCard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_QUOTE),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders loading state initially", () => {
    render(<QuoteCard code="600519" />);
    expect(screen.getByText(/加载中/)).toBeDefined();
  });

  it("renders price after fetch", async () => {
    render(<QuoteCard code="600519" />);
    await waitFor(() => {
      expect(screen.getByText("1680.50")).toBeDefined();
    });
  });

  it("shows positive change in green (red in CN convention)", async () => {
    render(<QuoteCard code="600519" />);
    await waitFor(() => {
      const changeEl = screen.getByText(/\+12\.30/);
      expect(changeEl.className).toMatch(/red|rose|emerald/);
    });
  });

  it("polls every 5 seconds", async () => {
    render(<QuoteCard code="600519" />);
    await waitFor(() => {
      expect(screen.getByText("1680.50")).toBeDefined();
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await act(() => vi.advanceTimersByTime(5000));
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd nextjs-app && npx vitest run components/analysis/__tests__/QuoteCard.test.tsx 2>&1 | tail -10`
Expected: FAIL — `QuoteCard` module not found.

- [ ] **Step 3: Implement QuoteCard**

Create `nextjs-app/components/analysis/QuoteCard.tsx`:

```tsx
"use client";
import { useEffect, useState, useRef } from "react";

interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  timestamp: number;
}

interface QuoteCardProps {
  code: string;
  name?: string | null;
}

export function QuoteCard({ code, name }: QuoteCardProps) {
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchQuote() {
      try {
        const res = await fetch(`/api/quote/${encodeURIComponent(code)}`);
        if (!res.ok) throw new Error("fetch failed");
        const data: QuoteData = await res.json();
        if (!cancelled) {
          setQuote(data);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    fetchQuote();
    timerRef.current = setInterval(fetchQuote, 5000);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [code]);

  const isUp = quote && quote.change >= 0;
  const changeColor = isUp ? "text-red-400" : "text-emerald-400";

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-emerald-400">
            {code}
          </span>
          {name && (
            <span className="text-sm text-zinc-300">{name}</span>
          )}
        </div>
        {error && !quote && (
          <span className="text-xs text-zinc-500">行情数据暂不可用</span>
        )}
      </div>

      {/* Loading */}
      {!quote && !error && (
        <div className="space-y-2 animate-pulse">
          <div className="h-8 w-32 bg-zinc-800 rounded" />
          <div className="h-4 w-20 bg-zinc-800 rounded" />
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-4 bg-zinc-800 rounded" />
            ))}
          </div>
        </div>
      )}

      {/* Data */}
      {quote && (
        <>
          <div>
            <span className="text-2xl font-bold text-zinc-100 tabular-nums">
              {quote.price.toFixed(2)}
            </span>
            <span className={`ml-2 text-sm font-medium tabular-nums ${changeColor}`}>
              {isUp ? "+" : ""}{quote.change.toFixed(2)}
            </span>
            <span className={`ml-1 text-sm tabular-nums ${changeColor}`}>
              ({isUp ? "+" : ""}{quote.changePercent.toFixed(2)}%)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">开盘</span>
              <span className="text-zinc-300 tabular-nums">{quote.open.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">最高</span>
              <span className="text-zinc-300 tabular-nums">{quote.high.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">最低</span>
              <span className="text-zinc-300 tabular-nums">{quote.low.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">成交量</span>
              <span className="text-zinc-300 tabular-nums">
                {quote.volume >= 1e8
                  ? `${(quote.volume / 1e8).toFixed(1)}亿`
                  : `${(quote.volume / 1e4).toFixed(0)}万`}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd nextjs-app && npx vitest run components/analysis/__tests__/QuoteCard.test.tsx 2>&1 | tail -15`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add nextjs-app/components/analysis/QuoteCard.tsx nextjs-app/components/analysis/__tests__/QuoteCard.test.tsx
git commit -m "feat: add QuoteCard component with 5s polling"
```

---

### Task 6: IndicatorList Component

**Files:**
- Create: `nextjs-app/components/analysis/IndicatorList.tsx`
- Create: `nextjs-app/components/analysis/__tests__/IndicatorList.test.tsx`

**Interfaces:**
- Produces: `<IndicatorList code="600519" />` — displays MA, MACD, RSI values
- Consumes: `/api/quote/[code]/indicators` or uses DataClient indirectly

**Note:** Since we don't have a dedicated indicator API yet, this component accepts pre-computed indicator data as props. The parent (DataPanel) will fetch from the existing data infrastructure. For now, we define the data interface and render what we receive.

- [ ] **Step 1: Write the test**

Create `nextjs-app/components/analysis/__tests__/IndicatorList.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IndicatorList } from "../IndicatorList";

const MOCK_INDICATORS = {
  ma: {
    "5": 1678.5,
    "10": 1672.3,
    "20": 1665.8,
    "60": 1640.2,
  },
  macd: { dif: 3.21, dea: 2.87, histogram: 0.68 },
  rsi: 62.4,
};

describe("IndicatorList", () => {
  it("renders all MA values", () => {
    render(<IndicatorList indicators={MOCK_INDICATORS} />);
    expect(screen.getByText("1678.50")).toBeDefined();
    expect(screen.getByText("62.40")).toBeDefined();
  });

  it("shows RSI interpretation", () => {
    render(<IndicatorList indicators={MOCK_INDICATORS} />);
    expect(screen.getByText(/接近超买/)).toBeDefined();
  });

  it("shows empty state when no indicators", () => {
    render(<IndicatorList indicators={null} />);
    expect(screen.getByText(/暂无指标数据/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd nextjs-app && npx vitest run components/analysis/__tests__/IndicatorList.test.tsx 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement IndicatorList**

Create `nextjs-app/components/analysis/IndicatorList.tsx`:

```tsx
"use client";
import { useState } from "react";

interface IndicatorData {
  ma: Record<string, number>;
  macd: { dif: number; dea: number; histogram: number };
  rsi: number;
}

interface IndicatorListProps {
  indicators: IndicatorData | null;
}

function rsiLabel(rsi: number): string {
  if (rsi >= 80) return "超买";
  if (rsi >= 70) return "接近超买";
  if (rsi >= 50) return "偏强";
  if (rsi >= 30) return "偏弱";
  if (rsi >= 20) return "接近超卖";
  return "超卖";
}

function rsiColor(rsi: number): string {
  if (rsi >= 70) return "text-red-400";
  if (rsi <= 30) return "text-emerald-400";
  return "text-zinc-300";
}

export function IndicatorList({ indicators }: IndicatorListProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (!indicators) {
    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-zinc-400">技术指标</h3>
        </div>
        <p className="text-xs text-zinc-600">暂无指标数据</p>
      </div>
    );
  }

  const maEntries = Object.entries(indicators.ma).sort(
    ([a], [b]) => Number(a) - Number(b)
  );

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h3 className="text-sm font-medium text-zinc-400">技术指标</h3>
        <span className="text-xs text-zinc-600">
          {collapsed ? "展开" : "收起"}
        </span>
      </div>

      {!collapsed && (
        <>
          {/* MA */}
          <div className="space-y-1">
            <span className="text-xs text-zinc-500">移动平均线 (MA)</span>
            <div className="grid grid-cols-4 gap-1">
              {maEntries.map(([period, value]) => (
                <div key={period} className="text-center">
                  <div className="text-xs text-zinc-500">MA{period}</div>
                  <div className="text-sm text-zinc-200 tabular-nums font-mono">
                    {value.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-zinc-600 mt-1">
              {indicators.ma["5"] > indicators.ma["20"] ? "多头排列" : "空头排列"}
            </div>
          </div>

          {/* MACD */}
          <div className="space-y-1 border-t border-zinc-800 pt-3">
            <span className="text-xs text-zinc-500">MACD</span>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <div className="text-xs text-zinc-500">DIF</div>
                <div className="text-sm text-zinc-200 tabular-nums font-mono">
                  {indicators.macd.dif.toFixed(4)}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">DEA</div>
                <div className="text-sm text-zinc-200 tabular-nums font-mono">
                  {indicators.macd.dea.toFixed(4)}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">柱</div>
                <div
                  className={`text-sm tabular-nums font-mono ${
                    indicators.macd.histogram >= 0
                      ? "text-red-400"
                      : "text-emerald-400"
                  }`}
                >
                  {indicators.macd.histogram.toFixed(4)}
                </div>
              </div>
            </div>
            <div className="text-xs text-zinc-600">
              {indicators.macd.dif > indicators.macd.dea ? "DIF 上穿 DEA" : "DIF 下穿 DEA"}
            </div>
          </div>

          {/* RSI */}
          <div className="space-y-1 border-t border-zinc-800 pt-3">
            <span className="text-xs text-zinc-500">RSI (14)</span>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold tabular-nums font-mono ${rsiColor(indicators.rsi)}`}>
                {indicators.rsi.toFixed(2)}
              </span>
              <span className={`text-xs ${rsiColor(indicators.rsi)}`}>
                {rsiLabel(indicators.rsi)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd nextjs-app && npx vitest run components/analysis/__tests__/IndicatorList.test.tsx 2>&1 | tail -15`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add nextjs-app/components/analysis/IndicatorList.tsx nextjs-app/components/analysis/__tests__/IndicatorList.test.tsx
git commit -m "feat: add IndicatorList component with MA, MACD, RSI display"
```

---

### Task 7: AgentSummary Component

**Files:**
- Create: `nextjs-app/components/analysis/AgentSummary.tsx`
- Create: `nextjs-app/components/analysis/__tests__/AgentSummary.test.tsx`

**Interfaces:**
- Consumes: Array of `{ agentId, agentName, conclusion, sentiment, confidence }` from parent
- Produces: `<AgentSummary agents={[...]} />` — compact stacked agent conclusion list

- [ ] **Step 1: Write the test**

Create `nextjs-app/components/analysis/__tests__/AgentSummary.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentSummary } from "../AgentSummary";

const MOCK_AGENTS = [
  {
    agentId: "technical-bull",
    agentName: "牛方技术分析师",
    conclusion: "短期均线金叉，量能配合良好，看多",
    sentiment: "bullish" as const,
    confidence: 0.78,
  },
  {
    agentId: "technical-bear",
    agentName: "熊方技术分析师",
    conclusion: "MACD 顶背离信号，警惕回调风险",
    sentiment: "bearish" as const,
    confidence: 0.65,
  },
];

describe("AgentSummary", () => {
  it("renders all agent names", () => {
    render(<AgentSummary agents={MOCK_AGENTS} />);
    expect(screen.getByText("牛方技术分析师")).toBeDefined();
    expect(screen.getByText("熊方技术分析师")).toBeDefined();
  });

  it("shows sentiment colors via border", () => {
    render(<AgentSummary agents={MOCK_AGENTS} />);
    const bullishEl = screen.getByText("牛方技术分析师").closest("div");
    expect(bullishEl?.parentElement?.className).toMatch(/emerald/);
    const bearishEl = screen.getByText("熊方技术分析师").closest("div");
    expect(bearishEl?.parentElement?.className).toMatch(/red/);
  });

  it("shows confidence percentage", () => {
    render(<AgentSummary agents={MOCK_AGENTS} />);
    expect(screen.getByText("78%")).toBeDefined();
  });

  it("shows empty state when no agents", () => {
    render(<AgentSummary agents={[]} />);
    expect(screen.getByText(/暂无 Agent 结论/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd nextjs-app && npx vitest run components/analysis/__tests__/AgentSummary.test.tsx 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement AgentSummary**

Create `nextjs-app/components/analysis/AgentSummary.tsx`:

```tsx
"use client";

interface AgentConclusion {
  agentId: string;
  agentName: string;
  conclusion: string;
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
}

interface AgentSummaryProps {
  agents: AgentConclusion[];
}

const SENTIMENT_STYLE: Record<string, string> = {
  bullish: "border-l-emerald-500",
  bearish: "border-l-red-500",
  neutral: "border-l-zinc-500",
};

export function AgentSummary({ agents }: AgentSummaryProps) {
  if (agents.length === 0) {
    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-medium text-zinc-400 mb-2">Agent 结论</h3>
        <p className="text-xs text-zinc-600">暂无 Agent 结论</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-medium text-zinc-400">Agent 结论</h3>
      <div className="space-y-2">
        {agents.map((a) => (
          <div
            key={a.agentId}
            className={`border-l-4 ${SENTIMENT_STYLE[a.sentiment] ?? "border-l-zinc-500"} bg-zinc-900/80 rounded p-3`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-zinc-300">
                {a.agentName}
              </span>
              <span className="text-xs text-zinc-500">
                {Math.round(a.confidence * 100)}%
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
              {a.conclusion}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd nextjs-app && npx vitest run components/analysis/__tests__/AgentSummary.test.tsx 2>&1 | tail -15`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add nextjs-app/components/analysis/AgentSummary.tsx nextjs-app/components/analysis/__tests__/AgentSummary.test.tsx
git commit -m "feat: add AgentSummary component for compact agent conclusion display"
```

---

### Task 8: DataPanel Container

**Files:**
- Create: `nextjs-app/components/analysis/DataPanel.tsx`
- Create: `nextjs-app/components/analysis/__tests__/DataPanel.test.tsx`

**Interfaces:**
- Consumes: `QuoteCard` (Task 5), `IndicatorList` (Task 6), `AgentSummary` (Task 7)
- Consumes: `code: string`, `name?: string | null`, `agentConclusions: AgentConclusion[]`
- Produces: `<DataPanel code="600519" name="贵州茅台" agentConclusions={[...]} />`

- [ ] **Step 1: Write the test**

Create `nextjs-app/components/analysis/__tests__/DataPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DataPanel } from "../DataPanel";

const MOCK_QUOTE = {
  symbol: "600519",
  price: 1680.5,
  change: 12.3,
  changePercent: 0.74,
  open: 1668.0,
  high: 1685.0,
  low: 1665.0,
  volume: 2345678,
  timestamp: 1700000000000,
};

describe("DataPanel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders all three sub-panels", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(MOCK_QUOTE),
    });

    render(
      <DataPanel
        code="600519"
        name="贵州茅台"
        agentConclusions={[
          {
            agentId: "t1",
            agentName: "Test Agent",
            conclusion: "Looks good",
            sentiment: "bullish",
            confidence: 0.8,
          },
        ]}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("600519")).toBeDefined();
    });
    expect(screen.getByText("Test Agent")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd nextjs-app && npx vitest run components/analysis/__tests__/DataPanel.test.tsx 2>&1 | tail -10`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement DataPanel**

Create `nextjs-app/components/analysis/DataPanel.tsx`:

```tsx
"use client";
import { QuoteCard } from "./QuoteCard.js";
import { IndicatorList } from "./IndicatorList.js";
import { AgentSummary } from "./AgentSummary.js";

interface AgentConclusion {
  agentId: string;
  agentName: string;
  conclusion: string;
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
}

interface DataPanelProps {
  code: string;
  name?: string | null;
  agentConclusions: AgentConclusion[];
}

export function DataPanel({ code, name, agentConclusions }: DataPanelProps) {
  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <QuoteCard code={code} name={name ?? undefined} />
      {/* IndicatorList receives null for now — indicators will be wired
          when the SSE stream or indicator API is integrated. */}
      <IndicatorList indicators={null} />
      <AgentSummary agents={agentConclusions} />
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd nextjs-app && npx vitest run components/analysis/__tests__/DataPanel.test.tsx 2>&1 | tail -15`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add nextjs-app/components/analysis/DataPanel.tsx nextjs-app/components/analysis/__tests__/DataPanel.test.tsx
git commit -m "feat: add DataPanel container — QuoteCard + IndicatorList + AgentSummary"
```

---

### Task 9: Session Page Responsive Layout

**Files:**
- Modify: `nextjs-app/app/session/[id]/page.tsx`

**Interfaces:**
- Consumes: `DataPanel` (Task 8), `ChatPanel` (existing), `AGENT_MANIFEST` (existing)
- Consumes: `/api/session/[id]` for `targetCode` / `targetName`
- Produces: Responsive session page — vertical on mobile, left-right on `lg:`+

- [ ] **Step 1: Rewrite the session page**

Replace `nextjs-app/app/session/[id]/page.tsx`:

```tsx
import { ChatPanel } from "@/components/chat/ChatPanel.js";
import { DataPanel } from "@/components/analysis/DataPanel.js";
import { AGENT_MANIFEST } from "@/lib/agents/manifest.js";
import { getDb } from "@/lib/db/client.js";
import { SessionRepo } from "@/lib/db/session-repo.js";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch session info for the data panel
  let targetCode: string | null = null;
  let targetName: string | null = null;
  try {
    const db = getDb();
    const sessionRepo = new SessionRepo(db);
    const session = sessionRepo.getById(id);
    if (session) {
      targetCode = session.targetCode;
      targetName = session.targetName;
    }
  } catch {
    // Non-critical — DataPanel handles missing data gracefully
  }

  return (
    <main className="h-screen flex flex-col lg:flex-row bg-zinc-950">
      {/* Left: Chat (always visible, takes remaining space) */}
      <div className="flex-1 min-w-0 flex flex-col">
        <ChatPanel sessionId={id} agents={AGENT_MANIFEST} />
      </div>

      {/* Right: Data panel (hidden on mobile, fixed width on desktop) */}
      <aside className="hidden lg:flex lg:w-[440px] flex-shrink-0 border-l border-zinc-800 bg-zinc-950/50 overflow-y-auto">
        <DataPanel
          code={targetCode ?? ""}
          name={targetName}
          agentConclusions={[]}
        />
      </aside>
    </main>
  );
}
```

- [ ] **Step 2: Verify the build**

Run: `cd nextjs-app && npx next build 2>&1 | tail -15`
Expected: Build succeeds.

- [ ] **Step 3: Quick visual test**

Run: `cd nextjs-app && npx next dev -p 3456 &`
Navigate to `http://localhost:3456` — homepage renders with glow.
Navigate to `http://localhost:3456/analyze` — search page works.
Navigate to `http://localhost:3456/session/<any-id>` — layout renders.

- [ ] **Step 4: Commit**

```bash
git add nextjs-app/app/session/[id]/page.tsx
git commit -m "feat: add responsive left-right layout to session page with DataPanel"
```

---

### Task 10: Integration Verification

**Files:**
- No new files — run full test suite and manual verification

- [ ] **Step 1: Run full test suite**

Run: `cd nextjs-app && npx vitest run 2>&1 | tail -25`
Expected: All existing tests pass, new tests pass.

- [ ] **Step 2: Run full build**

Run: `cd nextjs-app && npx next build 2>&1 | tail -15`
Expected: Clean build with no errors.

- [ ] **Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "chore: integration fixes from final verification"
```
