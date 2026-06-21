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

    // Poll fallback: if the session errored before WS connected, surface the error
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
