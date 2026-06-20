import { defineWorkflow, analyze, synthesize } from "@agenttrade/core";

export const quickScanWorkflow = defineWorkflow({
  name: "quick-scan",
  description: "快速扫描 — 技术面和基本面并行分析，裁判直接综合"
})
.step("tech", analyze({
  agent: { capability: "technical" },
  prompt: "快速扫描 {target} 的技术面，给出关键信号（一页以内）。",
}))
.step("fundamental", analyze({
  agent: { capability: "fundamental" },
  prompt: "快速扫描 {target} 的基本面，给出关键估值指标（一页以内）。",
}))
.step("summary", synthesize({
  agent: "judge",
  prompt: "快速综合技术面和基本面信息，对 {target} 给出简要研判。",
}))
.build();
