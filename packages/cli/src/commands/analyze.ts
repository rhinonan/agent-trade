import { AgentRegistry, registerInstances, WorkflowScheduler, createContext, setDefaultLLMProvider } from "@agenttrade/core";
import { TechnicalAnalystAgent, FinancialReportAgent, JudgeAgent } from "@agenttrade/agents";
import { DataClient } from "@agenttrade/data-client";
import type { AnalysisTarget } from "@agenttrade/core";
import { bullBearWorkflow } from "../../../../workflows/bull-bear.js";
import { quickScanWorkflow } from "../../../../workflows/quick-scan.js";
import { Reporter } from "../reporter.js";

const WORKFLOWS: Record<string, any> = {
  "bull-bear": bullBearWorkflow,
  "quick-scan": quickScanWorkflow,
};

export interface AnalyzeOptions {
  code?: string;
  sector?: string;
  index?: string;
  workflow: string;
  provider?: "anthropic" | "openai";
  model?: string;
  dataServiceUrl?: string;
}

export async function runAnalyze(options: AnalyzeOptions): Promise<void> {
  // Setup
  if (options.provider) setDefaultLLMProvider(options.provider);
  if (options.dataServiceUrl) process.env.DATA_SERVICE_URL = options.dataServiceUrl;

  const workflowDag = WORKFLOWS[options.workflow];
  if (!workflowDag) {
    console.error(`Unknown workflow: ${options.workflow}`);
    console.error(`Available: ${Object.keys(WORKFLOWS).join(", ")}`);
    process.exit(1);
  }

  // Determine target
  let target: AnalysisTarget;
  if (options.sector) {
    target = { type: "sector", code: options.sector };
    // Lookup sector name
    const client = new DataClient({ baseUrl: options.dataServiceUrl });
    try {
      const info = await client.sector.constituents(options.sector);
      target.name = info.name;
    } catch { /* ignore, use code as name */ }
  } else if (options.index) {
    target = { type: "index", code: options.index };
  } else if (options.code) {
    target = { type: "stock", code: options.code };
    const client = new DataClient({ baseUrl: options.dataServiceUrl });
    try {
      const info = await client.reference.get(options.code);
      target.name = info.name;
    } catch { /* ignore */ }
  } else {
    console.error("Please specify --code, --sector, or --index");
    process.exit(1);
  }

  // Setup agent registry
  const registry = new AgentRegistry();
  registerInstances(registry, [
    new TechnicalAnalystAgent({ id: "technical-bull", personality: { stance: "bullish", style: "optimistic" } }),
    new TechnicalAnalystAgent({ id: "technical-bear", personality: { stance: "bearish", style: "skeptical" } }),
    new TechnicalAnalystAgent({ id: "technical-neutral", personality: { stance: "neutral" } }),
    new FinancialReportAgent({ id: "financial-bull", personality: { stance: "bullish" } }),
    new FinancialReportAgent({ id: "financial-bear", personality: { stance: "bearish" } }),
    new FinancialReportAgent({ id: "financial-neutral", personality: { stance: "neutral" } }),
    new JudgeAgent(),
  ]);

  const scheduler = new WorkflowScheduler(registry);
  const context = createContext(target, `对${target.name ?? target.code}进行分析`, options.workflow);
  const reporter = new Reporter();

  reporter.startAnalysis(target, options.workflow);

  const result = await scheduler.execute(workflowDag, context,
    { provider: options.provider, modelName: options.model },
    {
      onStepStart: (stepId, type) => reporter.onStepStart(stepId, type, registry),
      onStepComplete: (stepId, ctx) => reporter.onStepComplete(stepId, ctx),
    }
  );

  reporter.renderReport(result);
}
