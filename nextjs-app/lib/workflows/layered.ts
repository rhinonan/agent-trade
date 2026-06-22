import { defineWorkflow, analyze, parallel, sequential, critique, synthesize, debate } from "../engine/builder.js";

export const layeredWorkflow = defineWorkflow({
  name: "layered",
  description: "四层对抗分析：感知→分析→决策→执行风控",
})
  // ====== Layer 1: 数据感知层 ======
  .step("perception-data", parallel([
    analyze({
      agent: { id: "market-data" },
      prompt: "采集 {target} 的实时行情数据：价格、涨跌幅、成交量、换手率、振幅。识别关键价格位和异常波动。",
    }),
    analyze({
      agent: { id: "sentiment-bull" },
      prompt: "从乐观角度扫描 {target} 的市场舆情：社交媒体情绪、新闻标题倾向、分析师评级变化。",
    }),
    analyze({
      agent: { id: "sentiment-bear" },
      prompt: "从谨慎角度扫描 {target} 的市场舆情：负面新闻、看空报告、风险提示。",
    }),
    analyze({
      agent: { id: "macro-data" },
      prompt: "采集影响 {target} 的宏观指标：利率、汇率、PMI、CPI、政策动态。",
    }),
    analyze({
      agent: { id: "capital-flow" },
      prompt: "采集 {target} 的资金流向数据：主力净流入/流出、北向资金、大单动向、融资融券余额。",
    }),
    analyze({
      agent: { id: "institutional" },
      prompt: "采集 {target} 的机构动向：基金持仓变化、大宗交易、龙虎榜动向。",
    }),
  ]))
  // ====== Layer 2: 分析层 ======
  .step("analysis-bull-panel", parallel([
    analyze({
      agent: { id: "technical-bull" },
      prompt: "从技术面看多 {target}：均线多头排列、MACD金叉、放量突破、支撑位企稳。给出3条多头的核心理由。",
    }),
    analyze({
      agent: { id: "financial-bull" },
      prompt: "从基本面看多 {target}：盈利增长、估值合理、行业景气、竞争优势。给出3条看多的核心理由。",
    }),
    analyze({
      agent: { id: "valuation-bull" },
      prompt: "从估值角度看多 {target}：PE/PB分位、DCF估值、同业对比、成长性溢价。",
    }),
    analyze({
      agent: { id: "pattern-bull" },
      prompt: "从形态识别看多 {target}：底部反转形态、突破形态、趋势延续信号。",
    }),
    analyze({
      agent: { id: "volume-bull" },
      prompt: "从量价关系看多 {target}：放量上涨、缩量调整、量价配合度。",
    }),
  ]))
  .step("analysis-bear-panel", parallel([
    analyze({
      agent: { id: "technical-bear" },
      prompt: "从技术面看空 {target}：死叉、破位、顶背离、缩量反弹。给出3条看空的核心理由。",
    }),
    analyze({
      agent: { id: "financial-bear" },
      prompt: "从基本面看空 {target}：盈利下滑、估值泡沫、行业衰退、竞争威胁。给出3条看空的核心理由。",
    }),
    analyze({
      agent: { id: "valuation-bear" },
      prompt: "从估值角度看空 {target}：高估风险、盈利下调预期、现金流恶化。",
    }),
    analyze({
      agent: { id: "pattern-bear" },
      prompt: "从形态识别看空 {target}：顶部反转形态、破位下行、下跌中继。",
    }),
    analyze({
      agent: { id: "volume-bear" },
      prompt: "从量价关系看空 {target}：放量下跌、缩量反弹、主力出货迹象。",
    }),
  ]))
  .step("analysis-event", analyze({
    agent: { id: "event-driven" },
    prompt: "分析影响 {target} 的近期事件：财报发布、政策变化、行业事件、突发事件。评估事件的短期和中期影响。",
  }))
  .step("analysis-cross-critique", parallel([
    critique({
      reviewer: "technical-bull",
      targetStep: "analysis-bear-panel",
      prompt: "作为牛方，逐条审阅熊方的看空理由。哪些论据不够有力？哪些风险被夸大？请具体反驳。",
    }),
    critique({
      reviewer: "technical-bear",
      targetStep: "analysis-bull-panel",
      prompt: "作为熊方，逐条审阅牛方的看多理由。哪些信号是假突破？哪些利好已被定价？请具体反驳。",
    }),
  ]))
  // ====== Layer 3: 决策层 ======
  .step("decision-judge", synthesize({
    agent: "judge",
    prompt: "综合感知层数据和多空双方分析及互驳，对 {target} 做出综合研判。给出核心结论和关键论据。",
  }))
  .step("decision-quant", analyze({
    agent: { id: "quant-analyst" },
    prompt: "基于前面的分析，从量化角度评估 {target}：风险收益比、波动率预期、胜率评估、最大回撤预估。",
  }))
  .step("decision-portfolio", analyze({
    agent: { id: "portfolio-mgr" },
    prompt: "给出 {target} 的仓位配置建议：建议仓位比例、加仓/减仓条件、组合中的角色定位。",
  }))
  .step("decision-timing", parallel([
    analyze({
      agent: { id: "timing-aggressive" },
      prompt: "从激进角度给出 {target} 的买入时机和卖出时机建议：突破追入还是回调低吸？",
    }),
    analyze({
      agent: { id: "timing-conservative" },
      prompt: "从保守角度给出 {target} 的买入时机和卖出时机建议：等待确认信号还是观望？",
    }),
  ]))
  .step("decision-hedging", analyze({
    agent: { id: "hedging" },
    prompt: "为 {target} 的持仓设计对冲方案：可用的对冲工具、对冲比例、触发条件。",
  }))
  // ====== Layer 4: 执行与风控层 ======
  .step("execution-plan", analyze({
    agent: { id: "execution" },
    prompt: "制定 {target} 的具体执行计划：下单方式（市价/限价）、分批建仓节奏、执行时间窗口。",
  }))
  .step("execution-risk", analyze({
    agent: { id: "risk-ctrl" },
    prompt: "设定 {target} 的风控参数：止损位、止盈位、最大回撤容忍度、仓位上限。",
  }))
  .step("execution-debate", debate({
    agents: [{ id: "execution" }, { id: "risk-ctrl" }],
    maxRounds: 2,
    prompt: "执行Agent和风控Agent就 {target} 的仓位比例和止损位进行讨论。执行Agent倾向于更积极的操作，风控Agent强调风险控制。请各自阐述理由并尝试达成共识。",
  }))
  .step("execution-compliance", analyze({
    agent: { id: "compliance" },
    prompt: "检查 {target} 的交易计划是否合规：是否触及交易限制、信息披露要求、内部交易规则。",
  }))
  .step("execution-cost", analyze({
    agent: { id: "cost-optimizer" },
    prompt: "优化 {target} 的交易成本：滑点预估、手续费、印花税影响、最优执行算法建议。",
  }))
  // ====== Final ======
  .step("final", synthesize({
    agent: "judge",
    prompt: "综合四层所有分析（感知→分析→决策→执行风控），给出 {target} 的最终投资方案。包括：总体研判、仓位建议、买卖时机、风控参数、执行计划。",
  }))
  .build();
