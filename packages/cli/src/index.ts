#!/usr/bin/env node
import { Command } from "commander";
import { runAnalyze } from "./commands/analyze.js";

const program = new Command();

program
  .name("agenttrade")
  .description("AgentTrade — 多Agent对抗行情分析系统")
  .version("0.1.0");

program
  .command("analyze")
  .description("分析个股、板块或指数")
  .option("-c, --code <code>", "股票代码，如 600519")
  .option("-s, --sector <name>", "板块名称，如 CPO")
  .option("-i, --index <code>", "指数代码，如 000001")
  .option("-w, --workflow <name>", "工作流名称", "bull-bear")
  .option("-p, --provider <provider>", "LLM provider: anthropic | openai", "anthropic")
  .option("-m, --model <name>", "模型名称")
  .option("--data-service <url>", "数据服务地址", "http://localhost:9500")
  .action(async (options) => {
    try {
      await runAnalyze({
        code: options.code,
        sector: options.sector,
        index: options.index,
        workflow: options.workflow,
        provider: options.provider,
        model: options.model,
        dataServiceUrl: options.dataService,
      });
    } catch (err) {
      console.error("Error:", err);
      process.exit(1);
    }
  });

program.parse();
