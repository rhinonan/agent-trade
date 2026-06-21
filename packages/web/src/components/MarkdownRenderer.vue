<template>
  <div class="markdown-body" v-html="html"></div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ content: string }>();

const html = computed(() => {
  if (!props.content) return "";
  // Strip trailing JSON code block from LLM output for display
  const cleaned = props.content.replace(/\n?```json\s*\{[\s\S]*?\}\s*```\s*$/, "").trim();
  return cleaned;
});
</script>

<style scoped>
.markdown-body {
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.75;
  letter-spacing: 0.01em;
}

/* Headings */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  color: var(--text-primary);
  font-weight: 600;
  letter-spacing: 0.02em;
  margin: 1.5em 0 0.6em;
}

.markdown-body :deep(h1) {
  font-size: 1.35em;
  border-bottom: 1px solid var(--border-default);
  padding-bottom: 0.4em;
}

.markdown-body :deep(h2) {
  font-size: 1.15em;
  color: var(--cyan);
}

.markdown-body :deep(h3) {
  font-size: 1.05em;
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child),
.markdown-body :deep(h4:first-child) {
  margin-top: 0;
}

/* Paragraphs */
.markdown-body :deep(p) {
  margin: 0.6em 0;
}

/* Bold and italic */
.markdown-body :deep(strong) {
  color: var(--cyan);
  font-weight: 600;
}

.markdown-body :deep(em) {
  color: var(--text-primary);
}

/* Lists */
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.markdown-body :deep(li) {
  margin: 0.3em 0;
  color: var(--text-primary);
}

.markdown-body :deep(ul li) {
  list-style: none;
  position: relative;
}

.markdown-body :deep(ul li)::before {
  content: "▸";
  position: absolute;
  left: -1.3em;
  color: var(--cyan);
  font-size: 11px;
  top: 0.15em;
}

/* Code */
.markdown-body :deep(code) {
  background: rgba(0, 212, 255, 0.08);
  border: 1px solid rgba(0, 212, 255, 0.15);
  border-radius: 4px;
  padding: 1px 6px;
  font-family: "SF Mono", "Fira Code", "Consolas", monospace;
  font-size: 0.88em;
  color: var(--cyan);
}

.markdown-body :deep(pre) {
  background: var(--bg-root);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  padding: 14px 16px;
  overflow-x: auto;
  margin: 0.8em 0;
  line-height: 1.5;
}

.markdown-body :deep(pre code) {
  background: none;
  border: none;
  padding: 0;
  color: var(--text-primary);
  font-size: 0.85em;
}

/* Blockquote */
.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--cyan);
  margin: 0.6em 0;
  padding: 0.4em 0 0.4em 1em;
  color: var(--text-secondary);
  background: rgba(0, 212, 255, 0.03);
  border-radius: 0 4px 4px 0;
}

/* Horizontal rule */
.markdown-body :deep(hr) {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, var(--cyan), transparent 60%);
  margin: 1.2em 0;
}

/* Links */
.markdown-body :deep(a) {
  color: var(--cyan);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

/* Tables */
.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.8em 0;
  font-size: 0.93em;
}

.markdown-body :deep(th) {
  background: rgba(0, 212, 255, 0.06);
  border: 1px solid var(--border-default);
  padding: 8px 12px;
  text-align: left;
  color: var(--cyan);
  font-weight: 600;
}

.markdown-body :deep(td) {
  border: 1px solid var(--border-default);
  padding: 6px 12px;
  color: var(--text-primary);
}

/* Numbered items with accent */
.markdown-body :deep(ol) {
  counter-reset: item;
}

.markdown-body :deep(ol li) {
  counter-increment: item;
  list-style: none;
  position: relative;
}

.markdown-body :deep(ol li)::before {
  content: counter(item);
  position: absolute;
  left: -1.6em;
  color: var(--cyan);
  font-size: 0.85em;
  font-weight: 600;
  font-family: "SF Mono", "Fira Code", monospace;
  background: rgba(0, 212, 255, 0.08);
  border-radius: 3px;
  width: 1.6em;
  text-align: center;
  line-height: 1.5;
}
</style>
