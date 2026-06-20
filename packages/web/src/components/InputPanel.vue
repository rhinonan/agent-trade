<template>
  <div>
    <h2 class="text-base font-semibold text-[#e1e4e8] mb-5 pb-2.5 border-b border-[#30363d]">分析参数</h2>

    <StockInput v-model="stockCode" />
    <SectorInput v-model="sectorName" />
    <WorkflowSelect v-model="selectedWorkflow" />
    <ModelSelect
      v-model:provider="selectedProvider"
      v-model:model="selectedModel"
    />

    <div v-if="error" class="px-3 py-2.5 mb-3.5 bg-[#49020233] border border-[#f8514966] rounded-md text-[#f85149] text-[13px]">{{ error }}</div>

    <button
      class="w-full p-3 bg-[#238636] border-none rounded-md text-white text-[15px] font-semibold cursor-pointer transition-colors mb-3 hover:enabled:bg-[#2ea043] disabled:bg-[#21262d] disabled:text-[#484f58] disabled:cursor-not-allowed"
      :disabled="isRunning || !canStart"
      @click="startAnalysis"
    >
      {{ isRunning ? "⏳ 分析中..." : "🔍 开始分析" }}
    </button>

    <div v-if="isRunning && steps.length > 0" class="mt-3">
      <p class="text-[13px] text-[#8b949e]">
        进度: {{ completedSteps }}/{{ steps.length }} 步骤
      </p>
    </div>

    <button
      v-if="status === 'complete' || status === 'error'"
      class="w-full p-2.5 bg-[#21262d] border border-[#30363d] rounded-md text-sm text-[#8b949e] cursor-pointer transition-all hover:bg-[#30363d] hover:text-[#e1e4e8]"
      @click="store.reset()"
    >
      🔄 新分析
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
  } catch (err: any) {
    error.value = err.message ?? "网络错误";
    store.handleError({ message: error.value! });
  }
}
</script>
