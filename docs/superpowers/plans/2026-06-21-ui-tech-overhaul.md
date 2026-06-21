# UI 科技感升级 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AgentTrade Web 前端从 GitHub Dark 风格的纯功能界面升级为深海军蓝 + 青蓝玻璃 + 辉光的 Futuristic Finance 视觉风格。

**Architecture:** 纯 CSS/Tailwind 样式改造。在 `App.vue` 全局 `<style>` 中定义 CSS 变量、动画 keyframes、滚动条样式；各组件模板 class 替换为新的颜色/效果值。不修改任何组件逻辑、store、WebSocket、布局骨架。

**Tech Stack:** Vue 3, Tailwind CSS v4 (任意值语法), CSS 自定义属性, CSS animations

## 全局约束

- 颜色参考: `docs/superpowers/visual-reference.md`
- 不修改任何 `.ts` / `<script>` 逻辑
- 不修改组件 props/emits 接口
- 不修改 Pinia store
- 不修改 WebSocket 连接
- 保留现有布局骨架 (侧边栏 + 主内容区)
- 所有颜色使用 Tailwind v4 任意值语法或 CSS 变量

---

### Task 1: 全局样式基础 (App.vue)

**Files:**
- Modify: `packages/web/src/App.vue` (template + style)

**Produces:** CSS 变量 `--cyan`, `--teal`, `--rose`, `--bg-root`, `--bg-surface`, `--border-default`; `@keyframes glow-pulse`, `@keyframes scan-line`, `@keyframes shake`, `@keyframes fade-in`; 自定义滚动条样式; 全局排版基础

- [ ] **Step 1: 替换 App.vue 全局样式**

将当前 `<style>` 块替换为完整的全局样式基础。`<template>` 的根 class 同步更新。

`packages/web/src/App.vue`:

```vue
<template>
  <div class="min-h-screen flex flex-col text-[#e8ecf2] font-sans" style="background: var(--bg-root);">
    <AppHeader />
    <main class="flex-1 flex overflow-hidden">
      <aside class="w-80 min-w-80 border-r p-5 overflow-y-auto" style="background: var(--bg-surface-glass); border-color: var(--border-default);">
        <InputPanel />
      </aside>
      <section class="flex-1 flex flex-col overflow-y-auto" style="background: var(--bg-root);">
        <FlowView />
        <ReportView v-if="store.status === 'complete'" />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import AppHeader from "./components/AppHeader.vue";
import InputPanel from "./components/InputPanel.vue";
import FlowView from "./components/FlowView.vue";
import ReportView from "./components/ReportView.vue";
import { useAnalysisStore } from "@/stores/analysis";

const store = useAnalysisStore();
</script>

<style>
:root {
  --cyan: #00d4ff;
  --teal: #00e5a0;
  --rose: #ff4466;
  --amber: #f0b90b;
  --bg-root: #060b14;
  --bg-surface: #0d1525;
  --bg-surface-glass: rgba(13, 21, 37, 0.65);
  --border-default: #1a2a45;
  --border-glass: rgba(0, 212, 255, 0.15);
  --text-primary: #e8ecf2;
  --text-secondary: #8899b4;
  --text-muted: #4a5568;
  --shadow-subtle: 0 0 8px rgba(0, 212, 255, 0.12);
  --shadow-focus: 0 0 12px rgba(0, 212, 255, 0.25);
  --shadow-active: 0 0 20px rgba(0, 212, 255, 0.35);
  --shadow-strong: 0 0 15px rgba(0, 212, 255, 0.4);
  --glass-bg: rgba(13, 21, 37, 0.65);
  --glass-border: rgba(0, 212, 255, 0.15);
  --glass-blur: blur(12px);
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg-root);
  color: var(--text-primary);
  letter-spacing: 0.01em;
}

/* glass surface utility */
.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
}

/* glass panel with top cyan glow */
.glass-panel-glow {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}
.glass-panel-glow::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--cyan), transparent);
  opacity: 0.6;
}

/* form input base */
.input-field {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-root);
  border: 1px solid var(--border-glass);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.input-field::placeholder {
  color: var(--text-muted);
}
.input-field:focus {
  border-color: var(--cyan);
  box-shadow: var(--shadow-focus);
}

/* select base */
.select-field {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-root);
  border: 1px solid var(--glass-border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.select-field:focus {
  border-color: var(--cyan);
  box-shadow: var(--shadow-focus);
}
.select-field option {
  background: var(--bg-surface);
  color: var(--text-primary);
}

/* scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg-root); }
::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--cyan); }

/* animations */
@keyframes glow-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
@keyframes scan-line {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(400%); }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  75% { transform: translateX(3px); }
}
@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes spin-ring {
  to { transform: rotate(360deg); }
}
</style>
```

- [ ] **Step 2: 验证 dev server 启动无报错**

```bash
cd packages/web && npx vite --host 0.0.0.0 &
sleep 3 && curl -s http://localhost:5173 | head -20
```

预期: 页面返回 HTML，无 Vite 编译报错。

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/App.vue
git commit -m "feat(web): add global CSS variables, animations, and glass panel base styles"
```

---

### Task 2: AppHeader 重新设计

**Files:**
- Modify: `packages/web/src/components/AppHeader.vue`

**Consumes:** CSS 变量 from App.vue (`--cyan`, `--glass-bg`, `--glass-border`), `glow-pulse` animation

- [ ] **Step 1: 替换 AppHeader 模板和样式**

`packages/web/src/components/AppHeader.vue`:

```vue
<template>
  <header
    class="flex items-baseline gap-4 px-6 py-3.5 border-b relative"
    style="background: var(--glass-bg); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); border-color: var(--border-default);"
  >
    <!-- bottom glow bar -->
    <div class="absolute bottom-0 left-0 right-0 h-px" style="background: linear-gradient(90deg, transparent, var(--cyan), transparent); opacity: 0.4;"></div>
    <div class="flex items-baseline gap-2">
      <h1 class="text-xl font-bold" style="background: linear-gradient(90deg, var(--cyan), var(--teal)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; letter-spacing: 0.03em;">
        AgentTrade
      </h1>
      <span
        class="text-[10px] px-1.5 py-px rounded font-semibold uppercase tracking-wider"
        style="border: 1px solid var(--cyan); color: var(--cyan); animation: glow-pulse 2s ease-in-out infinite;"
      >ALPHA</span>
    </div>
    <span class="text-sm" style="color: var(--text-secondary);">多Agent对抗行情分析</span>
  </header>
</template>

<script setup lang="ts">
</script>
```

- [ ] **Step 2: 验证**

```bash
cd packages/web && npx vite --host 0.0.0.0 &
sleep 3 && curl -s http://localhost:5173 | head -20
```

预期: 页面编译成功，无报错。浏览器中 Header 显示渐变标题、青蓝 ALPHA 徽章带脉冲、底部辉光线。

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/AppHeader.vue
git commit -m "feat(web): redesign AppHeader with gradient title, glow badge, and glass background"
```

---

### Task 3: 表单输入组件 (StockInput, SectorInput, WorkflowSelect, ModelSelect)

**Files:**
- Modify: `packages/web/src/components/StockInput.vue`
- Modify: `packages/web/src/components/SectorInput.vue`
- Modify: `packages/web/src/components/WorkflowSelect.vue`
- Modify: `packages/web/src/components/ModelSelect.vue`

**Consumes:** CSS 变量, `.input-field`, `.select-field` utility classes from App.vue

- [ ] **Step 1: 替换 StockInput**

`packages/web/src/components/StockInput.vue`:

```vue
<template>
  <div class="mb-4">
    <label class="block mb-1.5 font-medium" style="color: var(--text-secondary); font-size: 13px; letter-spacing: 0.03em; text-transform: uppercase;">股票代码</label>
    <input
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      placeholder="如 600519"
      type="text"
      maxlength="6"
      class="input-field"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>();
defineEmits<{ (e: "update:modelValue", value: string): void }>();
</script>
```

- [ ] **Step 2: 替换 SectorInput**

`packages/web/src/components/SectorInput.vue`:

```vue
<template>
  <div class="mb-4">
    <label class="block mb-1.5 font-medium" style="color: var(--text-secondary); font-size: 13px; letter-spacing: 0.03em; text-transform: uppercase;">板块名称</label>
    <input
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      placeholder="如 CPO、新能源汽车"
      type="text"
      class="input-field"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>();
defineEmits<{ (e: "update:modelValue", value: string): void }>();
</script>
```

- [ ] **Step 3: 替换 WorkflowSelect**

`packages/web/src/components/WorkflowSelect.vue`:

```vue
<template>
  <div class="mb-4">
    <label class="block mb-1.5 font-medium" style="color: var(--text-secondary); font-size: 13px; letter-spacing: 0.03em; text-transform: uppercase;">分析工作流</label>
    <select
      :value="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      class="select-field"
    >
      <option value="bull-bear">🐂🐻 牛熊对抗 (Bull-Bear)</option>
      <option value="quick-scan">⚡ 快速扫描 (Quick Scan)</option>
    </select>
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>();
defineEmits<{ (e: "update:modelValue", value: string): void }>();
</script>
```

- [ ] **Step 4: 替换 ModelSelect**

`packages/web/src/components/ModelSelect.vue`:

```vue
<template>
  <div class="mb-4">
    <label class="block mb-1.5 font-medium" style="color: var(--text-secondary); font-size: 13px; letter-spacing: 0.03em; text-transform: uppercase;">模型</label>
    <div class="flex gap-2">
      <select
        :value="provider"
        @change="$emit('update:provider', ($event.target as HTMLSelectElement).value)"
        class="select-field"
        style="flex: 0 0 120px;"
      >
        <option value="deepseek">DeepSeek</option>
        <option value="openai">OpenAI</option>
        <option value="anthropic">Anthropic</option>
      </select>
      <input
        :value="model"
        @input="$emit('update:model', ($event.target as HTMLInputElement).value)"
        placeholder="自定义模型名称"
        type="text"
        class="input-field"
        style="flex: 1;"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ provider: string; model: string }>();
defineEmits<{
  (e: "update:provider", value: string): void;
  (e: "update:model", value: string): void;
}>();
</script>
```

- [ ] **Step 5: 验证编译**

```bash
cd packages/web && npx vite build --mode development 2>&1 | tail -5
```

预期: build 成功，无 TS/CSS 错误。

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/StockInput.vue packages/web/src/components/SectorInput.vue packages/web/src/components/WorkflowSelect.vue packages/web/src/components/ModelSelect.vue
git commit -m "feat(web): redesign form inputs with cyan focus glow and glass borders"
```

---

### Task 4: InputPanel — 按钮与容器

**Files:**
- Modify: `packages/web/src/components/InputPanel.vue`

**Consumes:** CSS 变量, `glow-pulse`, `spin-ring` animations from App.vue

- [ ] **Step 1: 替换 InputPanel**

`packages/web/src/components/InputPanel.vue`:

```vue
<template>
  <div>
    <h2
      class="text-base font-semibold mb-5 pb-2.5 border-b"
      style="color: var(--text-primary); border-color: var(--border-default); letter-spacing: 0.02em;"
    >分析参数</h2>

    <StockInput v-model="stockCode" />
    <SectorInput v-model="sectorName" />
    <WorkflowSelect v-model="selectedWorkflow" />
    <ModelSelect
      v-model:provider="selectedProvider"
      v-model:model="selectedModel"
    />

    <div
      v-if="error"
      class="px-3 py-2.5 mb-3.5 rounded-md text-[13px]"
      style="background: rgba(255, 68, 102, 0.08); border: 1px solid rgba(255, 68, 102, 0.4); color: var(--rose);"
    >{{ error }}</div>

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

    <div v-if="isRunning && steps.length > 0" class="mt-3">
      <p class="text-[13px]" style="color: var(--text-secondary);">
        进度: {{ completedSteps }}/{{ steps.length }} 步骤
      </p>
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
</template>

<script setup lang="ts">
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

- [ ] **Step 2: 验证编译**

```bash
cd packages/web && npx vue-tsc --noEmit 2>&1 | head -5
```

预期: 无类型错误。

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/InputPanel.vue
git commit -m "feat(web): redesign InputPanel with gradient button, spinner, and glass reset button"
```

---

### Task 5: StepProgress 时间线

**Files:**
- Modify: `packages/web/src/components/StepProgress.vue`

**Consumes:** CSS 变量, `glow-pulse`, `shake`, `fade-in` animations from App.vue

- [ ] **Step 1: 替换 StepProgress**

`packages/web/src/components/StepProgress.vue`:

```vue
<template>
  <div>
    <h2
      class="text-sm font-semibold mb-4 pb-2 border-b"
      style="color: var(--text-primary); border-color: var(--border-default); letter-spacing: 0.02em;"
    >分析流程</h2>
    <div v-if="steps.length === 0" class="text-center py-5" style="color: var(--text-muted); font-size: 13px;">
      等待分析开始...
    </div>
    <div v-else class="flex flex-wrap items-start gap-1">
      <template v-for="(step, index) in steps" :key="step.id">
        <!-- connector line -->
        <div v-if="index > 0" class="flex items-center mx-1">
          <span class="w-5 h-px" style="background: var(--border-default);"></span>
          <span class="text-xs ml-0.5" style="color: var(--text-muted);">▸</span>
        </div>
        <!-- step capsule -->
        <div
          class="flex items-start gap-2 px-3.5 py-2.5 rounded-lg min-w-[140px] transition-all duration-300 glass-panel"
          :style="stepStyle(step)"
        >
          <span
            class="inline-block w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0"
            :style="dotStyle(step)"
          ></span>
          <div class="flex flex-col gap-0.5">
            <span class="text-[13px] font-semibold" style="color: var(--text-primary);">{{ step.id }}</span>
            <span class="text-[11px]" style="color: var(--text-secondary);">{{ step.type }}</span>
            <span v-if="step.agentIds.length > 0" class="text-[11px]" style="color: var(--cyan);">
              {{ step.agentIds.join(", ") }}
            </span>
          </div>
        </div>
      </template>
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
  switch (step.status) {
    case "running": return { borderColor: "var(--cyan)", boxShadow: "var(--shadow-active)", animation: "fade-in 0.3s ease-out" };
    case "complete": return { borderColor: "rgba(0, 229, 160, 0.3)" };
    case "error": return { borderColor: "rgba(255, 68, 102, 0.4)" };
    default: return {};
  }
}
</script>
```

- [ ] **Step 2: 验证编译**

```bash
cd packages/web && npx vue-tsc --noEmit 2>&1 | head -5
```

预期: 无类型错误。

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/StepProgress.vue
git commit -m "feat(web): redesign StepProgress as timeline with glow dots and animated status"
```

---

### Task 6: LiveLog 终端风格

**Files:**
- Modify: `packages/web/src/components/LiveLog.vue`

**Consumes:** CSS 变量, `glow-pulse`, `scan-line` animations from App.vue

- [ ] **Step 1: 替换 LiveLog**

`packages/web/src/components/LiveLog.vue`:

```vue
<template>
  <div>
    <div class="flex items-center justify-between mb-3 pb-2 border-b" style="border-color: var(--border-default);">
      <h2 class="text-sm font-semibold" style="color: var(--text-primary); letter-spacing: 0.02em;">实时输出</h2>
      <span v-if="isRunning" class="inline-flex items-center gap-1.5 text-xs" style="color: var(--cyan);">
        <span class="inline-block w-2 h-2 rounded-full" style="background: var(--cyan); box-shadow: 0 0 6px var(--cyan); animation: glow-pulse 1.2s ease-in-out infinite;"></span>
        运行中
      </span>
    </div>
    <div
      ref="logContainer"
      class="h-60 overflow-y-auto p-3 rounded-lg font-mono text-xs leading-relaxed relative"
      style="background: var(--bg-root); border: 1px solid var(--border-default);"
    >
      <!-- scan line overlay -->
      <div
        class="absolute inset-0 pointer-events-none overflow-hidden rounded-lg"
        style="background: linear-gradient(180deg, transparent 60%, rgba(0, 212, 255, 0.015) 60.5%, transparent 61%); animation: scan-line 6s linear infinite;"
      ></div>
      <div v-if="logs.length === 0" class="text-center py-5" style="color: var(--text-muted);">
        等待输出...
      </div>
      <div
        v-for="(entry, index) in logs"
        :key="index"
        class="flex gap-2 py-0.5 relative"
        style="animation: fade-in 0.2s ease-out;"
      >
        <span class="whitespace-nowrap" style="color: var(--text-muted);">{{ formatTime(entry.time) }}</span>
        <span class="whitespace-nowrap font-semibold" style="color: var(--cyan);">[{{ entry.agent }}]</span>
        <span
          class="break-all"
          :style="{ color: sentimentColor(entry.sentiment) }"
        >{{ entry.message }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import type { LogEntry } from "@/stores/analysis";

const props = defineProps<{
  logs: LogEntry[];
  isRunning: boolean;
}>();

const logContainer = ref<HTMLElement | null>(null);

watch(
  () => props.logs.length,
  async () => {
    await nextTick();
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  },
);

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });
}

function sentimentColor(sentiment?: string): string {
  switch (sentiment) {
    case "bullish": return "var(--teal)";
    case "bearish": return "var(--rose)";
    default: return "var(--text-primary)";
  }
}
</script>
```

- [ ] **Step 2: 验证编译**

```bash
cd packages/web && npx vue-tsc --noEmit 2>&1 | head -5
```

预期: 无类型错误。

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/LiveLog.vue
git commit -m "feat(web): redesign LiveLog with terminal style, scan-line overlay, and cyan running dot"
```

---

### Task 7: FlowView 容器

**Files:**
- Modify: `packages/web/src/components/FlowView.vue`

- [ ] **Step 1: 替换 FlowView**

`packages/web/src/components/FlowView.vue`:

```vue
<template>
  <div class="p-5 flex flex-col gap-6 flex-1">
    <div class="glass-panel-glow p-5">
      <StepProgress :steps="store.steps" />
    </div>
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

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/FlowView.vue
git commit -m "feat(web): wrap FlowView sections in glass panels with glow"
```

---

### Task 8: SentimentChart 渐变条

**Files:**
- Modify: `packages/web/src/components/SentimentChart.vue`

- [ ] **Step 1: 替换 SentimentChart**

`packages/web/src/components/SentimentChart.vue`:

```vue
<template>
  <div class="mb-6">
    <h3 class="text-[15px] font-semibold mb-3.5" style="color: var(--text-primary); letter-spacing: 0.02em;">多空分布</h3>
    <div class="flex flex-col gap-2.5">
      <!-- 看多 -->
      <div class="flex items-center gap-2.5">
        <span class="w-[60px] text-[13px] inline-flex items-center gap-1" style="color: var(--teal);">
          <span class="inline-block w-2 h-2 rounded-full" style="background: var(--teal); box-shadow: 0 0 4px var(--teal);"></span>
          看多
        </span>
        <div class="flex-1 h-5 rounded overflow-hidden" style="background: var(--bg-root);">
          <div
            class="h-full rounded transition-all duration-600"
            style="background: linear-gradient(90deg, var(--teal), var(--cyan)); box-shadow: 0 0 8px rgba(0, 229, 160, 0.3);"
            :style="{ width: bullPct + '%' }"
          ></div>
        </div>
        <span class="w-[30px] text-sm font-semibold text-right font-mono" style="color: var(--teal);">{{ sentiments.bullish }}</span>
      </div>
      <!-- 看空 -->
      <div class="flex items-center gap-2.5">
        <span class="w-[60px] text-[13px] inline-flex items-center gap-1" style="color: var(--rose);">
          <span class="inline-block w-2 h-2 rounded-full" style="background: var(--rose); box-shadow: 0 0 4px var(--rose);"></span>
          看空
        </span>
        <div class="flex-1 h-5 rounded overflow-hidden" style="background: var(--bg-root);">
          <div
            class="h-full rounded transition-all duration-600"
            style="background: linear-gradient(90deg, var(--rose), #ff7799); box-shadow: 0 0 8px rgba(255, 68, 102, 0.3);"
            :style="{ width: bearPct + '%' }"
          ></div>
        </div>
        <span class="w-[30px] text-sm font-semibold text-right font-mono" style="color: var(--rose);">{{ sentiments.bearish }}</span>
      </div>
      <!-- 中性 -->
      <div class="flex items-center gap-2.5">
        <span class="w-[60px] text-[13px] inline-flex items-center gap-1" style="color: var(--text-secondary);">
          <span class="inline-block w-2 h-2 rounded-full" style="background: var(--text-secondary);"></span>
          中性
        </span>
        <div class="flex-1 h-5 rounded overflow-hidden" style="background: var(--bg-root);">
          <div
            class="h-full rounded transition-all duration-600"
            style="background: var(--border-default);"
            :style="{ width: neutralPct + '%' }"
          ></div>
        </div>
        <span class="w-[30px] text-sm font-semibold text-right font-mono" style="color: var(--text-secondary);">{{ sentiments.neutral }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  sentiments: { bullish: number; bearish: number; neutral: number };
}>();

const total = computed(() => props.sentiments.bullish + props.sentiments.bearish + props.sentiments.neutral || 1);

const bullPct = computed(() => Math.round((props.sentiments.bullish / total.value) * 100));
const bearPct = computed(() => Math.round((props.sentiments.bearish / total.value) * 100));
const neutralPct = computed(() => Math.round((props.sentiments.neutral / total.value) * 100));
</script>
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/SentimentChart.vue
git commit -m "feat(web): redesign SentimentChart with gradient bars, glow dots, and mono number font"
```

---

### Task 9: FindingList 玻璃卡片

**Files:**
- Modify: `packages/web/src/components/FindingList.vue`

- [ ] **Step 1: 替换 FindingList**

`packages/web/src/components/FindingList.vue`:

```vue
<template>
  <div class="mb-6">
    <h3 class="text-[15px] font-semibold mb-3.5" style="color: var(--text-primary); letter-spacing: 0.02em;">各方观点</h3>
    <div
      v-for="(f, i) in findings"
      :key="i"
      class="glass-panel p-3.5 mb-2.5 relative"
      style="overflow: hidden; animation: fade-in 0.3s ease-out;"
    >
      <!-- left accent bar -->
      <div
        class="absolute left-0 top-0 bottom-0 w-[3px]"
        :style="{ background: accentColor(f.sentiment), boxShadow: '0 0 8px ' + accentColor(f.sentiment) }"
      ></div>
      <div class="flex justify-between mb-2 pl-1">
        <span class="text-[13px] font-semibold" style="color: var(--cyan);">{{ f.agent }}</span>
        <span class="text-xs font-mono" style="color: var(--text-secondary);">{{ Math.round(f.confidence * 100) }}%</span>
      </div>
      <p class="text-sm leading-relaxed mb-1.5 pl-1" style="color: var(--text-primary);">{{ f.conclusion }}</p>
      <ul v-if="f.reasoning && f.reasoning.length > 0" class="mt-2 pl-[18px]">
        <li v-for="(r, j) in f.reasoning" :key="j" class="text-[13px] mb-0.5" style="color: var(--text-secondary); list-style: '▸ ';">
          {{ r }}
        </li>
      </ul>
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

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/FindingList.vue
git commit -m "feat(web): redesign FindingList with glass cards, glow accent bars, and chevron bullets"
```

---

### Task 10: ConclusionCard 玻璃 + 辉光

**Files:**
- Modify: `packages/web/src/components/ConclusionCard.vue`

- [ ] **Step 1: 替换 ConclusionCard**

`packages/web/src/components/ConclusionCard.vue`:

```vue
<template>
  <div class="glass-panel-glow p-[18px] relative" style="overflow: hidden;">
    <!-- top glow accent -->
    <div
      class="absolute top-0 left-0 right-0 h-[3px]"
      style="background: linear-gradient(90deg, transparent, var(--cyan), transparent); opacity: 0.8;"
    ></div>
    <h3 class="text-[15px] font-semibold mb-3" style="color: var(--cyan); letter-spacing: 0.02em;">综合研判</h3>
    <div class="text-sm leading-relaxed whitespace-pre-wrap" style="color: var(--text-primary);">
      <p>{{ conclusion }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ conclusion: string }>();
</script>
```

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/ConclusionCard.vue
git commit -m "feat(web): redesign ConclusionCard with glass panel, cyan glow bar, and improved typography"
```

---

### Task 11: ReportView 容器整合

**Files:**
- Modify: `packages/web/src/components/ReportView.vue`

- [ ] **Step 1: 替换 ReportView**

`packages/web/src/components/ReportView.vue`:

```vue
<template>
  <div v-if="store.report" class="px-5 py-6" style="border-top: 1px solid var(--border-default); animation: fade-in 0.4s ease-out;">
    <h2 class="text-lg font-semibold mb-5" style="color: var(--text-primary); letter-spacing: 0.02em;">
      分析报告 — {{ store.report.target.name ?? store.report.target.code }}
    </h2>
    <div class="grid grid-cols-[280px_1fr] gap-6 max-[900px]:grid-cols-1">
      <div class="glass-panel p-5">
        <SentimentChart :sentiments="store.report.sentiments" />
      </div>
      <FindingList :findings="store.report.findings" />
    </div>
    <ConclusionCard
      v-if="store.report.conclusion"
      :conclusion="store.report.conclusion"
    />
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

- [ ] **Step 2: Commit**

```bash
git add packages/web/src/components/ReportView.vue
git commit -m "feat(web): redesign ReportView with glass panel wrapping and fade-in animation"
```

---

### Task 12: 最终验证与修复

**Files:**
- 全部已修改的 Vue 组件

- [ ] **Step 1: TypeScript 类型检查**

```bash
cd packages/web && npx vue-tsc --noEmit 2>&1
```

预期: 无类型错误。

- [ ] **Step 2: 生产构建**

```bash
cd packages/web && npx vite build 2>&1
```

预期: `✓ built in Xms`，无错误。

- [ ] **Step 3: 启动 dev server 进行视觉检查**

```bash
cd packages/web && npx vite --host 0.0.0.0 &
```

在浏览器中打开 `http://localhost:5173`，逐项检查：
- [ ] Header: 渐变标题、ALPHA 徽章脉冲、底部辉光线
- [ ] Sidebar: 玻璃面板背景、输入框聚焦青蓝辉光、按钮渐变
- [ ] FlowView: StepProgress 时间线圆点、LiveLog 终端扫描线
- [ ] ReportView: 渐变进度条、玻璃卡片、结论辉光条
- [ ] 整体: 深海军蓝底色、自定义滚动条

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "chore(web): final verification — typecheck and build pass"
```
