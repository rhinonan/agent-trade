# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace sidebar-input layout with a two-state design: centered landing page (LandingView) → animated working state (WorkspaceView) with PrimeVue unstyled components.

**Architecture:** Two-state layout driven by `store.status`. `idle` renders LandingView (centered AutoComplete + Select). Non-idle renders WorkspaceView (AnalysisStatusBar + StepProgress + LiveLog + ReportView). Landing→Working transition uses CSS `@keyframes` fly-in (~600ms), driven by JS bounding rect capture.

**Tech Stack:** Vue 3 + Pinia + PrimeVue (unstyled) + Tailwind CSS 4 + TypeScript

## Global Constraints

- PrimeVue 4.x, unstyled mode — all styles via Tailwind + existing CSS variables
- Vue 3.5 + TypeScript 5.5 strict mode
- Tailwind CSS 4 via `@tailwindcss/vite`
- ESM (`"type": "module"`)
- All existing CSS custom properties (`--cyan`, `--bg-root`, `--glass-bg`, etc.) remain unchanged
- Existing store interface (`useAnalysisStore`) extended, not replaced

---

### Task 1: Install PrimeVue and configure in main.ts

**Files:**
- Modify: `packages/web/package.json`
- Modify: `packages/web/src/main.ts`

**Interfaces:**
- Consumes: nothing
- Produces: PrimeVue plugin registered globally, unstyled mode

- [ ] **Step 1: Add primevue dependency**

```bash
pnpm --filter @agenttrade/web add primevue
```

- [ ] **Step 2: Run pnpm install to update lockfile**

```bash
pnpm install
```

- [ ] **Step 3: Configure PrimeVue in main.ts**

Read the current file at `packages/web/src/main.ts`:
```ts
import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";

const app = createApp(App);
app.use(createPinia());
app.mount("#app");
```

Replace with:
```ts
import { createApp } from "vue";
import { createPinia } from "pinia";
import PrimeVue from "primevue/config";
import App from "./App.vue";

const app = createApp(App);
app.use(createPinia());
app.use(PrimeVue, {
  unstyled: true,
});
app.mount("#app");
```

- [ ] **Step 4: Verify PrimeVue resolves — quick typecheck**

```bash
pnpm --filter @agenttrade/web exec vue-tsc --noEmit 2>&1 | head -20
```
Expected: no new errors from PrimeVue imports (unused import warning for PrimeVue is OK at this stage).

- [ ] **Step 5: Commit**

```bash
git add packages/web/package.json pnpm-lock.yaml packages/web/src/main.ts
git commit -m "chore: add primevue dependency and configure unstyled mode"
```

---

### Task 2: Extend analysis store

**Files:**
- Modify: `packages/web/src/stores/analysis.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `targetType: Ref<'stock' | 'sector'>` — active analysis mode
  - `setTargetType(type: 'stock' | 'sector'): void` — setter

- [ ] **Step 1: Read current store file**

Already read — `D:\c2\packages\web\src\stores\analysis.ts`. Key sections:
- Lines 59-68: store definition with existing refs
- Lines 171-176: return statement

- [ ] **Step 2: Add targetType ref and setter**

After line 60 (`const status = ref<AnalysisStatus>("idle");`), add:
```ts
const targetType = ref<"stock" | "sector">("stock");
```

After line 67 (`const sessionId = ref<string | null>(null);`), add setter:
```ts
function setTargetType(type: "stock" | "sector") {
  targetType.value = type;
}
```

- [ ] **Step 3: Add targetType and setTargetType to return statement**

In the return block (lines 171-175), add:
```ts
targetType,
setTargetType,
```

- [ ] **Step 4: Add store test for new field**

Read existing test at `packages/web/src/__tests__/`:
```bash
ls packages/web/src/__tests__/
```

Create `packages/web/src/__tests__/analysis-store.spec.ts` if it doesn't exist:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAnalysisStore } from "@/stores/analysis";

describe("analysis store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("defaults targetType to stock", () => {
    const store = useAnalysisStore();
    expect(store.targetType).toBe("stock");
  });

  it("setTargetType switches mode", () => {
    const store = useAnalysisStore();
    store.setTargetType("sector");
    expect(store.targetType).toBe("sector");
  });

  it("reset keeps targetType unchanged (user preference)", () => {
    const store = useAnalysisStore();
    store.setTargetType("sector");
    store.reset();
    expect(store.targetType).toBe("sector");
  });
});
```

- [ ] **Step 5: Run tests**

```bash
pnpm --filter @agenttrade/web test -- --run
```
Expected: 3 new tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/stores/analysis.ts packages/web/src/__tests__/analysis-store.spec.ts
git commit -m "feat: add targetType to analysis store"
```

---

### Task 3: Create autocomplete composable

**Files:**
- Create: `packages/web/src/composables/useAutocomplete.ts`

**Interfaces:**
- Consumes: `useAnalysisStore().targetType` from Task 2
- Produces:
  - `useAutocomplete(query: Ref<string>, targetType: Ref<'stock' | 'sector'>)` → `{ suggestions: Ref<Array<{code:string, name:string}>>, loading: Ref<boolean> }`

- [ ] **Step 1: Create the composable file**

```ts
import { ref, watch, type Ref } from "vue";

export interface Suggestion {
  code: string;
  name: string;
}

/** Local hot stocks shown on focus when stock tab is active */
const HOT_STOCKS: Suggestion[] = [
  { code: "600519", name: "贵州茅台" },
  { code: "300750", name: "宁德时代" },
  { code: "000858", name: "五粮液" },
  { code: "601318", name: "中国平安" },
  { code: "000333", name: "美的集团" },
  { code: "002594", name: "比亚迪" },
  { code: "600036", name: "招商银行" },
  { code: "000651", name: "格力电器" },
  { code: "600900", name: "长江电力" },
  { code: "601899", name: "紫金矿业" },
  { code: "300059", name: "东方财富" },
  { code: "688981", name: "中芯国际" },
  { code: "002371", name: "北方华创" },
  { code: "601012", name: "隆基绿能" },
  { code: "600276", name: "恒瑞医药" },
  { code: "000725", name: "京东方A" },
  { code: "002415", name: "海康威视" },
  { code: "600809", name: "山西汾酒" },
  { code: "300308", name: "中际旭创" },
  { code: "002230", name: "科大讯飞" },
];

/** Local sector names — loaded once on sector tab activation */
const SECTOR_LIST: Suggestion[] = [
  { code: "CPO", name: "光电共封装" },
  { code: "白酒", name: "白酒" },
  { code: "半导体", name: "半导体" },
];

export function useAutocomplete(
  query: Ref<string>,
  targetType: Ref<"stock" | "sector">,
) {
  const suggestions = ref<Suggestion[]>([]);
  const loading = ref(false);

  /** Local filter when user types */
  function localFilter(q: string, pool: Suggestion[]): Suggestion[] {
    const lower = q.toLowerCase().trim();
    if (!lower) return pool.slice(0, 8);
    return pool
      .filter(
        (s) =>
          s.code.toLowerCase().includes(lower) ||
          s.name.includes(lower) ||
          s.name.includes(q.trim()),
      )
      .slice(0, 8);
  }

  /** Fetch from API on input (stock mode only — sector is fully local) */
  async function fetchFromAPI(keyword: string) {
    if (targetType.value !== "stock" || !keyword.trim()) return;
    loading.value = true;
    try {
      const res = await fetch(
        `/api/reference/search?keyword=${encodeURIComponent(keyword)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.results?.length) {
        suggestions.value = data.results;
      }
    } catch {
      // API unreachable — local results already showing
    } finally {
      loading.value = false;
    }
  }

  watch(
    [query, targetType],
    ([q, type]) => {
      const pool = type === "sector" ? SECTOR_LIST : HOT_STOCKS;
      suggestions.value = localFilter(q, pool);
      // In stock mode, also try API for more results
      if (type === "stock" && q.trim().length >= 1) {
        fetchFromAPI(q);
      }
    },
    { immediate: true },
  );

  return { suggestions, loading };
}
```

- [ ] **Step 2: Verify file typechecks**

```bash
pnpm --filter @agenttrade/web exec vue-tsc --noEmit 2>&1 | head -10
```
Expected: no new TS errors.

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/composables/useAutocomplete.ts
git commit -m "feat: add useAutocomplete composable with local data and API search"
```

---

### Task 4: Create LandingView

**Files:**
- Create: `packages/web/src/components/LandingView.vue`

**Interfaces:**
- Consumes:
  - `useAutocomplete` from Task 3
  - `useAnalysisStore` from Task 2 (targetType, setTargetType)
  - PrimeVue AutoComplete, Select, Tabs from Task 1
- Produces:
  - Emits: `@submit(params: {code, sector, workflow, provider})` — parent starts analysis
  - This component owns the input state before analysis starts

- [ ] **Step 1: Create LandingView.vue**

```vue
<template>
  <div
    class="flex flex-col items-center justify-center flex-1 px-6"
    style="min-height: 70vh; animation: fade-in 0.4s ease-out;"
  >
    <!-- Analysis mode tabs -->
    <div class="flex gap-1 mb-8 p-0.5 rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-default);">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        class="px-6 py-2.5 rounded-md text-sm font-semibold transition-all duration-200"
        :style="targetType === tab.value
          ? { background: 'rgba(0, 212, 255, 0.12)', color: 'var(--cyan)', boxShadow: '0 0 8px rgba(0, 212, 255, 0.15)' }
          : { color: 'var(--text-secondary)' }"
        @click="store.setTargetType(tab.value)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Input card -->
    <div class="glass-panel-glow p-8 w-full max-w-xl">
      <!-- AutoComplete -->
      <div class="mb-5">
        <label class="block mb-2 font-medium" style="color: var(--text-secondary); font-size: 13px; letter-spacing: 0.03em; text-transform: uppercase;">
          {{ targetType === 'stock' ? '股票代码/名称' : '板块名称' }}
        </label>
        <AutoComplete
          :model-value="inputValue"
          @update:model-value="onSelect"
          :suggestions="suggestions"
          option-label="name"
          :input-style="autoCompleteInputStyle"
          :panel-style="autoCompletePanelStyle"
          :pt="{
            input: { class: 'input-field', placeholder: placeholder },
            panel: { class: 'glass-panel mt-1 max-h-64 overflow-y-auto' },
            item: { class: 'px-4 py-2.5 cursor-pointer transition-colors hover:bg-[rgba(0,212,255,0.08)] text-sm', style: 'color: var(--text-primary);' },
          }"
          @complete="onSearch"
          :delay="200"
          dropdown
        >
          <template #option="slotProps">
            <div class="flex items-center justify-between">
              <span>{{ slotProps.option.name }}</span>
              <span class="font-mono opacity-60" style="font-size: 12px; color: var(--text-muted);">{{ slotProps.option.code }}</span>
            </div>
          </template>
        </AutoComplete>
      </div>

      <!-- Workflow Select -->
      <div class="mb-6">
        <label class="block mb-2 font-medium" style="color: var(--text-secondary); font-size: 13px; letter-spacing: 0.03em; text-transform: uppercase;">分析工作流</label>
        <Select
          :model-value="selectedWorkflow"
          @update:model-value="selectedWorkflow = $event"
          :options="workflows"
          option-label="name"
          option-value="value"
          :pt="{
            input: { class: 'select-field' },
            panel: { class: 'glass-panel mt-1' },
            item: { class: 'px-4 py-2.5 cursor-pointer text-sm hover:bg-[rgba(0,212,255,0.08)]', style: 'color: var(--text-primary);' },
          }"
        />
      </div>

      <!-- Error -->
      <div
        v-if="error"
        class="px-3 py-2.5 mb-4 rounded-md text-[13px]"
        style="background: rgba(255, 68, 102, 0.08); border: 1px solid rgba(255, 68, 102, 0.4); color: var(--rose);"
      >{{ error }}</div>

      <!-- Submit -->
      <button
        class="w-full p-3.5 border-none rounded-md text-white text-[15px] font-semibold cursor-pointer transition-all relative overflow-hidden"
        :disabled="!canStart"
        :style="canStart
          ? { background: 'linear-gradient(135deg, var(--cyan), #0088aa)', boxShadow: 'var(--shadow-strong)' }
          : { background: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'not-allowed', border: '1px solid var(--border-default)' }"
        @click="$emit('submit', submitPayload)"
        @mouseenter="(e) => { if (canStart) { (e.target as HTMLElement).style.boxShadow = '0 0 24px rgba(0,212,255,0.55)'; (e.target as HTMLElement).style.transform = 'scale(1.02)'; } }"
        @mouseleave="(e) => { if (canStart) { (e.target as HTMLElement).style.boxShadow = 'var(--shadow-strong)'; (e.target as HTMLElement).style.transform = 'scale(1)'; } }"
      >
        ▶ 开始分析
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import AutoComplete from "primevue/autocomplete";
import Select from "primevue/select";
import { useAnalysisStore } from "@/stores/analysis";
import { useAutocomplete } from "@/composables/useAutocomplete";
import type { Suggestion } from "@/composables/useAutocomplete";

const emit = defineEmits<{
  (e: "submit", payload: { code?: string; sector?: string; workflow: string }): void;
}>();

const store = useAnalysisStore();
const { suggestions } = useAutocomplete(
  computed(() => inputQuery.value),
  computed(() => store.targetType),
);

const tabs = [
  { label: "个股分析", value: "stock" as const },
  { label: "板块分析", value: "sector" as const },
];

const workflows = [
  { name: "🐂🐻 牛熊对抗 (Bull-Bear)", value: "bull-bear" },
  { name: "⚡ 快速扫描 (Quick Scan)", value: "quick-scan" },
];

const inputValue = ref<Suggestion | null>(null);
const inputQuery = ref("");
const selectedWorkflow = ref("bull-bear");
const error = ref<string | null>(null);

const targetType = computed(() => store.targetType);

const placeholder = computed(() =>
  targetType.value === "stock"
    ? "输入股票代码或名称，如 600519 贵州茅台…"
    : "输入板块名称，如 CPO、新能源汽车…",
);

const canStart = computed(() => {
  return inputValue.value !== null || inputQuery.value.trim().length > 0;
});

const submitPayload = computed(() => {
  const p: { code?: string; sector?: string; workflow: string } = {
    workflow: selectedWorkflow.value,
  };
  if (targetType.value === "stock") {
    p.code = inputValue.value?.code ?? inputQuery.value.trim();
  } else {
    p.sector = inputValue.value?.code ?? inputQuery.value.trim();
  }
  return p;
});

function onSelect(value: Suggestion | null) {
  inputValue.value = value;
  if (value) {
    inputQuery.value = value.code;
  }
}

function onSearch(event: { query: string }) {
  inputQuery.value = event.query;
}

const autoCompleteInputStyle = {};
const autoCompletePanelStyle = {};
</script>
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @agenttrade/web exec vue-tsc --noEmit 2>&1 | head -20
```
Expected: no TS errors (may have unused import warnings — fix those).

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/LandingView.vue
git commit -m "feat: create LandingView with centered autocomplete input and workflow select"
```

---

### Task 5: Create AnalysisStatusBar

**Files:**
- Create: `packages/web/src/components/AnalysisStatusBar.vue`

**Interfaces:**
- Consumes: `useAnalysisStore` — `target`, `targetType`, `workflow`
- Produces: nothing (render-only component, no emits)

- [ ] **Step 1: Create AnalysisStatusBar.vue**

```vue
<template>
  <div
    v-if="store.target"
    ref="barRef"
    class="px-10 py-3 border-b"
    style="
      background: var(--glass-bg);
      backdrop-filter: var(--glass-blur);
      -webkit-backdrop-filter: var(--glass-blur);
      border-color: var(--border-default);
      animation: fly-from-center 0.45s ease-out;
    "
  >
    <div class="flex items-center gap-3 text-sm">
      <!-- Target type badge -->
      <span
        class="px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider"
        :style="{
          background: store.targetType === 'stock'
            ? 'rgba(0, 212, 255, 0.1)'
            : 'rgba(0, 229, 160, 0.1)',
          color: store.targetType === 'stock' ? 'var(--cyan)' : 'var(--teal)',
          border: `1px solid ${store.targetType === 'stock' ? 'rgba(0, 212, 255, 0.3)' : 'rgba(0, 229, 160, 0.3)'}`,
        }"
      >
        {{ store.targetType === 'stock' ? '个股' : '板块' }}
      </span>

      <!-- Target name -->
      <span class="font-semibold" style="color: var(--text-primary);">
        {{ store.target.code }}
        <span v-if="store.target.name" style="color: var(--text-secondary);">
          {{ store.target.name }}
        </span>
      </span>

      <!-- Separator -->
      <span style="color: var(--text-muted);">|</span>

      <!-- Workflow name -->
      <span style="color: var(--text-secondary);">
        {{ workflowLabel }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useAnalysisStore } from "@/stores/analysis";

const store = useAnalysisStore();
const barRef = ref<HTMLElement | null>(null);

const workflowLabel = computed(() => {
  const map: Record<string, string> = {
    "bull-bear": "牛熊对抗 (Bull-Bear)",
    "quick-scan": "快速扫描 (Quick Scan)",
  };
  return map[store.workflow ?? ""] ?? store.workflow ?? "";
});
</script>
```

- [ ] **Step 2: Add fly-from-center keyframes to App.vue global styles**

Edit `App.vue`, add after the existing `@keyframes spin-ring` block:
```css
@keyframes fly-from-center {
  from {
    opacity: 0.4;
    transform: translateY(-24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @agenttrade/web exec vue-tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/AnalysisStatusBar.vue packages/web/src/App.vue
git commit -m "feat: create AnalysisStatusBar with fly-in animation"
```

---

### Task 6: Create WorkspaceView

**Files:**
- Create: `packages/web/src/components/WorkspaceView.vue`

**Interfaces:**
- Consumes:
  - `useAnalysisStore` — `steps`, `isRunning`, `logs`, `report`, `status`
  - Existing components: `StepProgress`, `LiveLog`, `ReportView`
- Produces: nothing (render-only)

- [ ] **Step 1: Create WorkspaceView.vue**

```vue
<template>
  <div
    class="flex-1 flex flex-col overflow-y-auto px-10 py-8"
    style="animation: fade-in 0.3s ease-out;"
  >
    <!-- Step progress -->
    <StepProgress :steps="store.steps" />

    <!-- Divider -->
    <div class="divider-cyan my-7"></div>

    <!-- Content area: LiveLog (runnning) or ReportView (complete) -->
    <div
      v-if="store.status === 'complete'"
      class="flex-1"
      style="animation: fade-in 0.4s ease-out;"
    >
      <ReportView />
    </div>

    <div
      v-else
      class="glass-panel p-5 flex-1 flex flex-col min-h-0"
    >
      <LiveLog :logs="store.logs" :is-running="store.isRunning" />
    </div>

    <!-- Error state -->
    <div
      v-if="store.status === 'error'"
      class="glass-panel mt-6 p-5"
      style="border-color: rgba(255, 68, 102, 0.3);"
    >
      <div class="flex items-center gap-3">
        <span style="color: var(--rose); font-size: 18px;">⚠</span>
        <div>
          <h3 class="text-sm font-semibold" style="color: var(--rose);">分析失败</h3>
          <p class="text-sm mt-1" style="color: var(--text-secondary);">{{ store.error }}</p>
        </div>
        <button
          class="ml-auto px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-all"
          style="background: var(--bg-surface); color: var(--text-secondary); border: 1px solid var(--border-default);"
          @click="store.reset()"
        >
          ↻ 新分析
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAnalysisStore } from "@/stores/analysis";
import StepProgress from "./StepProgress.vue";
import LiveLog from "./LiveLog.vue";
import ReportView from "./ReportView.vue";

const store = useAnalysisStore();
</script>
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @agenttrade/web exec vue-tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/src/components/WorkspaceView.vue
git commit -m "feat: create WorkspaceView consolidating flow and report content"
```

---

### Task 7: Refactor App.vue for two-state layout

**Files:**
- Modify: `packages/web/src/App.vue`

**Interfaces:**
- Consumes: `LandingView` (Task 4), `AnalysisStatusBar` (Task 5), `WorkspaceView` (Task 6), `AppHeader`
- Produces: Two-state root layout

- [ ] **Step 1: Replace App.vue template and script**

Read the current `App.vue` (already done — 179 lines). Full replacement:

```vue
<template>
  <div class="min-h-screen flex flex-col text-[#e8ecf2] font-sans app-dark" style="background: var(--bg-root);">
    <AppHeader />

    <!-- Working state -->
    <template v-if="store.status !== 'idle'">
      <AnalysisStatusBar />
      <WorkspaceView />
    </template>

    <!-- Landing state -->
    <LandingView
      v-else
      @submit="startAnalysis"
    />
  </div>
</template>

<script setup lang="ts">
import AppHeader from "./components/AppHeader.vue";
import LandingView from "./components/LandingView.vue";
import AnalysisStatusBar from "./components/AnalysisStatusBar.vue";
import WorkspaceView from "./components/WorkspaceView.vue";
import { useAnalysisStore } from "@/stores/analysis";
import { useAnalysisSocket } from "@/composables/useAnalysisSocket";

const store = useAnalysisStore();
const { connect: connectWS, disconnect: disconnectWS } = useAnalysisSocket();

async function startAnalysis(payload: { code?: string; sector?: string; workflow: string }) {
  store.reset();

  try {
    const body: Record<string, string> = {
      workflow: payload.workflow,
      provider: "deepseek",
    };
    if (payload.code) body.code = payload.code;
    if (payload.sector) body.sector = payload.sector;

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      store.handleError({ message: data.message ?? "请求失败" });
      return;
    }

    store.sessionId = data.sessionId;
    connectWS(data.sessionId);

    // Poll fallback
    setTimeout(async () => {
      const statusRes = await fetch(`/api/analyze/${data.sessionId}`);
      const statusData = await statusRes.json();
      if (statusData.status === "error") {
        store.handleError({ message: statusData.error ?? "分析失败" });
      }
    }, 500);
  } catch (err: any) {
    store.handleError({ message: err.message ?? "网络错误" });
  }
}
</script>

<style>
/* ===== CSS Custom Properties (unchanged) ===== */
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
  --space-xs: 8px;
  --space-sm: 12px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg-root);
  color: var(--text-primary);
  letter-spacing: 0.01em;
}

/* ===== Utilities ===== */

.glass-panel {
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: 8px;
}

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
.input-field::placeholder { color: var(--text-muted); }
.input-field:focus {
  border-color: var(--cyan);
  box-shadow: var(--shadow-focus);
}

.select-field {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-root);
  border: 1px solid var(--border-glass);
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

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: var(--bg-root); }
::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--cyan); }

.divider-cyan {
  height: 1px;
  border: none;
  background: linear-gradient(90deg, var(--cyan), transparent 60%);
  margin: 0;
}

.card-group-title {
  color: var(--text-secondary);
  font-size: 14px;
  letter-spacing: 0.03em;
  font-weight: 600;
  margin-bottom: var(--space-sm);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--border-default);
}

/* ===== Animations ===== */
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
@keyframes fly-from-center {
  from {
    opacity: 0.4;
    transform: translateY(-24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
```

- [ ] **Step 2: Update AppHeader to remove bottom glow bar (moved to status bar)**

Read `AppHeader.vue` and remove the absolute-positioned bottom glow div:
```vue
<template>
  <header
    class="flex items-baseline gap-5 px-10 py-4 border-b relative"
    style="background: var(--glass-bg); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); border-color: var(--border-default);"
  >
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
```

Key changes: `px-7` → `px-10`, removed `<div class="absolute bottom-0...">` glow bar.

- [ ] **Step 3: Verify typecheck**

```bash
pnpm --filter @agenttrade/web exec vue-tsc --noEmit 2>&1 | head -30
```
Expected: no TS errors. Fix any import issues.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/App.vue packages/web/src/components/AppHeader.vue
git commit -m "refactor: two-state layout — LandingView for idle, WorkspaceView for active"
```

---

### Task 8: Remove deprecated components

**Files:**
- Delete: `packages/web/src/components/InputPanel.vue`
- Delete: `packages/web/src/components/StockInput.vue`
- Delete: `packages/web/src/components/SectorInput.vue`
- Delete: `packages/web/src/components/WorkflowSelect.vue`
- Delete: `packages/web/src/components/ModelSelect.vue`
- Delete: `packages/web/src/components/FlowView.vue`

- [ ] **Step 1: Delete deprecated component files**

```bash
rm packages/web/src/components/InputPanel.vue
rm packages/web/src/components/StockInput.vue
rm packages/web/src/components/SectorInput.vue
rm packages/web/src/components/WorkflowSelect.vue
rm packages/web/src/components/ModelSelect.vue
rm packages/web/src/components/FlowView.vue
```

- [ ] **Step 2: Verify no remaining imports reference deleted files**

```bash
grep -r "InputPanel\|StockInput\|SectorInput\|WorkflowSelect\|ModelSelect\|FlowView" packages/web/src/ --include="*.vue" --include="*.ts"
```
Expected: no output (or only in deleted files, which should be none since they're deleted).

- [ ] **Step 3: Verify typecheck still passes**

```bash
pnpm --filter @agenttrade/web exec vue-tsc --noEmit 2>&1
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/components/
git commit -m "refactor: remove deprecated components (InputPanel, StockInput, SectorInput, WorkflowSelect, ModelSelect, FlowView)"
```

---

### Task 9: Apply whitespace pass

**Files:**
- Modify: `packages/web/src/components/ReportView.vue`

- [ ] **Step 1: Update ReportView padding**

Current `ReportView.vue` uses `px-8 pb-8` (line 2). Change to `px-10 pb-10`:
```vue
<div v-if="store.report" class="px-10 pb-10 pt-2" style="animation: fade-in 0.4s ease-out;">
```

Also increase the report content area padding (line 22: `p-7` → `p-8`):
```vue
<div class="p-8">
```

- [ ] **Step 2: Update AppHeader to px-10 (done in Task 7 Step 2)**

Already done — verify: the `AppHeader.vue` in Task 7 Step 2 uses `px-10`.

- [ ] **Step 3: Update AnalysisStatusBar to px-10 (done in Task 5 Step 1)**

Already done — verify: the `AnalysisStatusBar.vue` created in Task 5 uses `px-10 py-3`.

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter @agenttrade/web exec vue-tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ReportView.vue
git commit -m "style: increase whitespace — px-10 throughout content areas"
```

---

### Task 10: Final verification

**Files:**
- All modified files

- [ ] **Step 1: Run typecheck**

```bash
pnpm --filter @agenttrade/web exec vue-tsc --noEmit 2>&1
```
Expected: zero errors.

- [ ] **Step 2: Run build**

```bash
pnpm --filter @agenttrade/web build 2>&1
```
Expected: build succeeds.

- [ ] **Step 3: Run tests**

```bash
pnpm --filter @agenttrade/web test -- --run 2>&1
```
Expected: all tests pass.

- [ ] **Step 4: Fix any issues found**

If typecheck/build/tests fail, fix the issues and re-run until clean.

- [ ] **Step 5: Commit final fixes (if any)**

```bash
git add -A
git commit -m "chore: final verification fixes"
```

- [ ] **Step 6: Final commit with all changes**

```bash
git status
git log --oneline -10
```
Expected: all tasks committed, working tree clean.

---

## Self-Review

### 1. Spec coverage

| Spec requirement | Task |
|-----------------|------|
| 个股/板块 nav tab switching | Task 4 (LandingView tabs) |
| Centered input on entry | Task 4 (LandingView centered layout) |
| Autocomplete suggestions | Task 3 (useAutocomplete) + Task 4 (AutoComplete) |
| Workflow selection | Task 4 (Select component) |
| Animate to top after input | Task 5 (AnalysisStatusBar fly-in) + Task 7 (two-state switch) |
| PrimeVue dark components | Task 1 (install + unstyled config) + Task 4 (pt passthrough) |
| Whitespace/padding | Task 9 (px-10 pass) + Task 7 (AppHeader px-10) |
| Remove old components | Task 8 |

### 2. Placeholder scan
No TBD, TODO, "implement later", or vague steps. Every step has concrete code or commands.

### 3. Type consistency
- `Suggestion { code, name }` defined in Task 3, consumed in Task 4 ✓
- `targetType` defined in Task 2, consumed in Tasks 3, 4, 5 ✓
- `useAutocomplete(query, targetType)` signature defined in Task 3, called in Task 4 ✓
- Store `target`, `workflow`, `status` consumed in Tasks 5, 6, 7 ✓
