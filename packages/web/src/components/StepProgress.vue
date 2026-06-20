<template>
  <div>
    <h2 class="text-sm font-semibold text-[#e1e4e8] mb-4 pb-2 border-b border-[#30363d]">分析流程</h2>
    <div v-if="steps.length === 0" class="text-[#484f58] text-[13px] text-center py-5">
      等待分析开始...
    </div>
    <div v-else class="flex flex-wrap items-start gap-1">
      <div
        v-for="(step, index) in steps"
        :key="step.id"
        class="flex items-center"
      >
        <div v-if="index > 0" class="flex items-center mx-1">
          <span class="w-4 h-0.5 bg-[#30363d]"></span>
          <span class="text-[#484f58] text-xs ml-0.5">→</span>
        </div>
        <div
          class="flex items-start gap-2 px-3.5 py-2.5 rounded-lg bg-[#0d1117] border min-w-[140px] transition-all duration-300"
          :class="{
            'border-[#58a6ff] shadow-[0_0_8px_#58a6ff33] animate-pulse': step.status === 'running',
            'border-[#238636]': step.status === 'complete',
            'border-[#f85149]': step.status === 'error',
            'border-[#30363d]': step.status === 'pending',
          }"
        >
          <span class="text-base">{{ statusIcon(step.status) }}</span>
          <div class="flex flex-col gap-0.5">
            <span class="text-[13px] font-semibold text-[#e1e4e8]">{{ step.id }}</span>
            <span class="text-[11px] text-[#8b949e]">{{ step.type }}</span>
            <span v-if="step.agentIds.length > 0" class="text-[11px] text-[#58a6ff]">
              {{ step.agentIds.join(", ") }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { StepState } from "@/stores/analysis";

defineProps<{ steps: StepState[] }>();

function statusIcon(status: string): string {
  switch (status) {
    case "complete": return "✅";
    case "running": return "🔄";
    case "error": return "❌";
    default: return "⏳";
  }
}
</script>
