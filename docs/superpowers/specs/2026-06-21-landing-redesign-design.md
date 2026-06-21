# Landing Page 重设计 — 两态布局 + PrimeVue 集成

## 概述

将 AgentTrade Web 前端从「左侧参数面板 + 右侧内容区」的静态布局，重构为两态布局：
- **Landing 态**：居中搜索式入口，仅一个输入框 + 流程选择
- **工作态**：header 下方飞入状态条 + 流式分析内容区

同时集成 PrimeVue（Unstyled 模式）替代原始表单组件，统一暗色玻璃拟态美学。

---

## 两态布局

### Landing 态（status === "idle"）

```
┌──────────────────────────────────────────────────┐
│  [AgentTrade] [ALPHA]  多Agent对抗行情分析        │  ← AppHeader
│                                                  │
│                                                  │
│           ┌ 个股分析 ─┼─ 板块分析 ─┐              │  ← PrimeVue Tabs
│           │                        │              │
│           │  🔍 输入代码/名称…     │              │  ← PrimeVue AutoComplete
│           │  下拉补全列表          │              │
│           │                        │              │
│           │  流程: 牛熊对抗 ▾      │              │  ← PrimeVue Select
│           │                        │              │
│           │     [▶ 开始分析]        │              │
│           │                        │              │
│                                                  │
│                                                  │
└──────────────────────────────────────────────────┘
```

- 所有元素垂直居中（`min-h-screen flex flex-col justify-center items-center`）
- 四周大量留白（至少 `py-20` 上下空间）
- 点击"开始分析"后触发 Landing → Working 过渡动画

### 工作态（status === "running" | "complete" | "error"）

```
┌──────────────────────────────────────────────────┐
│  [AgentTrade] [ALPHA]  多Agent对抗行情分析        │
├──────────────────────────────────────────────────┤
│  ◆ 600519 贵州茅台 | 牛熊对抗 (Bull-Bear)         │  ← AnalysisStatusBar（飞入）
├──────────────────────────────────────────────────┤
│                                                  │
│  分析流程  ▸ gather  ▸ analyze  ▸ debate  ▸ ...   │  ← StepProgress
│  ────────────────────────────────────────        │
│  ┌──────────────┐ ┌──────────────────────────┐   │
│  │ LiveLog      │ │ ReportView               │   │
│  │              │ │  - SentimentChart         │   │
│  │              │ │  - FindingList            │   │
│  │              │ │  - ConclusionCard         │   │
│  └──────────────┘ └──────────────────────────┘   │
│                                                  │
└──────────────────────────────────────────────────┘
```

- 取消侧边栏，全部改为纵向流式布局
- 内容区统一 `px-10` ~ `px-14` 留白
- 状态条从页面中心飞入到 header 下方

---

## 组件变更

### 新增

| 组件 | 职责 |
|------|------|
| `LandingView.vue` | idle 态居中搜索区，含 Tabs + AutoComplete + Select + 按钮 |
| `AnalysisStatusBar.vue` | header 下方状态条，显示目标名称 + 工作流名称，带飞入动画 |
| `WorkspaceView.vue` | 工作态内容容器，编排 StepProgress + LiveLog + ReportView |

### 删除

| 文件 | 原因 |
|------|------|
| `InputPanel.vue` | 功能拆分到 LandingView + WorkspaceView |
| `StockInput.vue` | 被 AutoComplete + Tabs 替代 |
| `SectorInput.vue` | 被 AutoComplete + Tabs 替代 |
| `WorkflowSelect.vue` | 被 PrimeVue Select 替代 |
| `ModelSelect.vue` | 模型选择合并到 WorkspaceView 展开区 |
| `FlowView.vue` | 内容提升到 WorkspaceView |

### 保留（微调）

| 组件 | 变更 |
|------|------|
| `AppHeader.vue` | 样式微调，移除底部发光条（留给状态条） |
| `StepProgress.vue` | 无变更 |
| `LiveLog.vue` | 无变更 |
| `ReportView.vue` | 增加留白 |
| `SentimentChart.vue` | 无变更 |
| `FindingList.vue` | 无变更 |
| `ConclusionCard.vue` | 无变更 |
| `MarkdownRenderer.vue` | 无变更 |

---

## PrimeVue 集成方案

### 安装

```bash
pnpm --filter @agenttrade/web add primevue @primevue/themes
```

### 配置（main.ts）

```ts
import PrimeVue from 'primevue/config'

app.use(PrimeVue, {
  unstyled: true,  // Unstyled 模式 — 组件无样式，全部由 Tailwind 控制
})
```

Unstyled 模式下 PrimeVue 只提供组件逻辑（键盘导航、无障碍、选项过滤），样式通过 `pt` (Pass Through) 属性传入 Tailwind class，与现有 `--cyan` / `--bg-root` / `glass-panel` 体系无缝融合。

### 使用的 PrimeVue 组件

| 组件 | 用途 | pt 样式策略 |
|------|------|-----------|
| `Tabs` | 个股/板块切换 | tab 激活态下划线用 `--cyan` 色 |
| `AutoComplete` | 输入补全（股票/板块） | input 复用 `.input-field`，panel 用 `glass-panel` |
| `Select` | 分析工作流选择 | 复用 `.select-field` 样式 |
| `Button` | 开始分析 / 新分析 | 复用现有按钮渐变样式 |

---

## 动画设计

### Landing → Working 过渡（约 600ms）

| 阶段 | 时间 | 动画 |
|------|------|------|
| LandingView 消失 | 0–300ms | `fadeOutUp` — 向上淡出 60px，opacity 1→0 |
| StatusBar 飞入 | 150–600ms | `flyFromCenter` — 从页面中心缩放到目标位置 |
| WorkspaceView 出现 | 300–600ms | `fadeIn` — 淡入 + translateY(4px→0) |

### 技术实现

- 提交时 JS 读取 LandingView 输入框 `getBoundingClientRect()` 作为动画起点
- StatusBar `onMounted` 时读取自身 `getBoundingClientRect()` 作为终点
- 通过 CSS 自定义属性 `--fly-start-x/y` / `--fly-end-x/y` 驱动 keyframes
- `will-change: transform` 保证 60fps

### Working → Landing（重置）

直接 `store.reset()` 触发 `v-if` 切换，LandingView 以 `fadeIn` 进入，不需要反向飞入。

---

## 自动补全数据源

### 个股模式

1. 聚焦时展示本地热门股票列表（前端硬编码，~20 条常见 A 股）
2. 输入 ≥1 字符时调用 `GET /reference/search?keyword=xxx`（后端已有 stub，需实现）

### 板块模式

1. 聚焦时调用 `GET /sector/list` 获取板块列表
2. 输入时在前端本地过滤（数据量小，无需远程搜索）

### 本地热门股票（前端内置）

```ts
const HOT_STOCKS = [
  { code: '600519', name: '贵州茅台' },
  { code: '300750', name: '宁德时代' },
  { code: '000858', name: '五粮液' },
  { code: '601318', name: '中国平安' },
  { code: '000333', name: '美的集团' },
  { code: '002594', name: '比亚迪' },
  // ... ~20 条
]
```

---

## 留白标准

| 区域 | 当前 | 目标 |
|------|------|------|
| 内容区水平 padding | `p-7` (28px) | `px-10` ~ `px-14` (40–56px) |
| 内容区垂直 padding | `p-7` (28px) | `py-10` (40px) |
| Landing 居中区 | 无 | `py-20` min (80px 上下) |
| 状态条水平 padding | 无 | `px-10` (40px) |

---

## Store 扩展（analysis.ts）

新增字段：

```ts
targetType: ref<'stock' | 'sector'>('stock')       // 当前分析模式
suggestions: ref<Array<{code: string; name: string}>>([])  // 补全列表
```

---

## 不纳入本次范围

- 模型选择器（ModelSelect）暂时移除，后续版本恢复为 WorkspaceView 中的折叠面板
- 后端 `/reference/search` 完整实现（留 stub，前端用本地数据兜底）
- PrimeVue `definePreset` 深度主题定制（先用 unstyled + Tailwind，后续迭代）
