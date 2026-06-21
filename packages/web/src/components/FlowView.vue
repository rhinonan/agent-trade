<template>
  <div class="p-5 flex flex-col gap-6 flex-1">
    <div class="glass-panel-glow p-5">
      <StepProgress :steps="store.steps" />
    </div>
    <div class="glass-panel p-5">
      <LiveLog :logs="store.logs" :is-running="store.isRunning" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAnalysisStore } from "@/stores/analysis";
import StepProgress from "./StepProgress.vue";
import LiveLog from "./LiveLog.vue";

const store = useAnalysisStore();
</script>
