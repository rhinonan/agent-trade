<template>
  <div class="mb-4">
    <label class="block text-[13px] text-[#8b949e] mb-1.5 font-medium">股票代码</label>
    <input
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      placeholder="如 600519"
      type="text"
      maxlength="6"
      class="w-full px-3 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-md text-sm text-[#e1e4e8] outline-none transition-colors focus:border-[#58a6ff] placeholder:text-[#484f58]"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>();
defineEmits<{ (e: "update:modelValue", value: string): void }>();
</script>
