<template>
  <div class="mb-6">
    <h3 class="text-[15px] font-semibold text-[#e1e4e8] mb-3.5">各方观点</h3>
    <div
      v-for="(f, i) in findings"
      :key="i"
      class="p-3.5 mb-2.5 bg-[#0d1117] border border-[#30363d] rounded-lg"
      :class="{
        'border-l-[3px] border-l-[#238636]': f.sentiment === 'bullish',
        'border-l-[3px] border-l-[#da3633]': f.sentiment === 'bearish',
        'border-l-[3px] border-l-[#8b949e]': f.sentiment === 'neutral',
      }"
    >
      <div class="flex justify-between mb-2">
        <span class="text-[13px] font-semibold text-[#58a6ff]">{{ f.agent }}</span>
        <span class="text-xs text-[#8b949e]">{{ Math.round(f.confidence * 100) }}% 置信度</span>
      </div>
      <p class="text-sm text-[#e1e4e8] leading-relaxed mb-1.5">{{ f.conclusion }}</p>
      <ul v-if="f.reasoning && f.reasoning.length > 0" class="mt-2 pl-[18px]">
        <li v-for="(r, j) in f.reasoning" :key="j" class="text-[13px] text-[#8b949e] mb-0.5">{{ r }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Finding } from "@/stores/analysis";

defineProps<{ findings: Finding[] }>();
</script>
