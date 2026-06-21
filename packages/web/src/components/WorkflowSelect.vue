<template>
  <div class="mb-4">
    <label class="block mb-1.5 font-medium" style="color: var(--text-secondary); font-size: 13px; letter-spacing: 0.03em; text-transform: uppercase;">分析工作流</label>
    <select
      :value="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      class="select-field"
    >
      <option value="bull-bear">🐂🐻 牛熊对抗 (Bull-Bear)</option>
      <option value="quick-scan">⚡ 快速扫描 (Quick Scan)</option>
    </select>
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>();
defineEmits<{ (e: "update:modelValue", value: string): void }>();
</script>
