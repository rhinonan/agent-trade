# UI Redesign: Top Nav + Blue Theme + Entry Page Layout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent top navigation, replace emerald/green theme with blue, and restructure the analysis entry page to a left-right layout.

**Architecture:** Minimal-change approach — a new `TopNav` component wired into the root layout, mechanical find-replace of emerald→blue Tailwind classes across all source files, and a flexbox restructure of the `/analyze` page. Three placeholder pages for future features.

**Tech Stack:** Next.js 15 (App Router), React 18, Tailwind CSS 4, shadcn/ui, TypeScript, Vitest + @testing-library/react

## Global Constraints

- Replace ALL `emerald-*` Tailwind classes with `blue-*` equivalents across the entire codebase
- TopNav must appear on every page including landing (`/`)
- TopNav tabs: 个股分析(`/analyze`), 行业拆解(`/industry`), 策略回溯(`/backtest`), 许愿池(`/wishpool`), + Login placeholder on far right
- `/analyze` page: left 40% history list, right 60% input form on md+ screens; vertical stack on mobile
- Placeholder pages: centered card with feature name + "即将上线"

---

## File Map

| File | Responsibility |
|------|---------------|
| `app/globals.css` | Ambient glow gradients, hover effects — emerald→blue rgba |
| `app/layout.tsx` | Root layout — import and render `<TopNav />` |
| `app/page.tsx` | Landing page — emerald→blue classes |
| `app/analyze/page.tsx` | Analysis entry — restructure to left-right layout |
| `app/analyze/__tests__/page.test.tsx` | Update test for new layout and blue classes |
| `app/industry/page.tsx` | **New** — placeholder page |
| `app/backtest/page.tsx` | **New** — placeholder page |
| `app/wishpool/page.tsx` | **New** — placeholder page |
| `app/history/page.tsx` | emerald→blue classes |
| `app/session/[id]/page.tsx` | No changes needed (uses neutral zinc classes) |
| `app/analyze/[id]/page.tsx` | No changes needed (uses neutral zinc classes) |
| `components/layout/TopNav.tsx` | **New** — navigation bar with 4 tabs + login |
| `components/landing/RecentAnalyses.tsx` | emerald→blue classes; adjust for left-panel context |
| `components/landing/StockSearchInput.tsx` | emerald→blue classes |
| `components/landing/WorkflowSelector.tsx` | emerald→blue classes |
| `components/analysis/AnalysisHeader.tsx` | emerald→blue (complete status) |
| `components/analysis/AgentSummary.tsx` | emerald→blue (bullish border, final conclusion) |
| `components/analysis/AgentBubble.tsx` | emerald→blue (bullish sentiment border) |
| `components/analysis/StepProgress.tsx` | emerald→blue (complete step dot) |
| `components/analysis/IndicatorList.tsx` | emerald→blue (oversold/RSI, MACD histogram) |
| `components/analysis/QuoteCard.tsx` | emerald→blue (code label, down price) |
| `components/chat/MessageBubble.tsx` | emerald→blue (bullish border, agent name, user bubble) |
| `components/chat/ChatPanel.tsx` | emerald→blue (running status dot, resume button) |
| `components/chat/ChatInput.tsx` | emerald→blue (agent tags, send button) |
| `components/chat/StructuredAnalysis.tsx` | emerald→blue (bullish sentiment badge) |

### Test files that reference `emerald` (update to `blue`)

| File | Lines |
|------|-------|
| `app/analyze/__tests__/page.test.tsx` | L101 |
| `components/analysis/__tests__/AgentSummary.test.tsx` | L32 |
| `components/analysis/__tests__/QuoteCard.test.tsx` | L47 |
| `components/analysis/AnalysisHeader.test.tsx` | L60, L70 |
| `components/analysis/AgentBubble.test.tsx` | L30, L33 |
| `components/analysis/StepProgress.test.tsx` | L25, L31 |

---

### Task 1: Replace emerald theme with blue in globals.css

**Files:**
- Modify: `nextjs-app/app/globals.css`

**Interfaces:**
- Produces: Blue glow system consumed by all pages via Tailwind classes

- [ ] **Step 1: Replace emerald/teal rgba values with blue rgba in globals.css**

Replace the background ambient glow from emerald/teal to blue shades:

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
    radial-gradient(ellipse 80% 60% at 50% -20%, rgba(59, 130, 246, 0.06), transparent),
    radial-gradient(ellipse 60% 50% at 80% 60%, rgba(37, 99, 235, 0.04), transparent);
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
  border-color: rgba(59, 130, 246, 0.3);
  box-shadow: 0 0 20px -5px rgba(59, 130, 246, 0.1);
}

/* Title text glow */
.text-glow {
  text-shadow: 0 0 40px rgba(59, 130, 246, 0.3), 0 0 80px rgba(59, 130, 246, 0.1);
}
```

Changes:
- `rgba(16, 185, 129, 0.06)` → `rgba(59, 130, 246, 0.06)` (emerald-500 → blue-500)
- `rgba(20, 184, 166, 0.04)` → `rgba(37, 99, 235, 0.04)` (teal-500 → blue-600)
- `.glow-hover:hover` border/shadow: `rgba(16, 185, 129, ...)` → `rgba(59, 130, 246, ...)`
- `.text-glow` text-shadow: `rgba(16, 185, 129, ...)` → `rgba(59, 130, 246, ...)`

- [ ] **Step 2: Verify CSS change**

Run: `cd nextjs-app && grep -n "185, 129\|emerald\|teal" app/globals.css`
Expected: No matches (all emerald/teal references removed)

- [ ] **Step 3: Commit**

```bash
git add nextjs-app/app/globals.css
git commit -m "style: replace emerald/teal glow with blue in globals.css"
```

---

### Task 2: Replace emerald classes with blue in all component and page files

**Files:**
- Modify: All files listed in the File Map above (excluding globals.css, test files, and new files)
- Modify: Test files referencing emerald

**Interfaces:**
- Consumes: Blue theme from Task 1
- Produces: Consistent blue color scheme across all UI

- [ ] **Step 1: Replace emerald→blue in landing components**

**`nextjs-app/components/landing/StockSearchInput.tsx`** L84:
```
- <span className="text-emerald-400 font-mono text-sm font-medium whitespace-nowrap">
+ <span className="text-blue-400 font-mono text-sm font-medium whitespace-nowrap">
```

**`nextjs-app/components/landing/WorkflowSelector.tsx`** L25:
```
- ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
+ ? "border-blue-500 bg-blue-500/10 text-blue-300"
```

**`nextjs-app/components/landing/RecentAnalyses.tsx`**:
- L15: `"bg-emerald-400 animate-pulse"` → `"bg-blue-400 animate-pulse"`
- L15: `"text-emerald-400"` → `"text-blue-400"`
- L64: `"text-emerald-500 hover:text-emerald-400"` → `"text-blue-500 hover:text-blue-400"`
- L81: `"text-emerald-400"` → `"text-blue-400"`

- [ ] **Step 2: Replace emerald→blue in analysis components**

**`nextjs-app/components/analysis/AnalysisHeader.tsx`** L15:
```
- complete: "text-emerald-400",
+ complete: "text-blue-400",
```

**`nextjs-app/components/analysis/AgentSummary.tsx`**:
- L10: `"border-l-emerald-500"` → `"border-l-blue-500"`
- L49: `"border-b-2 border-emerald-500 pb-3"` → `"border-b-2 border-blue-500 pb-3"`
- L50: `"text-emerald-300"` → `"text-blue-300"`

**`nextjs-app/components/analysis/AgentBubble.tsx`** L18:
```
- ? "border-l-emerald-500"
+ ? "border-l-blue-500"
```

**`nextjs-app/components/analysis/StepProgress.tsx`** L15:
```
- ? "bg-emerald-500"
+ ? "bg-blue-500"
```

**`nextjs-app/components/analysis/IndicatorList.tsx`**:
- L25: `"text-emerald-400"` → `"text-blue-400"`
- L101: `"text-emerald-400"` → `"text-blue-400"`

**`nextjs-app/components/analysis/QuoteCard.tsx`**:
- L53: `"text-emerald-400"` → `"text-blue-400"`
- L60: `"text-emerald-400"` → `"text-blue-400"`

- [ ] **Step 3: Replace emerald→blue in chat components**

**`nextjs-app/components/chat/MessageBubble.tsx`**:
- L33: `"border-l-emerald-500"` → `"border-l-blue-500"`
- L40: `"bg-emerald-600/20 border border-emerald-700/40"` → `"bg-blue-600/20 border border-blue-700/40"`
- L56: `"text-emerald-400"` → `"text-blue-400"`

**`nextjs-app/components/chat/ChatPanel.tsx`**:
- L40: `"bg-emerald-400 animate-pulse"` → `"bg-blue-400 animate-pulse"`
- L53: `"bg-emerald-600 hover:bg-emerald-500"` → `"bg-blue-600 hover:bg-blue-500"`

**`nextjs-app/components/chat/ChatInput.tsx`**:
- L51: `"bg-emerald-900/50 text-emerald-300"` → `"bg-blue-900/50 text-blue-300"`
- L94: `"bg-emerald-600 hover:bg-emerald-500"` → `"bg-blue-600 hover:bg-blue-500"`

**`nextjs-app/components/chat/StructuredAnalysis.tsx`** L18:
```
- bullish: "text-emerald-400 bg-emerald-950/40 border-emerald-500/30",
+ bullish: "text-blue-400 bg-blue-950/40 border-blue-500/30",
```

- [ ] **Step 4: Replace emerald→blue in page files**

**`nextjs-app/app/page.tsx`**:
- L28: `"text-emerald-400"` → `"text-blue-400"`
- L40: `"bg-emerald-600 hover:bg-emerald-500 ... shadow-lg shadow-emerald-600/20"` → `"bg-blue-600 hover:bg-blue-500 ... shadow-lg shadow-blue-600/20"`
- L43: `"text-emerald-200"` → `"text-blue-200"`

**`nextjs-app/app/analyze/page.tsx`** (will be fully restructured in Task 7, but for now replace emerald):
- L41: `"text-emerald-400"` → `"text-blue-400"` (will be removed in Task 7)
- L55: `"bg-emerald-600 hover:bg-emerald-500"` → `"bg-blue-600 hover:bg-blue-500"`

**`nextjs-app/app/history/page.tsx`**:
- L15: `"bg-emerald-400 animate-pulse"` → `"bg-blue-400 animate-pulse"`
- L15: `"text-emerald-400"` → `"text-blue-400"`
- L74: `"text-emerald-400"` → `"text-blue-400"`

- [ ] **Step 5: Replace emerald→blue in test files**

**`nextjs-app/app/analyze/__tests__/page.test.tsx`** L101:
```
- expect(quickScanButton!.className).toContain("border-emerald-500");
+ expect(quickScanButton!.className).toContain("border-blue-500");
```

**`nextjs-app/components/analysis/__tests__/AgentSummary.test.tsx`** L32:
```
- expect(bullishEl?.parentElement?.className).toMatch(/emerald/);
+ expect(bullishEl?.parentElement?.className).toMatch(/blue/);
```

**`nextjs-app/components/analysis/__tests__/QuoteCard.test.tsx`** L47:
```
- expect(changeEl.className).toMatch(/red|rose|emerald/);
+ expect(changeEl.className).toMatch(/red|rose|blue/);
```

**`nextjs-app/components/analysis/AnalysisHeader.test.tsx`** L60, L70:
```
- it("renders complete status with emerald color", () => {
+ it("renders complete status with blue color", () => {
```
```
- expect(statusEl.className).toContain("text-emerald-400");
+ expect(statusEl.className).toContain("text-blue-400");
```

**`nextjs-app/components/analysis/AgentBubble.test.tsx`** L30, L33:
```
- it("applies emerald left border for bullish sentiment", () => {
+ it("applies blue left border for bullish sentiment", () => {
```
```
- expect(card.className).toContain("border-l-emerald-500");
+ expect(card.className).toContain("border-l-blue-500");
```

**`nextjs-app/components/analysis/StepProgress.test.tsx`** L25, L31:
```
- it("applies emerald-500 background for complete steps", () => {
+ it("applies blue-500 background for complete steps", () => {
```
```
- expect(indicator?.className).toContain("bg-emerald-500");
+ expect(indicator?.className).toContain("bg-blue-500");
```

- [ ] **Step 6: Verify no emerald references remain in source**

Run: `cd nextjs-app && grep -rn "emerald" --include="*.tsx" --include="*.ts" --include="*.css" app/ components/`
Expected: No output (all emerald references removed)

- [ ] **Step 7: Run existing tests to confirm no regressions**

```bash
cd nextjs-app && pnpm test --run
```

Expected: All tests pass (color class changes don't break functionality)

- [ ] **Step 8: Commit**

```bash
git add nextjs-app/
git commit -m "style: replace emerald with blue theme across all components and pages"
```

---

### Task 3: Create TopNav component

**Files:**
- Create: `nextjs-app/components/layout/TopNav.tsx`

**Interfaces:**
- Produces: `<TopNav />` component with `navItems`, active route highlight via `usePathname()`, and login placeholder button
- Consumed by: `app/layout.tsx` (Task 5)

- [ ] **Step 1: Create the TopNav component**

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "个股分析", href: "/analyze" },
  { label: "行业拆解", href: "/industry" },
  { label: "策略回溯", href: "/backtest" },
  { label: "许愿池", href: "/wishpool" },
] as const;

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-14">
        {/* Brand + Tabs */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-blue-400 hover:text-blue-300 transition-colors shrink-0"
          >
            AgentTrade
          </Link>

          <div className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    isActive
                      ? "bg-blue-500/10 text-blue-400 font-medium"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Login placeholder */}
        <button className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded-md hover:bg-zinc-800/50">
          登录
        </button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Verify file was created**

```bash
ls -la nextjs-app/components/layout/TopNav.tsx
```

- [ ] **Step 3: Commit**

```bash
git add nextjs-app/components/layout/TopNav.tsx
git commit -m "feat: add TopNav component with 4 tabs and login placeholder"
```

---

### Task 4: Create placeholder pages

**Files:**
- Create: `nextjs-app/app/industry/page.tsx`
- Create: `nextjs-app/app/backtest/page.tsx`
- Create: `nextjs-app/app/wishpool/page.tsx`

**Interfaces:**
- Consumed by: TopNav links (`/industry`, `/backtest`, `/wishpool`)
- Produces: Simple "即将上线" placeholder UI

- [ ] **Step 1: Create industry placeholder page**

```tsx
export default function IndustryPage() {
  return (
    <main className="relative z-10 min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4">
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-12 text-center space-y-3">
        <span className="text-4xl">🏭</span>
        <h1 className="text-2xl font-bold text-zinc-200">行业拆解</h1>
        <p className="text-zinc-500">即将上线</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create backtest placeholder page**

```tsx
export default function BacktestPage() {
  return (
    <main className="relative z-10 min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4">
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-12 text-center space-y-3">
        <span className="text-4xl">⏮️</span>
        <h1 className="text-2xl font-bold text-zinc-200">策略回溯</h1>
        <p className="text-zinc-500">即将上线</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create wishpool placeholder page**

```tsx
export default function WishpoolPage() {
  return (
    <main className="relative z-10 min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4">
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-12 text-center space-y-3">
        <span className="text-4xl">🌟</span>
        <h1 className="text-2xl font-bold text-zinc-200">许愿池</h1>
        <p className="text-zinc-500">即将上线</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add nextjs-app/app/industry/ nextjs-app/app/backtest/ nextjs-app/app/wishpool/
git commit -m "feat: add placeholder pages for industry, backtest, and wishpool"
```

---

### Task 5: Wire TopNav into root layout

**Files:**
- Modify: `nextjs-app/app/layout.tsx`

**Interfaces:**
- Consumes: `<TopNav />` from Task 3
- Produces: All pages get persistent top navigation

- [ ] **Step 1: Update layout.tsx**

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/layout/TopNav.js";

export const metadata: Metadata = {
  title: "AgentTrade",
  description: "多Agent对抗行情分析",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <TopNav />
        {children}
      </body>
    </html>
  );
}
```

Changes:
- Add `import { TopNav } from "@/components/layout/TopNav.js";`
- Add `<TopNav />` as first child of `<body>`, before `{children}`

- [ ] **Step 2: Type-check the project**

```bash
cd nextjs-app && pnpm lint
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add nextjs-app/app/layout.tsx
git commit -m "feat: wire TopNav into root layout"
```

---

### Task 6: Restructure /analyze page to left-right layout

**Files:**
- Modify: `nextjs-app/app/analyze/page.tsx`
- Modify: `nextjs-app/app/analyze/__tests__/page.test.tsx` (update for new layout)
- Modify: `nextjs-app/components/landing/RecentAnalyses.tsx` (adjust for left-panel context)

**Interfaces:**
- Consumes: Blue theme (Task 2), TopNav (Task 5)
- Produces: Left-right layout at md+, stacked on mobile

- [ ] **Step 1: Rewrite analyze page with left-right layout**

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
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleStart() {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), workflow }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `请求失败 (${res.status})`);
      }
      const { sessionId } = await res.json();
      router.push(`/session/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败，请重试");
      setLoading(false);
    }
  }

  return (
    <main className="relative z-10 min-h-[calc(100vh-3.5rem)] flex flex-col md:flex-row">
      {/* Left: Recent history */}
      <aside className="md:w-[40%] lg:w-[35%] border-b md:border-b-0 md:border-r border-zinc-800 p-4 md:p-6 overflow-y-auto max-h-[50vh] md:max-h-[calc(100vh-3.5rem)]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-zinc-400">历史记录</h2>
          </div>
          <RecentAnalyses />
        </div>
      </aside>

      {/* Right: Input form */}
      <section className="flex-1 flex items-start justify-center p-4 md:p-8 md:pt-12">
        <div className="w-full max-w-lg space-y-6">
          <div className="space-y-6 bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
            <StockSearchInput value={code} onChange={setCode} />
            <WorkflowSelector selected={workflow} onSelect={setWorkflow} />
            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}
            <button
              onClick={handleStart}
              disabled={!code.trim() || loading}
              className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors"
            >
              {loading ? "启动中..." : "开始分析"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
```

Key changes from current:
- Removed the centered `<h1>` title and subtitle (brand is in nav now)
- Changed root element from centered single column to `flex flex-col md:flex-row`
- Left `<aside>` takes `md:w-[40%]` with border-right on desktop, border-bottom on mobile
- Right `<section>` takes remaining space with the input form centered within
- Mobile: history panel gets `max-h-[50vh]`, stacks on top
- Desktop: history panel gets `max-h-[calc(100vh-3.5rem)]` for independent scrolling
- Blue button classes instead of emerald

- [ ] **Step 2: Update RecentAnalyses to work in left-panel context**

Modify `nextjs-app/components/landing/RecentAnalyses.tsx` — remove the "查看全部 →" link (it's now just a scrollable history list; user can navigate via items directly), and return content unconditionally (don't silent-hide on empty):

Change the header section (lines 58-68) from:
```tsx
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-400">最近分析</h3>
        <button
          onClick={() => router.push("/history")}
          className="text-xs text-blue-500 hover:text-blue-400 transition-colors"
        >
          查看全部 →
        </button>
      </div>
      <div className="space-y-2">
```
To:
```tsx
    <div className="space-y-2">
```

(Remove the "最近分析" header since the parent provides "历史记录" heading, remove the "查看全部 →" link since each item is already clickable, and the history page is accessible from the items.)

Also update the empty state: instead of returning `null` on empty, show a subtle message:
```tsx
  if (sessions.length === 0) return (
    <p className="text-sm text-zinc-600 text-center py-8">暂无分析记录</p>
  );
```

- [ ] **Step 3: Update tests for the new analyze page layout**

Update `nextjs-app/app/analyze/__tests__/page.test.tsx`:

1. Remove the test that checks for the `<h1>AgentTrade</h1>` heading (line 45-52) — it no longer exists on this page
2. Remove the test that checks for subtitle (line 54-59)
3. Update the selected workflow test (line 101):
```
- expect(quickScanButton!.className).toContain("border-emerald-500");
+ expect(quickScanButton!.className).toContain("border-blue-500");
```

The updated test file keeps all functional tests (stock input, workflow selection, button enable/disable, API call + redirect) but drops UI-only tests for the removed title/subtitle.

Updated test:
```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AnalyzePage from "../page";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const mockWorkflows = [
  { name: "bull-bear", description: "牛熊对抗" },
  { name: "quick-scan", description: "快速扫描" },
];

function renderPage() {
  return render(<AnalyzePage />);
}

describe("AnalyzePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation(async (url: string) => {
      if (url === "/api/workflows") {
        return {
          ok: true,
          json: async () => mockWorkflows,
        } as Response;
      }
      if (url === "/api/session") {
        return {
          ok: true,
          json: async () => ({ sessionId: "test-session-123" }),
        } as Response;
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
  });

  it("renders a stock code input", async () => {
    renderPage();
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/输入股票代码/);
      expect(input).toBeDefined();
    });
  });

  it("updates stock code value on user input", async () => {
    renderPage();
    const input = await screen.findByPlaceholderText(/输入股票代码/);
    fireEvent.change(input, { target: { value: "600519" } });
    expect(input).toHaveValue("600519");
  });

  it("fetches and displays workflow options", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("牛熊对抗")).toBeDefined();
    });
    expect(screen.getByText("快速扫描")).toBeDefined();
    expect(screen.getByText("四层深度分析")).toBeDefined();
  });

  it("highlights the selected workflow", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("牛熊对抗")).toBeDefined();
    });
    const quickScanButton = screen.getByText("快速扫描").closest("button");
    expect(quickScanButton).toBeDefined();
    fireEvent.click(quickScanButton!);
    await waitFor(() => {
      expect(quickScanButton!.className).toContain("border-blue-500");
    });
  });

  it("renders a start analysis button", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("开始分析")).toBeDefined();
    });
  });

  it("disables start button when stock code is empty", async () => {
    renderPage();
    await waitFor(() => {
      const button = screen.getByText("开始分析");
      expect(button).toBeDisabled();
    });
  });

  it("enables start button when stock code is entered", async () => {
    renderPage();
    const input = await screen.findByPlaceholderText(/输入股票代码/);
    fireEvent.change(input, { target: { value: "600519" } });
    await waitFor(() => {
      const button = screen.getByText("开始分析");
      expect(button).not.toBeDisabled();
    });
  });

  it("calls POST /api/session and redirects on start", async () => {
    renderPage();
    const input = await screen.findByPlaceholderText(/输入股票代码/);
    fireEvent.change(input, { target: { value: "600519" } });
    await waitFor(() => {
      expect(screen.getByText("牛熊对抗")).toBeDefined();
    });
    const startButton = screen.getByText("开始分析");
    fireEvent.click(startButton);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "600519", workflow: "layered" }),
      });
      expect(mockPush).toHaveBeenCalledWith("/session/test-session-123");
    });
  });

  it("renders within a main element", async () => {
    renderPage();
    await waitFor(() => {
      const main = document.querySelector("main");
      expect(main).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd nextjs-app && pnpm test --run
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add nextjs-app/app/analyze/page.tsx nextjs-app/app/analyze/__tests__/page.test.tsx nextjs-app/components/landing/RecentAnalyses.tsx
git commit -m "feat: restructure /analyze page to left-right layout"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite**

```bash
cd nextjs-app && pnpm test --run
```

Expected: All tests pass, no failures.

- [ ] **Step 2: Type-check**

```bash
cd nextjs-app && pnpm lint
```

Expected: No type errors.

- [ ] **Step 3: Verify no emerald remains in source**

```bash
cd nextjs-app && grep -rn "emerald" --include="*.tsx" --include="*.ts" --include="*.css" app/ components/
```

Expected: No output.

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final verification — all tests pass, no emerald references remain"
```
