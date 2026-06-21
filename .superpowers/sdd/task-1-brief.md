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

