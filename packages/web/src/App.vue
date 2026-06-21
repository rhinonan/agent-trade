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
  store.setTargetType(payload.code ? 'stock' : 'sector');

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

    if (!res.ok) {
      let message = "请求失败";
      try {
        const data = await res.json();
        message = data.message ?? message;
      } catch { /* non-JSON body — use default message */ }
      store.handleError({ message });
      return;
    }

    const data = await res.json();
    store.sessionId = data.sessionId;
    connectWS(data.sessionId);

    // Poll fallback
    const pollTimer = setTimeout(async () => {
      try {
        const statusRes = await fetch(`/api/analyze/${data.sessionId}`);
        if (!statusRes.ok) return;
        const statusData = await statusRes.json();
        if (statusData.status === "error") {
          store.handleError({ message: statusData.error ?? "分析失败" });
        }
      } catch { /* poll failed silently — WS is the primary path */ }
    }, 500);
  } catch (err: unknown) {
    store.handleError({ message: err instanceof Error ? err.message : "网络错误" });
  }
}
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

/* PrimeVue dark overrides — force dark surfaces in styled mode */
.p-autocomplete-input,
.p-select-label,
.p-select-list-container,
.p-autocomplete-panel {
  background: var(--bg-root) !important;
  border-color: var(--border-glass) !important;
  color: var(--text-primary) !important;
}
.p-select-option,
.p-autocomplete-option {
  background: var(--bg-root) !important;
  color: var(--text-primary) !important;
}
.p-select-option:hover,
.p-autocomplete-option:hover {
  background: rgba(0, 212, 255, 0.08) !important;
}
.p-select-option.p-focus,
.p-autocomplete-option.p-focus {
  background: rgba(0, 212, 255, 0.12) !important;
}
.p-select-overlay,
.p-autocomplete-overlay {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border-glass) !important;
}

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
