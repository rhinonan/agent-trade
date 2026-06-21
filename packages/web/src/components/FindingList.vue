<template>
  <div class="mb-6">
    <h3 class="text-[15px] font-semibold mb-3.5" style="color: var(--text-primary); letter-spacing: 0.02em;">各方观点</h3>
    <div class="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
      <div
        v-for="(f, i) in findings"
        :key="i"
        class="glass-panel p-3 relative"
        style="overflow: hidden; animation: fade-in 0.3s ease-out;"
      >
        <!-- left accent bar -->
        <div
          class="absolute left-0 top-0 bottom-0 w-[3px]"
          :style="{ background: accentColor(f.sentiment), boxShadow: '0 0 8px ' + accentColor(f.sentiment) }"
        ></div>
        <div class="flex justify-between mb-1.5 pl-1">
          <span class="text-[12px] font-semibold" style="color: var(--cyan);">{{ f.agent }}</span>
          <span class="text-[11px] font-mono" style="color: var(--text-secondary);">{{ Math.round(f.confidence * 100) }}%</span>
        </div>
        <p class="text-[13px] leading-relaxed mb-1 pl-1" style="color: var(--text-primary);">{{ f.conclusion }}</p>
        <ul v-if="f.reasoning && f.reasoning.length > 0" class="mt-1.5 pl-[14px]">
          <li v-for="(r, j) in f.reasoning" :key="j" class="text-[12px] mb-0.5" style="color: var(--text-secondary); list-style: '▸ ';">
            {{ r }}
          </li>
        </ul>
      </div>
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
