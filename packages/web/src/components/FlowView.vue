<template>
  <div class="p-5 flex flex-col gap-6 flex-1">
    <StepProgress :steps="store.steps" />
    <LiveLog :logs="store.logs" :is-running="store.isRunning" />
  </div>
</template>

<script setup lang="ts">
import { useAnalysisStore } from "@/stores/analysis";
import StepProgress from "./StepProgress.vue";
import LiveLog from "./LiveLog.vue";

const store = useAnalysisStore();
</script>
