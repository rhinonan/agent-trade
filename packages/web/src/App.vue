<template>
  <div class="min-h-screen flex flex-col bg-[#0f1117] text-[#e1e4e8] font-sans">
    <AppHeader />
    <main class="flex-1 flex overflow-hidden">
      <aside class="w-80 min-w-80 bg-[#161b22] border-r border-[#30363d] p-5 overflow-y-auto">
        <InputPanel />
      </aside>
      <section class="flex-1 flex flex-col overflow-y-auto">
        <FlowView />
        <ReportView v-if="store.status === 'complete'" />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import AppHeader from "./components/AppHeader.vue";
import InputPanel from "./components/InputPanel.vue";
import FlowView from "./components/FlowView.vue";
import ReportView from "./components/ReportView.vue";
import { useAnalysisStore } from "@/stores/analysis";

const store = useAnalysisStore();
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0f1117; color: #e1e4e8; }
</style>
