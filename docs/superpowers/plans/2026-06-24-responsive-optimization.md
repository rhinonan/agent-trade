# Responsive Optimization — 移动端响应式适配

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Systematically add responsive breakpoints across the AgentTrade frontend — hamburger nav on mobile, bottom-sheet data panels, collapsible history sidebar, and mobile-friendly text sizing — so the app is usable on screens from 375px to 1440px.

**Architecture:** A reusable `BottomSheet` client component handles the mobile data-panel pattern for both `/analyze/[id]` and `/session/[id]`. The TopNav gains a hamburger toggle for `<md` screens. The `/analyze` entry page adds a collapsible history section on mobile. Existing desktop layouts are unchanged; all new behavior is gated behind `md:` or `sm:` Tailwind breakpoints. The data-panel sidebar breakpoint drops from `lg` (1024px) to `md` (768px) so tablets see it inline.

**Tech Stack:** Next.js 15 (App Router), React 18, TypeScript 5, Tailwind CSS v4, no additional dependencies

## Global Constraints

- All existing desktop layouts must remain pixel-identical — new behavior gated behind `md:` / `sm:` breakpoints only
- No new npm dependencies
- Chinese UI labels (zh-CN locale)
- Dark theme: `bg-zinc-950`, `text-zinc-100`, `border-zinc-800`, accent `blue-500/600`
- `cn()` helper from `@/lib/utils` is available for conditional class merging
- Tailwind CSS v4 uses `@import "tailwindcss"` in `globals.css` — no `tailwind.config` file

---

### Task 1: Create BottomSheet reusable component

**Files:**
- Create: `components/ui/BottomSheet.tsx`
- Modify: `app/globals.css` (append slide-up keyframe)

**Interfaces:**
- Produces: `<BottomSheet triggerLabel={string} title?: string>children</BottomSheet>` — client component with open/close state, body scroll lock, overlay backdrop, slide-up animation. Hidden on `md:` and above via `className="md:hidden"`.

- [ ] **Step 1: Create `components/ui/BottomSheet.tsx`**

```tsx
"use client";
import { useState, useEffect } from "react";

interface BottomSheetProps {
  triggerLabel: string;
  children: React.ReactNode;
  title?: string;
}

export function BottomSheet({ triggerLabel, children, title }: BottomSheetProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className="md:hidden">
      {/* Trigger bar — fixed to bottom */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-center gap-2 py-3 bg-zinc-900/90 backdrop-blur-sm border-t border-zinc-800 active:bg-zinc-800/50 transition-colors"
        >
          <span className="w-8 h-1 rounded-full bg-zinc-600" />
          <span className="text-xs text-zinc-400">{triggerLabel}</span>
        </button>
      )}

      {/* Overlay + Sheet */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="relative bg-zinc-950 rounded-t-2xl border-t border-zinc-800 max-h-[75vh] overflow-y-auto animate-slide-up">
            {/* Drag handle bar */}
            <div className="sticky top-0 z-10 flex items-center justify-center px-4 py-3 bg-zinc-950 rounded-t-2xl border-b border-zinc-800/50">
              <span className="w-10 h-1 rounded-full bg-zinc-600" />
              <button
                onClick={() => setOpen(false)}
                className="absolute right-4 text-sm text-zinc-500 hover:text-zinc-300 w-8 h-8 flex items-center justify-center rounded-md hover:bg-zinc-800/50 transition-colors"
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            {title && (
              <h3 className="px-4 pt-3 text-sm font-medium text-zinc-300">{title}</h3>
            )}
            <div className="p-4">
              {children}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Append slide-up animation to `app/globals.css`**

Add this block at the end of `app/globals.css`:

```css
/* BottomSheet slide-up animation */
@keyframes slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
.animate-slide-up {
  animation: slide-up 0.3s ease-out;
}
```

- [ ] **Step 3: Commit**

```bash
git add components/ui/BottomSheet.tsx app/globals.css
git commit -m "feat: add BottomSheet component with slide-up animation"
```

---

### Task 2: TopNav hamburger menu

**Files:**
- Modify: `components/layout/TopNav.tsx`

**Interfaces:**
- Consumes: none (standalone)
- Produces: Same `<TopNav />` export. Desktop unchanged. Mobile (`<md`): nav items hidden, hamburger button (☰) shown; tap opens a full-width dropdown panel below the 14-high bar; tap ✕ or click outside closes it. Active item uses existing `bg-blue-500/10 text-blue-400 font-medium` classes.

- [ ] **Step 1: Rewrite `components/layout/TopNav.tsx`**

```tsx
"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "个股分析", href: "/analyze" },
  { label: "行业拆解", href: "/industry" },
  { label: "策略回溯", href: "/backtest" },
  { label: "许愿池", href: "/wishpool" },
  { label: "角色管理", href: "/roles" },
] as const;

export function TopNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Close on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-14">
        {/* Brand */}
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-blue-400 hover:text-blue-300 transition-colors shrink-0"
        >
          AgentTrade
        </Link>

        {/* Desktop nav items */}
        <div className="hidden md:flex items-center gap-1">
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

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Hamburger (mobile only) */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
            aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
          >
            {menuOpen ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 5h12M3 9h12M3 13h12" />
              </svg>
            )}
          </button>

          {/* Login (always visible) */}
          <button className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded-md hover:bg-zinc-800/50">
            登录
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div ref={menuRef} className="md:hidden border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-md">
          <div className="px-2 py-2 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-4 py-3 text-sm rounded-lg transition-colors ${
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
      )}
    </nav>
  );
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
pnpm tsc --noEmit --pretty 2>&1 | head -30
```

Expected: No errors related to `TopNav.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/layout/TopNav.tsx
git commit -m "feat: add hamburger menu to TopNav for mobile (<md)"
```

---

### Task 3: Homepage hero responsive text sizing

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: none
- Produces: Same `<HomePage />` export. Hero h1 scales down on mobile: `text-4xl sm:text-5xl md:text-6xl`. Subtitle: `text-lg sm:text-xl`. Description max-width: `max-w-sm sm:max-w-md`. CTA button padding: `px-6 py-3 sm:px-8 sm:py-3.5`.

- [ ] **Step 1: Edit `app/page.tsx` — hero section classes**

Replace the hero section in `app/page.tsx` (lines 27-44 currently):

```tsx
      {/* ── Hero ── */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 pt-24 pb-12">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-blue-400 text-glow">
          AgentTrade
        </h1>
        <p className="mt-4 text-lg sm:text-xl text-zinc-300 font-medium">
          多 Agent 对抗行情分析
        </p>
        <p className="mt-3 text-zinc-500 max-w-sm sm:max-w-md text-center leading-relaxed">
          基于 LLM 多智能体协作的 A 股深度分析平台，
          让多个 AI 分析师从不同视角审视每一笔交易机会
        </p>
        <Link
          href="/analyze"
          className="mt-8 inline-flex items-center gap-2 px-6 py-3 sm:px-8 sm:py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-lg transition-colors shadow-lg shadow-blue-600/20"
        >
          开始分析
          <span className="text-blue-200">→</span>
        </Link>
      </section>
```

- [ ] **Step 2: Verify the rest of the file is unchanged**

The feature cards (`grid-cols-1 md:grid-cols-3`) and tech tags footer remain as-is.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: responsive hero text sizing on homepage"
```

---

### Task 4: Analyze entry page — collapsible history + edge-to-edge form

**Files:**
- Modify: `app/analyze/page.tsx`

**Interfaces:**
- Consumes: none (standalone page)
- Produces: Same page export. Mobile: history aside defaults to collapsed (toggle button only), form card loses border/rounded/padding for edge-to-edge layout. Desktop: unchanged two-column layout.

- [ ] **Step 1: Rewrite `app/analyze/page.tsx`**

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
  const [historyOpen, setHistoryOpen] = useState(false);
  const router = useRouter();

  async function handleStart() {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), workflow }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `请求失败 (${res.status})`);
      }
      const { sessionId } = await res.json();
      router.push(`/analyze/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败，请重试");
      setLoading(false);
    }
  }

  return (
    <main className="relative z-10 min-h-[calc(100vh-3.5rem)] flex flex-col md:flex-row">
      {/* Left: Recent history */}
      <aside className="md:w-[40%] lg:w-[35%] border-b md:border-b-0 md:border-r border-zinc-800 md:overflow-y-auto md:max-h-[calc(100vh-3.5rem)]">
        {/* Mobile: collapsible toggle */}
        <div className="md:hidden">
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span>{historyOpen ? "▾" : "▸"}</span>
              历史记录
            </span>
            <span className="text-xs text-zinc-600">最近 5 条</span>
          </button>
          {historyOpen && (
            <div className="px-4 pb-4 border-b border-zinc-800">
              <RecentAnalyses />
            </div>
          )}
        </div>
        {/* Desktop: always visible */}
        <div className="hidden md:block p-4 md:p-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-400">历史记录</h2>
            </div>
            <RecentAnalyses />
          </div>
        </div>
      </aside>

      {/* Right: Input form */}
      <section className="flex-1 flex items-start justify-center p-4 md:p-8 md:pt-12">
        <div className="w-full max-w-lg space-y-6">
          <div className="space-y-6 md:bg-zinc-900/50 md:border md:border-zinc-800 md:rounded-xl md:p-6">
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

Key changes from original:
- Added `historyOpen` state (default `false`)
- Mobile history: collapsed toggle button with ▸/▾ indicator, expandable section below
- Desktop history: wrapped in `hidden md:block` with original layout
- Form card: `bg-zinc-900/50 border border-zinc-800 rounded-xl p-6` → `md:bg-zinc-900/50 md:border md:border-zinc-800 md:rounded-xl md:p-6`

- [ ] **Step 2: Commit**

```bash
git add app/analyze/page.tsx
git commit -m "feat: collapsible history + edge-to-edge form on mobile analyze page"
```

---

### Task 5: Analyze detail page — BottomSheet data panel + md breakpoint

**Files:**
- Modify: `app/analyze/[id]/page.tsx`

**Interfaces:**
- Consumes: `BottomSheet` from `@/components/ui/BottomSheet` (Task 1), `DataPanel` from `@/components/analysis/DataPanel` (existing)
- Produces: Same page export. Desktop: sidebar at `md:w-[320px] lg:w-[440px]` (was `lg` only). Mobile: data panel moved into `<BottomSheet triggerLabel="📊 行情数据">`; 3.5rem bottom padding on main content so bottom bar doesn't overlap.

- [ ] **Step 1: Rewrite `app/analyze/[id]/page.tsx`**

```tsx
import { AnalysisHeader } from "@/components/analysis/AnalysisHeader";
import { LiveDebatePanel } from "@/components/analysis/LiveDebatePanel";
import { ConclusionCard } from "@/components/analysis/ConclusionCard";
import { DataPanel } from "@/components/analysis/DataPanel";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { getDb } from "@/lib/db/client.js";
import { AnalysisRepo } from "@/lib/db/analysis-repo.js";
import { AnalysisLiveClient } from "./client";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = new AnalysisRepo(getDb());
  const record = repo.getById(id);

  if (!record) {
    return (
      <div className="p-8 text-center text-zinc-500">分析记录不存在</div>
    );
  }

  const context = JSON.parse(record.context);
  const isRunning = record.status === "running";

  const dataPanelContent = (
    <DataPanel
      code={record.targetCode}
      name={record.targetName}
      agentConclusions={[]}
    />
  );

  return (
    <main className="h-screen flex flex-col md:flex-row bg-zinc-950">
      {/* Left: Analysis content */}
      <div className="flex-1 min-w-0 overflow-y-auto p-4 pb-16 md:pb-4">
        <AnalysisHeader
          target={{
            type: record.targetType,
            code: record.targetCode,
            name: record.targetName ?? undefined,
          }}
          workflow={record.workflowName}
          status={record.status}
        />
        {isRunning ? (
          <AnalysisLiveClient sessionId={id} />
        ) : (
          <>
            <LiveDebatePanel findings={context.findings ?? []} />
            {(() => {
              const judgeFinding = context.findings?.find((f: any) => f.agent === "judge");
              return judgeFinding ? (
                <ConclusionCard
                  conclusion={judgeFinding.analysis.conclusion}
                  reasoning={judgeFinding.analysis.reasoning}
                  sentiment={judgeFinding.analysis.sentiment}
                  confidence={judgeFinding.analysis.confidence}
                />
              ) : null;
            })()}
          </>
        )}
      </div>

      {/* Right: Data panel (desktop sidebar) */}
      <aside className="hidden md:flex md:w-[320px] lg:w-[440px] flex-shrink-0 border-l border-zinc-800 bg-zinc-950/50 overflow-y-auto">
        {dataPanelContent}
      </aside>

      {/* Mobile: BottomSheet data panel */}
      <BottomSheet triggerLabel="📊 行情数据" title="行情数据">
        {dataPanelContent}
      </BottomSheet>
    </main>
  );
}
```

Key changes:
- `lg:flex-row` → `md:flex-row`
- Sidebar `hidden lg:flex lg:w-[440px]` → `hidden md:flex md:w-[320px] lg:w-[440px]`
- Content area padding: `p-4` → `p-4 pb-16 md:pb-4` (room for mobile bottom bar)
- Added `<BottomSheet>` below sidebar with same data panel content
- Extracted `dataPanelContent` variable to avoid duplicating `<DataPanel>` props

- [ ] **Step 2: Commit**

```bash
git add app/analyze/\[id\]/page.tsx
git commit -m "feat: bottom-sheet data panel + md breakpoint on analyze detail page"
```

---

### Task 6: Session page — BottomSheet data panel + md breakpoint

**Files:**
- Modify: `app/session/[id]/page.tsx`

**Interfaces:**
- Consumes: `BottomSheet` from `@/components/ui/BottomSheet` (Task 1), `DataPanel` from `@/components/analysis/DataPanel` (existing), `ChatPanel` from `@/components/chat/ChatPanel` (existing)
- Produces: Same page export. Same pattern as Task 5: sidebar at `md:w-[320px] lg:w-[440px]`, BottomSheet on mobile.

- [ ] **Step 1: Rewrite `app/session/[id]/page.tsx`**

```tsx
import { ChatPanel } from "@/components/chat/ChatPanel.js";
import { DataPanel } from "@/components/analysis/DataPanel.js";
import { BottomSheet } from "@/components/ui/BottomSheet";
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
  } catch (err) {
    console.error("Failed to fetch session info for DataPanel:", err);
  }

  const dataPanelContent = (
    <DataPanel
      code={targetCode ?? ""}
      name={targetName}
      agentConclusions={[]}
    />
  );

  return (
    <main className="h-screen flex flex-col md:flex-row bg-zinc-950">
      {/* Left: Chat (always visible, takes remaining space) */}
      <div className="flex-1 min-w-0 flex flex-col pb-16 md:pb-0">
        <ChatPanel sessionId={id} />
      </div>

      {/* Right: Data panel (desktop sidebar) */}
      <aside className="hidden md:flex md:w-[320px] lg:w-[440px] flex-shrink-0 border-l border-zinc-800 bg-zinc-950/50 overflow-y-auto">
        {dataPanelContent}
      </aside>

      {/* Mobile: BottomSheet data panel */}
      <BottomSheet triggerLabel="📊 行情数据" title="行情数据">
        {dataPanelContent}
      </BottomSheet>
    </main>
  );
}
```

Key changes from original:
- `lg:flex-row` → `md:flex-row`
- Sidebar `hidden lg:flex lg:w-[440px]` → `hidden md:flex md:w-[320px] lg:w-[440px]`
- Added `pb-16 md:pb-0` on chat container (room for mobile bottom bar)
- Added `<BottomSheet>` with same data panel content

- [ ] **Step 2: Commit**

```bash
git add app/session/\[id\]/page.tsx
git commit -m "feat: bottom-sheet data panel + md breakpoint on session page"
```

---

### Task 7: MessageBubble mobile width adjustment

**Files:**
- Modify: `components/chat/MessageBubble.tsx`

**Interfaces:**
- Consumes: none (standalone)
- Produces: Same `<MessageBubble>` export. User messages: `max-w-[85%] sm:max-w-[75%]`. Agent messages: `max-w-[92%] sm:max-w-[80%]`. Everything else unchanged.

- [ ] **Step 1: Edit `components/chat/MessageBubble.tsx` — width classes only**

Two lines to change (lines 40 and 53 in current file):

**Line 40** — user message bubble:
```diff
- <div className="max-w-[75%] bg-blue-600/20 border border-blue-700/40 rounded-2xl rounded-br-sm px-4 py-2.5">
+ <div className="max-w-[85%] sm:max-w-[75%] bg-blue-600/20 border border-blue-700/40 rounded-2xl rounded-br-sm px-4 py-2.5">
```

**Line 53** — agent message bubble:
```diff
- <div className={`max-w-[80%] bg-zinc-900 rounded-xl border-l-4 ${sentimentBorderColor} px-4 py-3`}>
+ <div className={`max-w-[92%] sm:max-w-[80%] bg-zinc-900 rounded-xl border-l-4 ${sentimentBorderColor} px-4 py-3`}>
```

- [ ] **Step 2: Commit**

```bash
git add components/chat/MessageBubble.tsx
git commit -m "fix: wider message bubbles on mobile for better readability"
```

---

## Verification

After all tasks are complete, run through this checklist:

- [ ] `pnpm tsc --noEmit` — no TypeScript errors
- [ ] `pnpm dev` starts without errors
- [ ] **Homepage (375px viewport)**: Hero title is `text-4xl` (not overflowing), hamburger icon visible in nav, menu opens/closes on tap
- [ ] **Homepage (768px+)**: Desktop nav items visible, hamburger hidden, hero title scales up
- [ ] **/analyze (375px)**: History is collapsed with toggle button, form is edge-to-edge (no card border), tapping history toggle expands RecentAnalyses
- [ ] **/analyze (768px+)**: Two-column layout with history sidebar visible, form has card decoration
- [ ] **/analyze/[id] (375px)**: "📊 行情数据" bottom bar visible, tap opens BottomSheet with slide-up animation, overlay tap closes it, ✕ button closes it
- [ ] **/analyze/[id] (768px+)**: Data panel sidebar visible at 320px width, no bottom bar
- [ ] **/analyze/[id] (1024px+)**: Data panel sidebar at 440px width
- [ ] **/session/[id] (375px)**: Same BottomSheet behavior for data panel, chat input not obscured by bottom bar (pb-16)
- [ ] **/session/[id] (768px+)**: Sidebar visible, no bottom bar
- [ ] **Chat**: User messages use ~85% width on mobile, ~75% on desktop; agent messages ~92% on mobile, ~80% on desktop
- [ ] Body scroll is locked when BottomSheet is open, restored when closed
