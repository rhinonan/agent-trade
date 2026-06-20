<template>
  <div class="mb-6">
    <h3 class="text-[15px] font-semibold text-[#e1e4e8] mb-3.5">多空分布</h3>
    <div class="flex flex-col gap-2.5">
      <div class="flex items-center gap-2.5">
        <span class="w-[60px] text-[13px]">🟢 看多</span>
        <div class="flex-1 h-5 bg-[#21262d] rounded overflow-hidden">
          <div class="h-full rounded bg-[#238636] transition-[width] duration-600" :style="{ width: bullPct + '%' }"></div>
        </div>
        <span class="w-[30px] text-sm font-semibold text-right">{{ sentiments.bullish }}</span>
      </div>
      <div class="flex items-center gap-2.5">
        <span class="w-[60px] text-[13px]">🔴 看空</span>
        <div class="flex-1 h-5 bg-[#21262d] rounded overflow-hidden">
          <div class="h-full rounded bg-[#da3633] transition-[width] duration-600" :style="{ width: bearPct + '%' }"></div>
        </div>
        <span class="w-[30px] text-sm font-semibold text-right">{{ sentiments.bearish }}</span>
      </div>
      <div class="flex items-center gap-2.5">
        <span class="w-[60px] text-[13px]">⚪ 中性</span>
        <div class="flex-1 h-5 bg-[#21262d] rounded overflow-hidden">
          <div class="h-full rounded bg-[#484f58] transition-[width] duration-600" :style="{ width: neutralPct + '%' }"></div>
        </div>
        <span class="w-[30px] text-sm font-semibold text-right">{{ sentiments.neutral }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  sentiments: { bullish: number; bearish: number; neutral: number };
}>();

const total = computed(() => props.sentiments.bullish + props.sentiments.bearish + props.sentiments.neutral || 1);

const bullPct = computed(() => Math.round((props.sentiments.bullish / total.value) * 100));
const bearPct = computed(() => Math.round((props.sentiments.bearish / total.value) * 100));
const neutralPct = computed(() => Math.round((props.sentiments.neutral / total.value) * 100));
</script>
