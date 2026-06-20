<template>
  <div v-if="store.report" class="px-5 py-6 border-t border-[#30363d]">
    <h2 class="text-lg font-semibold text-[#e1e4e8] mb-5">📊 分析报告 — {{ store.report.target.name ?? store.report.target.code }}</h2>
    <div class="grid grid-cols-[280px_1fr] gap-6 max-[900px]:grid-cols-1">
      <SentimentChart :sentiments="store.report.sentiments" />
      <FindingList :findings="store.report.findings" />
    </div>
    <ConclusionCard
      v-if="store.report.conclusion"
      :conclusion="store.report.conclusion"
    />
  </div>
  <div v-else class="px-5 py-6 border-t border-[#30363d]">
    <p class="text-sm text-[#8b949e]">等待分析完成...</p>
  </div>
</template>

<script setup lang="ts">
import { useAnalysisStore } from "@/stores/analysis";
import SentimentChart from "./SentimentChart.vue";
import FindingList from "./FindingList.vue";
import ConclusionCard from "./ConclusionCard.vue";

const store = useAnalysisStore();
</script>
