<template>
  <div>
    <div class="flex items-center justify-between mb-3 pb-2 border-b border-[#30363d]">
      <h2 class="text-sm font-semibold text-[#e1e4e8]">实时输出</h2>
      <span v-if="isRunning" class="text-xs text-[#238636] animate-pulse">● 运行中</span>
    </div>
    <div
      ref="logContainer"
      class="h-60 overflow-y-auto p-3 bg-[#0d1117] border border-[#30363d] rounded-lg font-mono text-xs leading-relaxed"
    >
      <div v-if="logs.length === 0" class="text-[#484f58] text-center py-5">
        等待输出...
      </div>
      <div
        v-for="(entry, index) in logs"
        :key="index"
        class="flex gap-2 py-0.5"
      >
        <span class="text-[#484f58] whitespace-nowrap">{{ formatTime(entry.time) }}</span>
        <span class="text-[#58a6ff] whitespace-nowrap font-semibold">[{{ entry.agent }}]</span>
        <span
          class="break-all"
          :class="{
            'text-[#3fb950]': entry.sentiment === 'bullish',
            'text-[#f85149]': entry.sentiment === 'bearish',
            'text-[#c9d1d9]': !entry.sentiment || entry.sentiment === 'neutral',
          }"
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
</script>
