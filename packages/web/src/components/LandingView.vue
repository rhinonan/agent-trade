<template>
  <div
    class="flex flex-col items-center justify-center flex-1 px-6"
    style="min-height: 70vh; animation: fade-in 0.4s ease-out;"
  >
    <!-- Analysis mode tabs -->
    <div class="flex gap-1 mb-8 p-0.5 rounded-lg" style="background: var(--bg-surface); border: 1px solid var(--border-default);">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        class="px-6 py-2.5 rounded-md text-sm font-semibold transition-all duration-200"
        :style="targetType === tab.value
          ? { background: 'rgba(0, 212, 255, 0.12)', color: 'var(--cyan)', boxShadow: '0 0 8px rgba(0, 212, 255, 0.15)' }
          : { color: 'var(--text-secondary)' }"
        @click="store.setTargetType(tab.value)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Input card -->
    <div class="glass-panel-glow p-8 w-full max-w-xl">
      <!-- AutoComplete -->
      <div class="mb-5">
        <label class="block mb-2 font-medium" style="color: var(--text-secondary); font-size: 13px; letter-spacing: 0.03em; text-transform: uppercase;">
          {{ targetType === 'stock' ? '股票代码/名称' : '板块名称' }}
        </label>
        <AutoComplete
          :model-value="inputValue"
          @update:model-value="onSelect"
          :suggestions="suggestions"
          option-label="name"
          :input-style="autoCompleteInputStyle"
          :panel-style="autoCompletePanelStyle"
          :pt="{
            input: { class: 'input-field', placeholder: placeholder },
            panel: { class: 'glass-panel mt-1 max-h-64 overflow-y-auto' },
            item: { class: 'px-4 py-2.5 cursor-pointer transition-colors hover:bg-[rgba(0,212,255,0.08)] text-sm', style: 'color: var(--text-primary);' },
          }"
          @complete="onSearch"
          :delay="200"
          dropdown
        >
          <template #option="slotProps">
            <div class="flex items-center justify-between">
              <span>{{ slotProps.option.name }}</span>
              <span class="font-mono opacity-60" style="font-size: 12px; color: var(--text-muted);">{{ slotProps.option.code }}</span>
            </div>
          </template>
        </AutoComplete>
      </div>

      <!-- Workflow Select -->
      <div class="mb-6">
        <label class="block mb-2 font-medium" style="color: var(--text-secondary); font-size: 13px; letter-spacing: 0.03em; text-transform: uppercase;">分析工作流</label>
        <Select
          :model-value="selectedWorkflow"
          @update:model-value="selectedWorkflow = $event"
          :options="workflows"
          option-label="name"
          option-value="value"
          :pt="{
            input: { class: 'select-field' },
            panel: { class: 'glass-panel mt-1' },
            item: { class: 'px-4 py-2.5 cursor-pointer text-sm hover:bg-[rgba(0,212,255,0.08)]', style: 'color: var(--text-primary);' },
          }"
        />
      </div>

      <!-- Error -->
      <div
        v-if="error"
        class="px-3 py-2.5 mb-4 rounded-md text-[13px]"
        style="background: rgba(255, 68, 102, 0.08); border: 1px solid rgba(255, 68, 102, 0.4); color: var(--rose);"
      >{{ error }}</div>

      <!-- Submit -->
      <button
        class="w-full p-3.5 border-none rounded-md text-white text-[15px] font-semibold cursor-pointer transition-all relative overflow-hidden"
        :disabled="!canStart"
        :style="canStart
          ? { background: 'linear-gradient(135deg, var(--cyan), #0088aa)', boxShadow: 'var(--shadow-strong)' }
          : { background: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'not-allowed', border: '1px solid var(--border-default)' }"
        @click="$emit('submit', submitPayload)"
        @mouseenter="(e) => { if (canStart) { (e.target as HTMLElement).style.boxShadow = '0 0 24px rgba(0,212,255,0.55)'; (e.target as HTMLElement).style.transform = 'scale(1.02)'; } }"
        @mouseleave="(e) => { if (canStart) { (e.target as HTMLElement).style.boxShadow = 'var(--shadow-strong)'; (e.target as HTMLElement).style.transform = 'scale(1)'; } }"
      >
        ▶ 开始分析
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import AutoComplete from "primevue/autocomplete";
import Select from "primevue/select";
import { useAnalysisStore } from "@/stores/analysis";
import { useAutocomplete } from "@/composables/useAutocomplete";
import type { Suggestion } from "@/composables/useAutocomplete";

const emit = defineEmits<{
  (e: "submit", payload: { code?: string; sector?: string; workflow: string }): void;
}>();

const store = useAnalysisStore();

const inputValue = ref<Suggestion | null>(null);
const inputQuery = ref("");

const { suggestions } = useAutocomplete(
  computed(() => inputQuery.value),
  computed(() => store.targetType),
);

const tabs = [
  { label: "个股分析", value: "stock" as const },
  { label: "板块分析", value: "sector" as const },
];

const workflows = [
  { name: "🐂🐻 牛熊对抗 (Bull-Bear)", value: "bull-bear" },
  { name: "⚡ 快速扫描 (Quick Scan)", value: "quick-scan" },
];
const selectedWorkflow = ref("bull-bear");
const error = ref<string | null>(null);

const targetType = computed(() => store.targetType);

const placeholder = computed(() =>
  targetType.value === "stock"
    ? "输入股票代码或名称，如 600519 贵州茅台…"
    : "输入板块名称，如 CPO、新能源汽车…",
);

const canStart = computed(() => {
  return inputValue.value !== null || inputQuery.value.trim().length > 0;
});

const submitPayload = computed(() => {
  const p: { code?: string; sector?: string; workflow: string } = {
    workflow: selectedWorkflow.value,
  };
  if (targetType.value === "stock") {
    p.code = inputValue.value?.code ?? inputQuery.value.trim();
  } else {
    p.sector = inputValue.value?.code ?? inputQuery.value.trim();
  }
  return p;
});

function onSelect(value: Suggestion | null) {
  inputValue.value = value;
  if (value) {
    inputQuery.value = value.code;
  }
}

function onSearch(event: { query: string }) {
  inputQuery.value = event.query;
}

const autoCompleteInputStyle = {};
const autoCompletePanelStyle = {};
</script>
