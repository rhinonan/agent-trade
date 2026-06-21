<template>
  <div class="mb-6">
    <h3 class="text-[15px] font-semibold mb-3.5" style="color: var(--text-primary); letter-spacing: 0.02em;">多空分布</h3>
    <div class="flex flex-col gap-2.5">
      <!-- 看多 -->
      <div class="flex items-center gap-2.5">
        <span class="w-[60px] text-[13px] inline-flex items-center gap-1" style="color: var(--teal);">
          <span class="inline-block w-2 h-2 rounded-full" style="background: var(--teal); box-shadow: 0 0 4px var(--teal);"></span>
          看多
        </span>
        <div class="flex-1 h-5 rounded overflow-hidden" style="background: var(--bg-root);">
          <div
            class="h-full rounded transition-all duration-600"
            style="background: linear-gradient(90deg, var(--teal), var(--cyan)); box-shadow: 0 0 8px rgba(0, 229, 160, 0.3);"
            :style="{ width: bullPct + '%' }"
          ></div>
        </div>
        <span class="w-[30px] text-sm font-semibold text-right font-mono" style="color: var(--teal);">{{ sentiments.bullish }}</span>
      </div>
      <!-- 看空 -->
      <div class="flex items-center gap-2.5">
        <span class="w-[60px] text-[13px] inline-flex items-center gap-1" style="color: var(--rose);">
          <span class="inline-block w-2 h-2 rounded-full" style="background: var(--rose); box-shadow: 0 0 4px var(--rose);"></span>
          看空
        </span>
        <div class="flex-1 h-5 rounded overflow-hidden" style="background: var(--bg-root);">
          <div
            class="h-full rounded transition-all duration-600"
            style="background: linear-gradient(90deg, var(--rose), #ff7799); box-shadow: 0 0 8px rgba(255, 68, 102, 0.3);"
            :style="{ width: bearPct + '%' }"
          ></div>
        </div>
        <span class="w-[30px] text-sm font-semibold text-right font-mono" style="color: var(--rose);">{{ sentiments.bearish }}</span>
      </div>
      <!-- 中性 -->
      <div class="flex items-center gap-2.5">
        <span class="w-[60px] text-[13px] inline-flex items-center gap-1" style="color: var(--text-secondary);">
          <span class="inline-block w-2 h-2 rounded-full" style="background: var(--text-secondary);"></span>
          中性
        </span>
        <div class="flex-1 h-5 rounded overflow-hidden" style="background: var(--bg-root);">
          <div
            class="h-full rounded transition-all duration-600"
            style="background: var(--border-default);"
            :style="{ width: neutralPct + '%' }"
          ></div>
        </div>
        <span class="w-[30px] text-sm font-semibold text-right font-mono" style="color: var(--text-secondary);">{{ sentiments.neutral }}</span>
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
