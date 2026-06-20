<template>
  <div class="mb-4">
    <label class="block text-[13px] text-[#8b949e] mb-1.5 font-medium">分析工作流</label>
    <select
      :value="modelValue"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      class="w-full px-3 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-md text-sm text-[#e1e4e8] outline-none cursor-pointer transition-colors focus:border-[#58a6ff]"
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
