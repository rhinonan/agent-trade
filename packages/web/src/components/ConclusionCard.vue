<template>
  <div class="p-[18px] bg-[#0d1117] border border-[#30363d] border-t-[3px] border-t-[#58a6ff] rounded-lg">
    <h3 class="text-[15px] font-semibold text-[#58a6ff] mb-3">📋 综合研判</h3>
    <div class="text-sm text-[#e1e4e8] leading-relaxed whitespace-pre-wrap">
      <p>{{ conclusion }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ conclusion: string }>();
</script>
