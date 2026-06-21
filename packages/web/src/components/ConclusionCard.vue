<template>
  <div class="glass-panel p-6 flex gap-5" style="overflow: hidden;">
    <!-- left accent bar -->
    <div
      class="w-[3px] flex-shrink-0 rounded-full self-stretch"
      style="background: linear-gradient(180deg, var(--cyan), var(--teal)); box-shadow: 0 0 8px rgba(0, 212, 255, 0.4);"
    ></div>
    <div class="flex-1 min-w-0">
      <h3 class="text-base font-semibold mb-4" style="color: var(--cyan); letter-spacing: 0.02em;">综合研判</h3>
      <MarkdownRenderer :content="conclusion" />
    </div>
  </div>
</template>

<script setup lang="ts">
import MarkdownRenderer from "./MarkdownRenderer.vue";

defineProps<{ conclusion: string }>();
</script>
