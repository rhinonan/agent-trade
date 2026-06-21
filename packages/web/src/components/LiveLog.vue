<template>
  <div class="flex flex-col flex-1 min-h-0">
    <div class="flex items-center justify-between mb-4 pb-3 border-b" style="border-color: var(--border-default);">
      <h2 class="text-sm font-semibold" style="color: var(--text-primary); letter-spacing: 0.02em;">实时输出</h2>
      <span v-if="isRunning" class="inline-flex items-center gap-1.5 text-xs" style="color: var(--cyan);">
        <span class="inline-block w-2 h-2 rounded-full" style="background: var(--cyan); box-shadow: 0 0 6px var(--cyan); animation: glow-pulse 1.2s ease-in-out infinite;"></span>
        运行中
      </span>
    </div>
    <div
      ref="logContainer"
      class="flex-1 min-h-0 overflow-y-auto p-4 rounded-lg font-mono text-[13px] leading-relaxed relative"
      style="background: var(--bg-root); border: 1px solid var(--border-default);"
    >
      <!-- scan line overlay -->
      <div
        class="absolute inset-0 pointer-events-none overflow-hidden rounded-lg"
        style="background: linear-gradient(180deg, transparent 60%, rgba(0, 212, 255, 0.015) 60.5%, transparent 61%); animation: scan-line 6s linear infinite;"
      ></div>
      <div v-if="logs.length === 0" class="text-center py-6" style="color: var(--text-muted);">
        等待输出...
      </div>
      <div
        v-for="(entry, index) in logs"
        :key="index"
        class="flex gap-2 py-1 relative"
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
