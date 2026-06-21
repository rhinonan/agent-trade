<template>
  <div class="mb-8">
    <h3 class="text-[16px] font-semibold mb-4" style="color: var(--text-primary); letter-spacing: 0.02em;">各方观点</h3>
    <div class="grid grid-cols-2 gap-4 max-[960px]:grid-cols-1">
      <div
        v-for="(f, i) in findings"
        :key="i"
        class="glass-panel p-4 relative"
        style="overflow: hidden; animation: fade-in 0.3s ease-out;"
      >
        <!-- left accent bar -->
        <div
          class="absolute left-0 top-0 bottom-0 w-[3px]"
          :style="{ background: accentColor(f.sentiment), boxShadow: '0 0 8px ' + accentColor(f.sentiment) }"
        ></div>
        <div class="flex justify-between mb-2 pl-1.5">
          <span class="text-[13px] font-semibold" style="color: var(--cyan);">{{ f.agent }}</span>
          <span class="text-[12px] font-mono" style="color: var(--text-secondary);">{{ Math.round(f.confidence * 100) }}%</span>
        </div>
        <p class="text-[13px] leading-relaxed mb-2 pl-1.5" style="color: var(--text-primary);">{{ f.conclusion }}</p>
        <ul v-if="f.reasoning && f.reasoning.length > 0" class="mt-2 pl-[18px]">
          <li v-for="(r, j) in f.reasoning" :key="j" class="text-[12px] mb-1" style="color: var(--text-secondary); list-style: '▸ ';">
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
