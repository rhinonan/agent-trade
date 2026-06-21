<template>
  <div
    class="flex-1 flex flex-col overflow-y-auto px-10 py-8"
    style="animation: fade-in 0.3s ease-out;"
  >
    <!-- Step progress -->
    <StepProgress :steps="store.steps" />

    <!-- Divider -->
    <div class="divider-cyan my-7"></div>

    <!-- Content area: LiveLog (runnning) or ReportView (complete) -->
    <div
      v-if="store.status === 'complete'"
      class="flex-1"
      style="animation: fade-in 0.4s ease-out;"
    >
      <ReportView />
      <div class="flex justify-center mt-8 pb-6">
        <button
          class="glass-panel px-6 py-3 text-sm cursor-pointer transition-all hover:border-[var(--cyan)] hover:text-[var(--cyan)]"
          style="color: var(--text-secondary);"
          @click="store.reset()"
        >
          ↻ 新分析
        </button>
      </div>
    </div>

    <div
      v-else
      class="glass-panel p-5 flex-1 flex flex-col min-h-0"
    >
      <LiveLog :logs="store.logs" :is-running="store.isRunning" />
    </div>

    <!-- Error state -->
    <div
      v-if="store.status === 'error'"
      class="glass-panel mt-6 p-5"
      style="border-color: rgba(255, 68, 102, 0.3);"
    >
      <div class="flex items-center gap-3">
        <span style="color: var(--rose); font-size: 18px;">⚠</span>
        <div>
          <h3 class="text-sm font-semibold" style="color: var(--rose);">分析失败</h3>
          <p class="text-sm mt-1" style="color: var(--text-secondary);">{{ store.error }}</p>
        </div>
        <button
          class="ml-auto px-4 py-2 rounded-md text-sm font-medium cursor-pointer transition-all"
          style="background: var(--bg-surface); color: var(--text-secondary); border: 1px solid var(--border-default);"
          @click="store.reset()"
        >
          ↻ 新分析
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAnalysisStore } from "@/stores/analysis";
import StepProgress from "./StepProgress.vue";
import LiveLog from "./LiveLog.vue";
import ReportView from "./ReportView.vue";

const store = useAnalysisStore();
</script>
