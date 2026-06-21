<template>
  <div v-if="store.report" class="px-5 py-6" style="border-top: 1px solid var(--border-default); animation: fade-in 0.4s ease-out;">
    <h2 class="text-lg font-semibold mb-5" style="color: var(--text-primary); letter-spacing: 0.02em;">
      分析报告 — {{ store.report.target.name ?? store.report.target.code }}
    </h2>
    <div class="grid grid-cols-[280px_1fr] gap-6 max-[900px]:grid-cols-1">
      <div class="glass-panel p-5">
        <SentimentChart :sentiments="store.report.sentiments" />
      </div>
      <FindingList :findings="store.report.findings" />
    </div>
    <ConclusionCard
      v-if="store.report.conclusion"
      :conclusion="store.report.conclusion"
    />
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
