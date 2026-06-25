# K线图 + 量能柱 — 分析页面右侧面板

**日期**: 2026-06-25  
**状态**: 已批准

## 概述

在分析界面（`/analyze/[id]`）和会话界面（`/session/[id]`）的右侧 DataPanel 中，QuoteCard（文字报价）下方新增日K线蜡烛图 + 量能柱，支持日/周/月周期切换，叠加 MA 均线。

## 数据源

数据管线已完全就绪，无需新增：

- **K 线数据**: `AStockClient.market.kline({ period, count })` → 百度金融 API，返回 `KlineBar[]`
- **指标计算**: `lib/data-sdk/indicators.ts` — MA(period) 本地计算
- **类型**: `KlineBar { date, open, high, low, close, volume, amount }` 已定义于 `lib/data-sdk/types.ts`

## 图表库

**lightweight-charts** (TradingView 出品):
- Canvas 渲染，43KB gzip
- 内置蜡烛图、柱状图、十字光标、缩放/平移
- 暗色主题友好
- 窄宽度 (420-540px) 下表现良好

## 布局改动

右侧 DataPanel 宽度从 `md:w-[320px] lg:w-[440px]` 扩充至 `md:w-[420px] lg:w-[540px]`。

```
DataPanel (flex-col, overflow-y-auto)
├── QuoteCard              ← 保留不改
├── Period Tabs            ← 新增: [日K | 周K | 月K] 小标签
├── KlineChart (~280-320px)← 新增: lightweight-charts 蜡烛 + MA5/10/20/60
├── VolumeChart (~80-100px)← 新增: 量能柱（涨红跌绿，共用时间轴）
├── IndicatorList           ← 保留不改
└── AgentSummary            ← 保留不改
```

## 组件拆分

### 新增: `components/analysis/KlineChart.tsx`

单一组件，封装 lightweight-charts 实例生命周期：

- **Props**: `{ bars: KlineBar[]; period: "daily" | "weekly" | "monthly"; maPeriods?: number[] }`
- **内部**: 管理 chart + candlestickSeries + volumeSeries + MA line series
- **图表配置**:
  - 暗色主题背景 (`#0f0f23` 或匹配现有 dark 主题)
  - 涨红跌绿（A 股配色）
  - 十字光标 (crosshair)
  - 缩放/平移 (默认启用)
  - 响应式宽度（跟随容器 resize）
- **清理**: useEffect return 中 `chart.remove()` 防止内存泄漏

### 修改: `components/analysis/DataPanel.tsx`

- 宽度类名: `md:w-[420px] lg:w-[540px]`
- 新增 K 线数据状态: `useState<KlineBar[]>([])` + `useState<Period>("daily")`
- 数据获取: 可复用 `QuoteCard` 的 `/api/quote/[code]` 扩展返回 `bars`，或独立 `useEffect` 调用 data-sdk
- 渲染顺序: QuoteCard → PeriodTabs → KlineChart → IndicatorList → AgentSummary

### 修改: `app/api/quote/[code]/route.ts`

扩展响应 JSON:

```diff
- { symbol, price, change, changePercent, open, high, low, volume, timestamp }
+ { symbol, price, change, changePercent, open, high, low, volume, timestamp, bars: KlineBar[] }
```

GET 参数新增 `period` (可选，默认 daily) 和 `count` (可选，默认 120)。

## 状态覆盖

| 状态 | 处理 |
|---|---|
| **加载中** | 图表区域显示骨架屏占位 (与 QuoteCard skeleton 风格一致) |
| **空数据** | 图表区域显示 "暂无K线数据" 空态 |
| **错误** | 静默降级 — 图表区域隐藏，不影响 QuoteCard 和 IndicatorList 正常展示 |
| **实时更新** | 复用 5s 轮询，仅更新最新 bar（不重绘全图），避免闪烁 |
| **Resize** | lightweight-charts 内置 `chart.resize()` 监听容器尺寸 |
| **数据不足** (新上市股票 K 线 < 20 条) | 正常渲染所有可用 bar，MA 线仅在数据足够时显示 |

## 不做（YAGNI）

- 不改变 QuoteCard 和 IndicatorList 的任何逻辑
- 不做自定义时间范围选择器（保持 period tabs 简单切换）
- 不做数据导出/截图
- 不做移动端图表适配（BottomSheet 中不显示图表）

## 测试要点

- `KlineChart` 组件: 渲染 chart 容器、数据注入、period 切换重绘、卸载清理
- `DataPanel`: 宽度断言、图表在 QuoteCard 下方出现、空态/错误态降级
- `/api/quote/[code]` 路由: 返回 `bars` 字段、period 参数生效
