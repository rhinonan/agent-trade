<template>
  <div class="mb-4">
    <label class="block text-[13px] text-[#8b949e] mb-1.5 font-medium">模型</label>
    <div class="flex gap-2">
      <select
        :value="provider"
        @change="$emit('update:provider', ($event.target as HTMLSelectElement).value)"
        class="flex-[0_0_120px] px-3 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-md text-sm text-[#e1e4e8] outline-none cursor-pointer focus:border-[#58a6ff]"
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
        class="flex-1 px-3 py-2.5 bg-[#0d1117] border border-[#30363d] rounded-md text-sm text-[#e1e4e8] outline-none focus:border-[#58a6ff] placeholder:text-[#484f58] placeholder:text-xs"
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
