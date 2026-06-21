<template>
  <div class="mb-4">
    <label class="block mb-1.5 font-medium" style="color: var(--text-secondary); font-size: 13px; letter-spacing: 0.03em; text-transform: uppercase;">股票代码</label>
    <input
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      placeholder="如 600519"
      type="text"
      maxlength="6"
      class="input-field"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>();
defineEmits<{ (e: "update:modelValue", value: string): void }>();
</script>
