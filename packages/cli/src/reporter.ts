import chalk from "chalk";
import type { AnalysisTarget, ExecutionContext, AgentRegistry } from "@agenttrade/core";

const STEP_ICONS: Record<string, string> = {
  analyze: "\u{1F4CA}", panel: "\u{1F9D1}‍\u{1F91D}‍\u{1F9D1}", critique: "\u{2694}️",
  debate: "\u{1F5E3}️", vote: "\u{1F5F3}️", synthesize: "\u{1F4CB}",
  parallel: "⇉", sequential: "→",
};

export class Reporter {
  private startTime = 0;
  private stepCount = 0;
  private totalSteps = 0;

  startAnalysis(target: AnalysisTarget, workflowName: string): void {
    this.startTime = Date.now();
    const label = target.name ? `${target.code}（${target.name}）` : target.code;
    console.log(chalk.cyan(`\n\u{1F50D} 正在分析 ${label}...`));
    console.log(chalk.gray(`   工作流: ${workflowName} [${target.type}]`));
  }

  onStepStart(stepId: string, type: string, registry?: AgentRegistry): void {
    this.stepCount++;
    const icon = STEP_ICONS[type] ?? "•";
    console.log(chalk.yellow(`\n${icon} Step ${this.stepCount}: ${stepId} (${type})`));
  }

  onStepComplete(stepId: string, ctx: ExecutionContext): void {
    const latest = ctx.findings.filter(f => f.step === stepId || f.step.startsWith(stepId));
    for (const f of latest.slice(-3)) { // show last 3 findings from this step
      const sentimentIcon = f.analysis.sentiment === "bullish" ? "\u{1F7E2}"
        : f.analysis.sentiment === "bearish" ? "\u{1F534}" : "⚪";
      console.log(chalk.green(`   ✅ [${f.agent}] ${f.analysis.conclusion.slice(0, 80)}`));
    }
  }

  renderReport(ctx: ExecutionContext): void {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(chalk.cyan("\n" + "━".repeat(50)));
    console.log(chalk.bold(`\n\u{1F4C4} 分析报告 — ${ctx.target.name ?? ctx.target.code}`));

    const sentiments = ctx.findings.map(f => f.analysis.sentiment);
    const bulls = sentiments.filter(s => s === "bullish").length;
    const bears = sentiments.filter(s => s === "bearish").length;
    console.log(chalk.bold(`\n【多空分布】`));
    console.log(`  \u{1F7E2} 看多: ${bulls}  |  \u{1F534} 看空: ${bears}  |  ⚪ 中性: ${sentiments.length - bulls - bears}`);

    console.log(chalk.bold(`\n【各方观点】`));
    for (const f of ctx.findings) {
      const icon = f.analysis.sentiment === "bullish" ? "\u{1F7E2}"
        : f.analysis.sentiment === "bearish" ? "\u{1F534}" : "⚪";
      console.log(`  ${icon} [${f.agent}] ${f.analysis.conclusion} (置信度: ${f.analysis.confidence})`);
      for (const r of f.analysis.reasoning) {
        console.log(`     - ${r}`);
      }
    }

    const latest = ctx.findings.at(-1);
    if (latest && latest.analysis.rawOutput) {
      console.log(chalk.bold(`\n【综合研判】`));
      console.log(latest.analysis.rawOutput);
    }

    console.log(chalk.gray(`\n⏱️  耗时: ${elapsed}s  |  步骤: ${ctx.findings.length}`));
    console.log();
  }
}
