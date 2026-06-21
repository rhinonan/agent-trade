<template>
  <div class="mb-4">
    <label class="block mb-1.5 font-medium" style="color: var(--text-secondary); font-size: 13px; letter-spacing: 0.03em; text-transform: uppercase;">模型</label>
    <div class="flex gap-2">
      <select
        :value="provider"
        @change="$emit('update:provider', ($event.target as HTMLSelectElement).value)"
        class="select-field"
        style="flex: 0 0 120px;"
      >
        <option value="deepseek">DeepSeek</option>
        <option value="openai">OpenAI</option>
        <option value="anthropic">Anthropic</option>
      </select>
      <input
        :value="model"
        @input="$emit('update:model', ($event.target as HTMLInputElement).value)"
        placeholder="自定义模型名称"
        type="text"
        class="input-field"
        style="flex: 1;"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ provider: string; model: string }>();
defineEmits<{
  (e: "update:provider", value: string): void;
  (e: "update:model", value: string): void;
}>();
</script>
