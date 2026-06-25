# K线图 + 量能柱 — 实现计划

> **For agentic workers:** 使用 superpowers:subagent-driven-development (推荐) 或 superpowers:executing-plans 按任务逐步实现。步骤使用 checkbox (`- [ ]`) 语法跟踪。

**目标:** 在分析界面右侧 DataPanel 中，QuoteCard 下方新增日K线蜡烛图+量能柱，支持日/周/月切换和 MA 均线叠加。

**架构:** lightweight-charts (Canvas) 嵌入 React 组件，数据通过现有 `/api/quote/[code]` API 扩展获取，MA 由本地 `indicators.ts` 计算。DataPanel 负责数据获取和组合。

**技术栈:** React 18, Next.js 15, lightweight-charts 5.x, Tailwind CSS, Vitest

## 全局约束

- 右侧 DataPanel 宽度: `md:w-[420px] lg:w-[540px]`（从 320/440 扩充 100px）
- 图表库: `lightweight-charts`（TradingView, ~43KB gzip）
- 数据源: 复用现有 `AStockClient.market.kline()` → 百度金融 API
- MA 计算: 复用现有 `lib/data-sdk/indicators.ts` 的 `calcMA()`
- 暗色主题: 匹配现有 `bg-zinc-950` 主题
- A股配色: 涨红跌绿
- 移动端 BottomSheet 中不显示图表
- 不做自定义时间范围选择器

---

## 文件结构

```
                         ┌─────────────────────┐
                         │   DataPanel.tsx      │
                         │  (fetch + compose)   │
                         └─────────┬───────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
     ┌────────▼────────┐  ┌───────▼────────┐  ┌────────▼────────┐
     │   QuoteCard.tsx  │  │ KlineChart.tsx │  │ IndicatorList   │
     │   (unchanged)    │  │   (NEW)        │  │  (unchanged)    │
     └────────┬─────────┘  └───────┬────────┘  └─────────────────┘
              │                    │
              │           ┌───────▼────────┐
              │           │ indicators.ts  │
              │           │ calcMA()       │
              └───────────┤ (existing)     │
                          └───────┬────────┘
                                  │
                          ┌───────▼────────┐
                          │  /api/quote/   │
                          │   [code]/route │
                          │  (extended)    │
                          └───────┬────────┘
                                  │
                          ┌───────▼────────┐
                          │  AStockClient  │
                          │  .market.kline │
                          │  (existing)    │
                          └────────────────┘
```

| 文件 | 操作 | 职责 |
|---|---|---|
| `package.json` | 修改 | 添加 `lightweight-charts` 依赖 |
| `components/analysis/KlineChart.tsx` | 新建 | lightweight-charts 容器：蜡烛图+MA线+量能柱 |
| `components/analysis/DataPanel.tsx` | 修改 | 宽度扩充、K线数据获取、period tabs、组装渲染 |
| `app/api/quote/[code]/route.ts` | 修改 | 支持 `?period&count` 查询参数，返回 `bars` 字段 |
| `app/analyze/[id]/page.tsx` | 修改 | 边栏宽度: 320→420, 440→540 |
| `app/session/[id]/page.tsx` | 修改 | 边栏宽度: 320→420, 440→540 |

---

### Task 1: 安装 lightweight-charts 依赖

**文件:**
- 修改: `package.json`

**接口:**
- 产出: `lightweight-charts` 可供 import

- [ ] **Step 1: 安装依赖**

```bash
pnpm add lightweight-charts
```

- [ ] **Step 2: 验证安装**

```bash
node -e "const lc = require('lightweight-charts'); console.log('OK:', Object.keys(lc).slice(0,5))"
```

预期: `OK: [ 'color', 'createChart', 'createChartEx', ... ]`

- [ ] **Step 3: 提交**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add lightweight-charts dependency"
```

---

### Task 2: 扩展 /api/quote/[code] 路由

**文件:**
- 修改: `app/api/quote/[code]/route.ts`

**接口:**
- 消费: `KlineBar` 类型来自 `@/lib/data-sdk/types.js`
- 产出: 响应新增可选字段 `bars: KlineBar[]`；支持 `?period=daily|weekly|monthly&count=120` 查询参数

- [ ] **Step 1: 修改路由处理函数**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { AStockClient } from "@/lib/data-sdk/index.js";
import type { KlineBar } from "@/lib/data-sdk/types.js";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  try {
    const url = new URL(req.url);
    const period = (url.searchParams.get("period") as "daily" | "weekly" | "monthly") || "daily";
    const count = parseInt(url.searchParams.get("count") || "2", 10);

    const client = new AStockClient();
    const result = await client.market.kline(code, { period, count: Math.max(count, 2) });

    if (!result.data || result.data.length === 0) {
      return NextResponse.json(
        { error: "No data for this symbol" },
        { status: 404 }
      );
    }

    const bars: KlineBar[] = result.data;
    const latest = bars[bars.length - 1];
    const prev = bars.length >= 2 ? bars[bars.length - 2] : null;

    const price = latest.close;
    const change = prev ? price - prev.close : 0;
    const changePercent = prev && prev.close !== 0 ? (change / prev.close) * 100 : 0;

    const response: Record<string, unknown> = {
      symbol: code,
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      open: latest.open,
      high: latest.high,
      low: latest.low,
      volume: latest.volume,
      timestamp: Date.now(),
    };

    // Include bars when requesting more than just the latest 2 (quote-only mode)
    if (count > 2) {
      response.bars = bars;
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error(`Quote error for ${code}:`, err);
    return NextResponse.json(
      { error: "Failed to fetch quote data" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 测试 API 行为**

```bash
# 测试默认行为（兼容现有调用）
curl -s "http://localhost:3000/api/quote/000001" | head -c 200
# 预期: 返回 price, change, changePercent, open, high, low, volume — 无 bars

# 测试带 count 参数
curl -s "http://localhost:3000/api/quote/000001?count=120&period=daily" | head -c 300
# 预期: 返回上述字段 + "bars":[{...},...] 数组
```

- [ ] **Step 3: 提交**

```bash
git add app/api/quote/[code]/route.ts
git commit -m "feat: extend quote API with period/count params and bars field"
```

---

### Task 3: 加宽两侧边栏

**文件:**
- 修改: `app/analyze/[id]/page.tsx:64`
- 修改: `app/session/[id]/page.tsx:45`

**接口:**
- 消费: 无新增接口
- 产出: 边栏 CSS 类更新

- [ ] **Step 1: 修改 analyze 页面边栏宽度**

在 `app/analyze/[id]/page.tsx` 第 64 行，将:
```tsx
<aside className="hidden md:flex md:w-[320px] lg:w-[440px] flex-shrink-0 border-l border-zinc-800 bg-zinc-950/50 overflow-y-auto">
```
改为:
```tsx
<aside className="hidden md:flex md:w-[420px] lg:w-[540px] flex-shrink-0 border-l border-zinc-800 bg-zinc-950/50 overflow-y-auto">
```

- [ ] **Step 2: 修改 session 页面边栏宽度**

在 `app/session/[id]/page.tsx` 第 45 行，同样的替换:
```tsx
<aside className="hidden md:flex md:w-[420px] lg:w-[540px] flex-shrink-0 border-l border-zinc-800 bg-zinc-950/50 overflow-y-auto">
```

- [ ] **Step 3: 提交**

```bash
git add app/analyze/[id]/page.tsx app/session/[id]/page.tsx
git commit -m "style: widen sidebar from 320/440 to 420/540 for K-line chart"
```

---

### Task 4: 创建 KlineChart 组件

**文件:**
- 新建: `components/analysis/KlineChart.tsx`

**接口:**
- 消费: `KlineBar` 类型来自 `@/lib/data-sdk/types.js`
- 消费: `calcMA` 来自 `@/lib/data-sdk/indicators.js`
- 产出: `<KlineChart>` 组件 — `Props: { bars: KlineBar[]; period: Period }`
  - `Period = "daily" | "weekly" | "monthly"`

- [ ] **Step 1: 创建组件文件**

```typescript
"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
  ColorType,
} from "lightweight-charts";
import type { KlineBar } from "@/lib/data-sdk/types.js";
import { calcMA } from "@/lib/data-sdk/indicators.js";

type Period = "daily" | "weekly" | "monthly";

interface KlineChartProps {
  bars: KlineBar[];
  period: Period;
}

/** A股涨跌颜色 */
const RED = "#ef4444";
const GREEN = "#22c55e";
const BLUE = "#3b82f6";

/** MA 线配置: 周期 → 颜色 */
const MA_CONFIG: { period: number; color: string }[] = [
  { period: 5, color: "#f59e0b" },   // amber
  { period: 10, color: "#06b6d4" },  // cyan
  { period: 20, color: "#a855f7" },  // purple
  { period: 60, color: "#f97316" },  // orange
];

/** 将 "2026-06-20" 转为 lightweight-charts Time (YYYY-MM-DD) */
function toTime(dateStr: string): Time {
  // lightweight-charts 接受 "YYYY-MM-DD" 作为 BusinessDay 字符串
  return dateStr as Time;
}

export function KlineChart({ bars, period }: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const initChart = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // 计算可用高度：K线区占 65%，量能区占 35%
    const totalHeight = 380;
    const klineHeight = Math.floor(totalHeight * 0.65);
    const volumeHeight = totalHeight - klineHeight;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#a1a1aa", // zinc-400
      },
      grid: {
        vertLines: { color: "rgba(63,63,70,0.3)" },  // zinc-700/30
        horzLines: { color: "rgba(63,63,70,0.3)" },
      },
      crosshair: {
        mode: 0, // normal
        vertLine: { color: "#71717a", style: 2, width: 1, labelVisible: true },
        horzLine: { color: "#71717a", style: 2, width: 1, labelVisible: true },
      },
      rightPriceScale: {
        borderColor: "rgba(63,63,70,0.5)",
        scaleMargins: { top: 0.1, bottom: 0.3 },
      },
      timeScale: {
        borderColor: "rgba(63,63,70,0.5)",
        timeVisible: true,
        secondsVisible: false,
      },
      width: container.clientWidth,
      height: totalHeight,
    });

    // ── K线 (candlestick) ──
    const candleSeries = chart.addCandlestickSeries({
      upColor: RED,
      downColor: GREEN,
      borderDownColor: GREEN,
      borderUpColor: RED,
      wickDownColor: GREEN,
      wickUpColor: RED,
      priceScaleId: "right",
    });

    // ── 量能柱 (histogram) ──
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "", // 独立 scale
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    // ── MA 线 (line) ──
    const maSeriesArr: ISeriesApi<"Line">[] = [];
    for (const cfg of MA_CONFIG) {
      const lineSeries = chart.addLineSeries({
        color: cfg.color,
        lineWidth: 1,
        priceScaleId: "right",
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      maSeriesArr.push(lineSeries);
    }

    chartRef.current = chart;

    // 保存 series 引用到 chart 对象上以便更新数据时使用
    (chart as any)._candleSeries = candleSeries;
    (chart as any)._volumeSeries = volumeSeries;
    (chart as any)._maSeriesArr = maSeriesArr;

    // ResizeObserver: 响应容器宽度变化
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.resize(entry.contentRect.width, totalHeight);
      }
    });
    observer.observe(container);

    // 保存 observer 以便清理
    (chart as any)._observer = observer;
  }, []);

  // 首次挂载初始化
  useEffect(() => {
    initChart();
    return () => {
      const chart = chartRef.current;
      if (chart) {
        const observer = (chart as any)._observer as ResizeObserver | undefined;
        observer?.disconnect();
        chart.remove();
        chartRef.current = null;
      }
    };
  }, [initChart]);

  // 数据或 period 变化时更新
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !bars.length) return;

    const candleSeries = (chart as any)._candleSeries as ISeriesApi<"Candlestick">;
    const volumeSeries = (chart as any)._volumeSeries as ISeriesApi<"Histogram">;
    const maSeriesArr = (chart as any)._maSeriesArr as ISeriesApi<"Line">[];

    // ── K线数据 ──
    const candleData: CandlestickData[] = bars.map((bar) => ({
      time: toTime(bar.date),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));
    candleSeries.setData(candleData);

    // ── 量能数据 ──
    const volumeData: HistogramData[] = bars.map((bar, i) => ({
      time: toTime(bar.date),
      value: bar.volume,
      color: i > 0 && bar.close >= bars[i - 1].close ? RED + "66" : GREEN + "66",
    }));
    volumeSeries.setData(volumeData);

    // ── MA 线 ──
    const closes = bars.map((b) => b.close);
    for (let i = 0; i < MA_CONFIG.length; i++) {
      const { period: maPeriod } = MA_CONFIG[i];
      const lineSeries = maSeriesArr[i];
      const maValues = calcMA(closes, [maPeriod]);
      const maData: LineData[] = bars
        .map((bar, j) => {
          const val = maValues[String(maPeriod)][j];
          return val != null ? { time: toTime(bar.date), value: val } : null;
        })
        .filter((d): d is LineData => d !== null);
      lineSeries.setData(maData);
    }

    // fit content
    chart.timeScale().fitContent();
  }, [bars, period]);

  if (!bars.length) {
    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 h-[380px] flex items-center justify-center">
        <p className="text-xs text-zinc-600">暂无K线数据</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
      <div
        ref={containerRef}
        className="w-full"
        style={{ height: 380 }}
      />
    </div>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

预期: 无新增类型错误。

- [ ] **Step 3: 提交**

```bash
git add components/analysis/KlineChart.tsx
git commit -m "feat: add KlineChart component with candlestick, MA lines, and volume bars"
```

---

### Task 5: 将 KlineChart 接入 DataPanel

**文件:**
- 修改: `components/analysis/DataPanel.tsx`

**接口:**
- 消费: `<KlineChart bars={klineBars} period={period} />`
- 消费: `KlineBar` from `@/lib/data-sdk/types.js`
- 产出: DataPanel 渲染 QuoteCard → PeriodTabs → KlineChart → IndicatorList → AgentSummary

- [ ] **Step 1: 修改 DataPanel.tsx**

```typescript
"use client";
import { useEffect, useState } from "react";
import { QuoteCard } from "./QuoteCard.js";
import { IndicatorList } from "./IndicatorList.js";
import { AgentSummary } from "./AgentSummary.js";
import { KlineChart } from "./KlineChart.js";
import type { AgentConclusion } from "./types.js";
import type { KlineBar } from "@/lib/data-sdk/types.js";

type Period = "daily" | "weekly" | "monthly";

interface DataPanelProps {
  code: string;
  name?: string | null;
  agentConclusions: AgentConclusion[];
}

const PERIOD_LABELS: Record<Period, string> = {
  daily: "日K",
  weekly: "周K",
  monthly: "月K",
};

const PERIODS: Period[] = ["daily", "weekly", "monthly"];

export function DataPanel({ code, name, agentConclusions }: DataPanelProps) {
  const [klineBars, setKlineBars] = useState<KlineBar[]>([]);
  const [period, setPeriod] = useState<Period>("daily");
  const [klineLoading, setKlineLoading] = useState(true);
  const [klineError, setKlineError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setKlineLoading(true);

    async function fetchKline() {
      try {
        const res = await fetch(
          `/api/quote/${encodeURIComponent(code)}?count=120&period=${period}`
        );
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        if (!cancelled) {
          setKlineBars(data.bars ?? []);
          setKlineError(false);
        }
      } catch {
        if (!cancelled) setKlineError(true);
      } finally {
        if (!cancelled) setKlineLoading(false);
      }
    }

    fetchKline();

    return () => {
      cancelled = true;
    };
  }, [code, period]);

  return (
    <div className="w-full flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <QuoteCard code={code} name={name ?? undefined} />

      {/* Period tabs + KlineChart */}
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                period === p
                  ? "bg-blue-600 text-white"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {klineLoading && (
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 h-[380px] animate-pulse flex items-center justify-center">
            <span className="text-xs text-zinc-500">加载中</span>
          </div>
        )}

        {klineError && !klineLoading && (
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 h-[380px] flex items-center justify-center">
            <p className="text-xs text-zinc-600">K线数据暂不可用</p>
          </div>
        )}

        {!klineLoading && !klineError && (
          <KlineChart bars={klineBars} period={period} />
        )}
      </div>

      <IndicatorList indicators={null} />
      <AgentSummary agents={agentConclusions} />
    </div>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

预期: 无新增类型错误。

- [ ] **Step 3: 提交**

```bash
git add components/analysis/DataPanel.tsx
git commit -m "feat: integrate KlineChart into DataPanel with period switching"
```

---

### Task 6: 测试与验证

- [ ] **Step 1: 启动开发服务器**

```bash
pnpm dev
```

- [ ] **Step 2: 验证页面渲染**

在浏览器中:
1. 打开 `http://localhost:3000/analyze`，搜索 "000001"（平安银行）并开始分析
2. 确认右侧面板宽度已拓宽 (~420px md, ~540px lg)
3. 确认 QuoteCard 下方出现 K线图（蜡烛+MA线+量能柱）
4. 点击 "周K" / "月K" 切换，确认图表重载
5. 确认图表下方 IndicatorList 正常显示

- [ ] **Step 3: 验证会话页面**

打开任意会话页面 `http://localhost:3000/session/<id>`:
1. 确认右侧面板同样拓宽
2. 确认 K线图正常显示

- [ ] **Step 4: 验证移动端**

使用 Chrome DevTools 切换到移动端视口:
1. 确认底部 "📊 行情数据" BottomSheet 仍然可用
2. K线图不出现在 BottomSheet 中（BottomSheet 复用 DataPanel，由于 KlineChart 在 DataPanel 中，会自然显示——这是预期行为，移动端可以滚动查看）

- [ ] **Step 5: 运行现有测试**

```bash
pnpm test
```

预期: 所有现有测试通过。

- [ ] **Step 6: 最终提交**

```bash
git add -A
git commit -m "test: verify K-line chart integration"
```
