import { defineWorkflow, analyze, parallel, critique, synthesize } from "@agenttrade/core";

export const bullBearWorkflow = defineWorkflow({
  name: "bull-bear",
  description: "标准牛熊对抗分析 — 牛方和熊方技术面分析后互相审阅，裁判综合裁决"
})
.step("bull-analysis", analyze({
  agent: { capability: "bullish" },
  prompt: "从技术面看多 {target}，给出3条核心理由。关注均线多头排列、MACD金叉、放量突破等信号。",
}))
.step("bear-analysis", analyze({
  agent: { capability: "bearish" },
  prompt: "从技术面看空 {target}，给出3条核心理由。关注死叉、破位、顶背离、缩量等信号。",
}))
.step("cross-critique", parallel([
  critique({
    reviewer: "technical-bull",
    targetStep: "bear-analysis",
    prompt: "作为牛方，逐条审阅熊方的看空理由。哪些论据不够有力？哪些被夸大？请具体反驳。",
  }),
  critique({
    reviewer: "technical-bear",
    targetStep: "bull-analysis",
    prompt: "作为熊方，逐条审阅牛方的看多理由。哪些信号是假突破？哪些利好已被定价？请具体反驳。",
  }),
]))
.step("final", synthesize({
  agent: "judge",
  prompt: "综合牛方、熊方的分析以及双方的互驳，对 {target} 的短期走势做出最终研判。给出操作建议和关键点位。",
}))
.build();
