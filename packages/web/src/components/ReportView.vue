<template>
  <div v-if="store.report" class="px-6 pb-6" style="animation: fade-in 0.4s ease-out;">
    <!-- 分隔线 -->
    <div class="divider-cyan mb-8"></div>

    <!-- 统一玻璃面板 -->
    <div class="glass-panel overflow-hidden">
      <!-- 深色标题栏 -->
      <div
        class="flex items-center justify-between px-6 py-4 border-b"
        style="background: #0a1220; border-color: var(--border-default);"
      >
        <h2 class="text-base font-semibold" style="color: var(--text-primary); letter-spacing: 0.02em;">
          分析报告
        </h2>
        <span class="text-sm font-mono px-3 py-1 rounded-full" style="color: var(--cyan); background: rgba(0, 212, 255, 0.08); border: 1px solid rgba(0, 212, 255, 0.2);">
          {{ store.report.target.name ?? store.report.target.code }}
        </span>
      </div>

      <!-- 报告内容 -->
      <div class="p-6">
        <div class="grid grid-cols-[280px_1fr] gap-6 max-[900px]:grid-cols-1">
          <SentimentChart :sentiments="store.report.sentiments" />
          <FindingList :findings="store.report.findings" />
        </div>
        <ConclusionCard
          v-if="store.report.conclusion"
          :conclusion="store.report.conclusion"
        />
      </div>
    </div>
  </div>
  <div v-else class="px-5 py-6" style="border-top: 1px solid var(--border-default);">
    <p class="text-sm" style="color: var(--text-secondary);">等待分析完成...</p>
  </div>
</template>

<script setup lang="ts">
import { useAnalysisStore } from "@/stores/analysis";
import SentimentChart from "./SentimentChart.vue";
import FindingList from "./FindingList.vue";
import ConclusionCard from "./ConclusionCard.vue";

const store = useAnalysisStore();
</script>
