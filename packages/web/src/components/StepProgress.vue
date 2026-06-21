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
