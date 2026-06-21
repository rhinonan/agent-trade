<template>
  <div class="glass-panel p-[18px] flex gap-3" style="overflow: hidden;">
    <!-- left accent bar -->
    <div
      class="w-[3px] flex-shrink-0 rounded-full self-stretch"
      style="background: linear-gradient(180deg, var(--cyan), var(--teal)); box-shadow: 0 0 8px rgba(0, 212, 255, 0.4);"
    ></div>
    <div class="flex-1">
      <h3 class="text-[15px] font-semibold mb-3" style="color: var(--cyan); letter-spacing: 0.02em;">综合研判</h3>
      <div class="text-sm leading-relaxed whitespace-pre-wrap" style="color: var(--text-primary);">
        <p>{{ conclusion }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ conclusion: string }>();
</script>
