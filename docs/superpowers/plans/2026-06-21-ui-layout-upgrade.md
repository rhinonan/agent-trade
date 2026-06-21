# UI 排版布局升级 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AgentTrade Web 前端从堆叠平铺布局升级为分组卡片侧边栏 + 时间线主内容区的专业排版，使用 8px 网格间距系统。

**Architecture:** 纯 CSS/Template 排版改造。App.vue 新增 spacing CSS 变量 + 分隔线样式；InputPanel 拆分为三组玻璃卡片；FlowView 去流程外层玻璃包裹 + 添加渐变分隔线；LiveLog 增高；ReportView 统一玻璃面板 + 深色标题栏；FindingList 改为 2 列网格；ConclusionCard 侧边竖线替代顶部辉光。

**Tech Stack:** Vue 3, Tailwind CSS v4, CSS 自定义属性

## 全局约束

- 不修改任何 `.ts` / `<script>` 逻辑（除非 explicitly 需要新增纯展示用的 helper 函数）
- 不修改组件 props/emits 接口
- 不修改 Pinia store
- 不修改 WebSocket 连接
- 保留现有色彩系统 CSS 变量（仅新增 spacing 变量和分隔线样式）
- 保留现有动画 keyframes
- 保留 `.glass-panel` `.glass-panel-glow` 基础样式

---

### Task 1: App.vue — spacing 变量 + 分隔线 + 侧边栏宽度

**Files:**
- Modify: `packages/web/src/App.vue`

**Consumes:** 现有 CSS 变量和样式
**Produces:** `--space-xs` 到 `--space-xl` 变量；`.divider-cyan` 分隔线类；sidebar `w-84`

- [ ] **Step 1: 新增 spacing 变量和分隔线样式**

在 `App.vue` 的 `<style>` 中 `:root {}` 块末尾添加 spacing 变量，在 scrollbar 块后添加分隔线样式。

`:root` 追加:
```css
  --space-xs: 8px;
  --space-sm: 12px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
```

scrollbar 块后追加:
```css
/* divider */
.divider-cyan {
  height: 1px;
  border: none;
  background: linear-gradient(90deg, var(--cyan), transparent 60%);
  margin: 0;
}

/* card group title */
.card-group-title {
  color: var(--text-secondary);
  font-size: 14px;
  letter-spacing: 0.03em;
  font-weight: 600;
  margin-bottom: var(--space-sm);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--border-default);
}
```

- [ ] **Step 2: 侧边栏宽度改为 w-84**

`<template>` 中 `<aside class="w-80 min-w-80 ...">` 改为:
```html
<aside class="w-84 min-w-84 border-r p-6 overflow-y-auto" style="background: var(--bg-surface-glass); border-color: var(--border-default);">
```

- [ ] **Step 3: 验证编译**

```bash
cd packages/web && npx vue-tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/App.vue
git commit -m "feat(web): add spacing CSS variables, divider style, and sidebar width increase"
```

---

### Task 2: StepProgress — 轻量化胶囊 + 同行标题

**Files:**
- Modify: `packages/web/src/components/StepProgress.vue`

**Consumes:** CSS 变量 from App.vue
**Produces:** 轻量步骤条，~48px 高

- [ ] **Step 1: 替换 StepProgress 模板**

将 `<h2>` 标题移到步骤条同行，胶囊缩小，去掉 `glass-panel` 类。

`packages/web/src/components/StepProgress.vue`:

```vue
<template>
  <div>
    <div class="flex items-center gap-4">
      <h2 class="text-sm font-semibold whitespace-nowrap" style="color: var(--text-primary); letter-spacing: 0.02em;">分析流程</h2>
      <div v-if="steps.length === 0" class="text-center flex-1" style="color: var(--text-muted); font-size: 13px;">
        等待分析开始...
      </div>
      <div v-else class="flex flex-wrap items-center gap-1 flex-1">
        <template v-for="(step, index) in steps" :key="step.id">
          <div v-if="index > 0" class="flex items-center mx-0.5">
            <span class="w-3 h-px" style="background: var(--border-default);"></span>
            <span class="text-xs ml-0.5" style="color: var(--text-muted);">▸</span>
          </div>
          <div
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-md min-w-[120px] transition-all duration-300 border"
            :style="stepStyle(step)"
          >
            <span
              class="inline-block w-2 h-2 rounded-full flex-shrink-0"
              :style="dotStyle(step)"
            ></span>
            <span class="text-[12px] font-semibold" style="color: var(--text-primary);">{{ step.id }}</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { StepState } from "@/stores/analysis";

const props = defineProps<{ steps: StepState[] }>();

function dotStyle(step: StepState): Record<string, string> {
  switch (step.status) {
    case "complete": return { background: "var(--teal)", boxShadow: "0 0 6px var(--teal)" };
    case "running": return { background: "var(--cyan)", boxShadow: "0 0 10px var(--cyan)", animation: "glow-pulse 1.2s ease-in-out infinite" };
    case "error": return { background: "var(--rose)", boxShadow: "0 0 8px var(--rose)", animation: "shake 0.3s ease-in-out" };
    default: return { background: "var(--text-muted)" };
  }
}

function stepStyle(step: StepState): Record<string, string> {
  const base: Record<string, string> = { background: "rgba(13, 21, 37, 0.4)" };
  switch (step.status) {
    case "running": return { ...base, borderColor: "var(--cyan)", boxShadow: "var(--shadow-active)", animation: "fade-in 0.3s ease-out" };
    case "complete": return { ...base, borderColor: "rgba(0, 229, 160, 0.3)" };
    case "error": return { ...base, borderColor: "rgba(255, 68, 102, 0.4)" };
    default: return { ...base, borderColor: "var(--border-default)" };
  }
}
</script>
```

关键变化:
- 标题和步骤同行 (`flex items-center gap-4`)
- 胶囊缩小: `px-3 py-1.5` `text-[12px]`
- 连接线缩短: `w-3`
- 去掉 `glass-panel` 类，改用透明背景 `rgba(13,21,37,0.4)` + 边框
- 去掉步骤 `type` 和 `agentIds` 显示（只保留 `id`）

- [ ] **Step 2: 验证编译**

```bash
cd packages/web && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/StepProgress.vue
git commit -m "feat(web): lighten StepProgress — inline title, smaller capsules, no glass wrap"
```

---

### Task 3: LiveLog — 增高到 h-80

**Files:**
- Modify: `packages/web/src/components/LiveLog.vue`

- [ ] **Step 1: 日志容器高度 h-60 → h-80**

在 `LiveLog.vue` 中，将 `h-60` 替换为 `h-80`:

```vue
<div
  ref="logContainer"
  class="h-80 overflow-y-auto p-3 rounded-lg font-mono text-xs leading-relaxed relative"
  ...
>
```

其余模板和脚本不变。

- [ ] **Step 2: 验证编译**

```bash
cd packages/web && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/LiveLog.vue
git commit -m "feat(web): increase LiveLog height from h-60 to h-80"
```

---

### Task 4: FlowView — 去步骤外层玻璃 + 加分隔线

**Files:**
- Modify: `packages/web/src/components/FlowView.vue`

**Consumes:** `.divider-cyan` from App.vue; Task 2 StepProgress; Task 3 LiveLog

- [ ] **Step 1: 替换 FlowView 模板**

`packages/web/src/components/FlowView.vue`:

```vue
<template>
  <div class="p-6 flex flex-col flex-1">
    <!-- 流程条：轻量，无玻璃包裹 -->
    <StepProgress :steps="store.steps" />

    <!-- 分隔线：流程 → 日志 -->
    <div class="divider-cyan my-6"></div>

    <!-- 日志区：玻璃包裹 -->
    <div class="glass-panel p-5">
      <LiveLog :logs="store.logs" :is-running="store.isRunning" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAnalysisStore } from "@/stores/analysis";
import StepProgress from "./StepProgress.vue";
import LiveLog from "./LiveLog.vue";

const store = useAnalysisStore();
</script>
```

关键变化:
- Page padding: `p-5` → `p-6` (24px)
- StepProgress 去掉 `glass-panel-glow` 包裹，直接放置
- 流程→日志间添加 `divider-cyan my-6` (24px)
- LiveLog 保留 `glass-panel` 包裹
- 去掉 `gap-6` (改用分隔线自己控制间距)

- [ ] **Step 2: 验证编译**

```bash
cd packages/web && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/FlowView.vue
git commit -m "feat(web): restructure FlowView — remove step glass wrap, add cyan divider"
```

---

### Task 5: InputPanel — 三组卡片重构

**Files:**
- Modify: `packages/web/src/components/InputPanel.vue`

**Consumes:** `.card-group-title`, `.glass-panel` from App.vue; StockInput, SectorInput, WorkflowSelect, ModelSelect

- [ ] **Step 1: 替换 InputPanel 模板**

`packages/web/src/components/InputPanel.vue`:

```vue
<template>
  <div>
    <h2
      class="text-base font-semibold mb-5 pb-2.5 border-b"
      style="color: var(--text-primary); border-color: var(--border-default); letter-spacing: 0.02em;"
    >分析参数</h2>

    <!-- 组1: 分析目标 -->
    <div class="glass-panel p-4 mb-4">
      <div class="card-group-title">分析目标</div>
      <StockInput v-model="stockCode" />
      <SectorInput v-model="sectorName" />
    </div>

    <!-- 组2: 模型配置 -->
    <div class="glass-panel p-4 mb-4">
      <div class="card-group-title">模型配置</div>
      <WorkflowSelect v-model="selectedWorkflow" />
      <ModelSelect
        v-model:provider="selectedProvider"
        v-model:model="selectedModel"
      />
    </div>

    <!-- 组3: 操作 -->
    <div class="glass-panel p-4">
      <div class="card-group-title">操作</div>

      <div v-if="error" class="px-3 py-2.5 mb-3 rounded-md text-[13px]" style="background: rgba(255, 68, 102, 0.08); border: 1px solid rgba(255, 68, 102, 0.4); color: var(--rose);">{{ error }}</div>

      <button
        class="w-full p-3 border-none rounded-md text-white text-[15px] font-semibold cursor-pointer transition-all mb-3 relative overflow-hidden"
        :disabled="isRunning || !canStart"
        :style="isRunning
          ? { background: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'not-allowed', border: '1px solid var(--border-default)' }
          : { background: 'linear-gradient(135deg, var(--cyan), #0088aa)', boxShadow: 'var(--shadow-strong)' }
        "
        @click="startAnalysis"
        @mouseenter="(e) => { if (!isRunning && canStart) { (e.target as HTMLElement).style.boxShadow = '0 0 24px rgba(0,212,255,0.55)'; (e.target as HTMLElement).style.transform = 'scale(1.02)'; } }"
        @mouseleave="(e) => { if (!isRunning && canStart) { (e.target as HTMLElement).style.boxShadow = 'var(--shadow-strong)'; (e.target as HTMLElement).style.transform = 'scale(1)'; } }"
      >
        <span v-if="isRunning" class="inline-flex items-center gap-2">
          <span class="inline-block w-4 h-4 border-2 rounded-full" style="border-color: var(--text-muted); border-top-color: transparent; animation: spin-ring 0.8s linear infinite;"></span>
          分析中...
        </span>
        <span v-else>▶ 开始分析</span>
      </button>

      <!-- 细线进度条 -->
      <div v-if="isRunning && steps.length > 0" class="mb-3">
        <div class="flex justify-between text-[11px] mb-1" style="color: var(--text-secondary);">
          <span>步骤 {{ completedSteps }}/{{ steps.length }}</span>
          <span>{{ Math.round((completedSteps / steps.length) * 100) }}%</span>
        </div>
        <div class="h-1 rounded-full overflow-hidden" style="background: var(--border-default);">
          <div
            class="h-full rounded-full transition-all duration-500"
            style="background: linear-gradient(90deg, var(--cyan), var(--teal)); box-shadow: 0 0 6px rgba(0, 212, 255, 0.3);"
            :style="{ width: (completedSteps / steps.length * 100) + '%' }"
          ></div>
        </div>
      </div>

      <button
        v-if="status === 'complete' || status === 'error'"
        class="glass-panel w-full p-2.5 text-sm cursor-pointer transition-all hover:border-[var(--cyan)] hover:text-[var(--cyan)]"
        style="color: var(--text-secondary);"
        @click="store.reset()"
      >
        ↻ 新分析
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// 脚本完全不变，保持现有逻辑
import { ref, computed } from "vue";
import StockInput from "./StockInput.vue";
import SectorInput from "./SectorInput.vue";
import WorkflowSelect from "./WorkflowSelect.vue";
import ModelSelect from "./ModelSelect.vue";
import { useAnalysisStore } from "@/stores/analysis";
import { useAnalysisSocket } from "@/composables/useAnalysisSocket";

const store = useAnalysisStore();
const { connect: connectWS, disconnect: disconnectWS } = useAnalysisSocket();

const stockCode = ref("");
const sectorName = ref("");
const selectedWorkflow = ref("bull-bear");
const selectedProvider = ref("deepseek");
const selectedModel = ref("");
const error = ref<string | null>(null);

const isRunning = computed(() => store.isRunning);
const status = computed(() => store.status);
const steps = computed(() => store.steps);

const completedSteps = computed(() => steps.value.filter(s => s.status === "complete").length);

const canStart = computed(() => {
  return stockCode.value.trim() || sectorName.value.trim();
});

async function startAnalysis() {
  error.value = null;
  store.reset();

  try {
    const body: Record<string, string> = {
      workflow: selectedWorkflow.value,
      provider: selectedProvider.value,
    };
    if (selectedModel.value) body.model = selectedModel.value;
    if (stockCode.value.trim()) body.code = stockCode.value.trim();
    if (sectorName.value.trim()) body.sector = sectorName.value.trim();

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      error.value = data.message ?? "请求失败";
      return;
    }

    store.sessionId = data.sessionId;
    connectWS(data.sessionId);

    setTimeout(async () => {
      const statusRes = await fetch(`/api/analyze/${data.sessionId}`);
      const statusData = await statusRes.json();
      if (statusData.status === "error") {
        store.handleError({ message: statusData.error ?? "分析失败" });
      }
    }, 500);
  } catch (err: any) {
    error.value = err.message ?? "网络错误";
    store.handleError({ message: error.value! });
  }
}
</script>
```

关键变化:
- 三组 `glass-panel p-4 mb-4` 包裹
- 每组用 `card-group-title` 标题
- 进度从文字 "进度: 3/5 步骤" 改为细线渐变进度条 + 百分比
- 错误提示移到按钮上方
- 脚本完全不变

- [ ] **Step 2: 验证编译**

```bash
cd packages/web && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/InputPanel.vue
git commit -m "feat(web): restructure InputPanel into three card groups with slim progress bar"
```

---

### Task 6: FindingList — 2 列网格 + 紧凑卡片

**Files:**
- Modify: `packages/web/src/components/FindingList.vue`

- [ ] **Step 1: 替换 FindingList 模板**

`packages/web/src/components/FindingList.vue`:

```vue
<template>
  <div class="mb-6">
    <h3 class="text-[15px] font-semibold mb-3.5" style="color: var(--text-primary); letter-spacing: 0.02em;">各方观点</h3>
    <div class="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
      <div
        v-for="(f, i) in findings"
        :key="i"
        class="glass-panel p-3 relative"
        style="overflow: hidden; animation: fade-in 0.3s ease-out;"
      >
        <!-- left accent bar -->
        <div
          class="absolute left-0 top-0 bottom-0 w-[3px]"
          :style="{ background: accentColor(f.sentiment), boxShadow: '0 0 8px ' + accentColor(f.sentiment) }"
        ></div>
        <div class="flex justify-between mb-1.5 pl-1">
          <span class="text-[12px] font-semibold" style="color: var(--cyan);">{{ f.agent }}</span>
          <span class="text-[11px] font-mono" style="color: var(--text-secondary);">{{ Math.round(f.confidence * 100) }}%</span>
        </div>
        <p class="text-[13px] leading-relaxed mb-1 pl-1" style="color: var(--text-primary);">{{ f.conclusion }}</p>
        <ul v-if="f.reasoning && f.reasoning.length > 0" class="mt-1.5 pl-[14px]">
          <li v-for="(r, j) in f.reasoning" :key="j" class="text-[12px] mb-0.5" style="color: var(--text-secondary); list-style: '▸ ';">
            {{ r }}
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Finding } from "@/stores/analysis";

defineProps<{ findings: Finding[] }>();

function accentColor(sentiment: string): string {
  switch (sentiment) {
    case "bullish": return "var(--teal)";
    case "bearish": return "var(--rose)";
    default: return "var(--text-secondary)";
  }
}
</script>
```

关键变化:
- 外层添加 `<div class="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">`
- 卡片内间距缩小: `p-3.5` → `p-3`, 字体 `text-[13px]` → `text-[12px]`
- `mb-2` 缩小为 `mb-1.5`

- [ ] **Step 2: 验证编译**

```bash
cd packages/web && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/FindingList.vue
git commit -m "feat(web): change FindingList to 2-column grid with compact cards"
```

---

### Task 7: ConclusionCard — 左侧竖线替代顶部辉光

**Files:**
- Modify: `packages/web/src/components/ConclusionCard.vue`

- [ ] **Step 1: 替换 ConclusionCard 模板**

`packages/web/src/components/ConclusionCard.vue`:

```vue
<template>
  <div class="glass-panel p-[18px] flex gap-3" style="overflow: hidden;">
    <!-- left accent bar -->
    <div
      class="w-[3px] flex-shrink-0 rounded-full self-stretch"
      style="background: linear-gradient(180deg, var(--cyan), var(--teal)); box-shadow: 0 0 8px rgba(0, 212, 255, 0.4);"
    ></div>
    <div class="flex-1">
      <h3 class="text-[15px] font-semibold mb-3" style="color: var(--cyan); letter-spacing: 0.02em;">综合研判</h3>
      <div class="text-sm leading-relaxed whitespace-pre-wrap" style="color: var(--text-primary);">
        <p>{{ conclusion }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ conclusion: string }>();
</script>
```

关键变化:
- 去掉 `glass-panel-glow` 类（和顶部辉光线）
- 改为 `flex gap-3` 布局：左侧 3px 竖线 + 右侧内容
- 竖线: 青蓝→青绿纵向渐变 + 辉光 `box-shadow`
- 竖线加 `rounded-full` 使两端圆滑

- [ ] **Step 2: 验证编译**

```bash
cd packages/web && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/ConclusionCard.vue
git commit -m "feat(web): redesign ConclusionCard with left vertical accent bar instead of top glow"
```

---

### Task 8: ReportView — 统一玻璃面板 + 深色标题栏

**Files:**
- Modify: `packages/web/src/components/ReportView.vue`

- [ ] **Step 1: 替换 ReportView 模板**

`packages/web/src/components/ReportView.vue`:

```vue
<template>
  <div v-if="store.report" class="px-6 pb-6" style="animation: fade-in 0.4s ease-out;">
    <!-- 分隔线 -->
    <div class="divider-cyan mb-8"></div>

    <!-- 统一玻璃面板 -->
    <div class="glass-panel overflow-hidden">
      <!-- 深色标题栏 -->
      <div
        class="flex items-center justify-between px-6 py-4 border-b"
        style="background: #0a1220; border-color: var(--border-default);"
      >
        <h2 class="text-base font-semibold" style="color: var(--text-primary); letter-spacing: 0.02em;">
          分析报告
        </h2>
        <span class="text-sm font-mono px-3 py-1 rounded-full" style="color: var(--cyan); background: rgba(0, 212, 255, 0.08); border: 1px solid rgba(0, 212, 255, 0.2);">
          {{ store.report.target.name ?? store.report.target.code }}
        </span>
      </div>

      <!-- 报告内容 -->
      <div class="p-6">
        <div class="grid grid-cols-[280px_1fr] gap-6 max-[900px]:grid-cols-1">
          <SentimentChart :sentiments="store.report.sentiments" />
          <FindingList :findings="store.report.findings" />
        </div>
        <ConclusionCard
          v-if="store.report.conclusion"
          :conclusion="store.report.conclusion"
        />
      </div>
    </div>
  </div>
  <div v-else class="px-5 py-6" style="border-top: 1px solid var(--border-default);">
    <p class="text-sm" style="color: var(--text-secondary);">等待分析完成...</p>
  </div>
</template>

<script setup lang="ts">
import { useAnalysisStore } from "@/stores/analysis";
import SentimentChart from "./SentimentChart.vue";
import FindingList from "./FindingList.vue";
import ConclusionCard from "./ConclusionCard.vue";

const store = useAnalysisStore();
</script>
```

关键变化:
- 外层 `divider-cyan mb-8` 分隔（与日志区 32px 间距）
- 统一 `glass-panel` 包裹整个报告
- 深色标题栏 `bg-[#0a1220]`，左侧 "分析报告" + 右侧标的 pill 徽章
- 内容区 `p-6`
- 去掉标题中的 emoji 前缀
- `waiting` 状态模板不变

- [ ] **Step 2: 验证编译**

```bash
cd packages/web && npx vue-tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/ReportView.vue
git commit -m "feat(web): redesign ReportView with unified glass panel and dark title bar"
```

---

### Task 9: 最终验证与构建

**Files:**
- 全部已修改的 Vue 组件

- [ ] **Step 1: TypeScript 类型检查**

```bash
cd packages/web && npx vue-tsc --noEmit 2>&1
```

预期: 无输出（无错误）

- [ ] **Step 2: 生产构建**

```bash
cd packages/web && npx vite build 2>&1
```

预期: `✓ built in Xms`，无错误

- [ ] **Step 3: 运行测试**

```bash
cd packages/web && npx vitest run 2>&1
```

预期: `6 passed`

- [ ] **Step 4: 视觉检查清单**

启动 dev server 后逐项检查:
- [ ] 侧边栏: 三组玻璃卡片，间距 16px，细线进度条
- [ ] 分析流程: 标题同行，胶囊缩小，无玻璃包裹
- [ ] 流程→日志: 青蓝渐变分隔线 24px
- [ ] 日志: 增高到 320px，玻璃包裹
- [ ] 日志→报告: 青蓝渐变分隔线 32px
- [ ] 报告: 统一玻璃面板，深色标题栏，标的 pill
- [ ] 各方观点: 2 列网格
- [ ] 综合研判: 左侧竖线

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "chore(web): final verification — typecheck, build, and tests pass for layout upgrade"
```
