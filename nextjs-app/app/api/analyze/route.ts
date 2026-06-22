import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { AgentRegistry, WorkflowScheduler, createContext, setDefaultLLMProvider } from "@/lib/engine/index.js";
import { registerBuiltinAgents } from "@/lib/agents/index.js";
import { WORKFLOWS } from "@/lib/workflows/index.js";
import { DataClient } from "@/lib/data/client.js";
import { getSocketIO } from "@/lib/socket/server.js";
import { WS_EVENTS } from "@/lib/socket/events.js";
import type { AnalysisTarget, ExecutionContext, Finding } from "@/lib/engine/types.js";
import { getDb } from "@/lib/db/client.js";
import { AnalysisRepo } from "@/lib/db/analysis-repo.js";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { code, sector, index, workflow = "bull-bear", provider = "deepseek", model, dataServiceUrl } = body;

  if (!code && !sector && !index) {
    return NextResponse.json({ error: "Must specify code, sector, or index" }, { status: 400 });
  }

  const VALID_PROVIDERS = new Set(["deepseek", "openai", "anthropic"]);
  if (provider && !VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: `Invalid provider: ${provider}. Must be one of: deepseek, openai, anthropic` }, { status: 400 });
  }

  const sessionId = randomUUID();

  // Save to DB
  const db = getDb();
  const repo = new AnalysisRepo(db);
  repo.create({
    id: sessionId,
    targetCode: code ?? sector ?? index,
    targetName: null,
    targetType: sector ? "sector" : index ? "index" : "stock",
    workflowName: workflow,
    status: "running",
    context: "{}",
    createdAt: Date.now(),
  });

  // Run analysis asynchronously
  runAnalysis(sessionId, { code, sector, index, workflow, provider, model, dataServiceUrl }).catch(async (err) => {
    console.error(`Analysis ${sessionId} failed:`, err);
    repo.update(sessionId, { status: "error", context: JSON.stringify({ error: err.message }) });
    const io = getSocketIO();
    io.of("/analysis").to(sessionId).emit(WS_EVENTS.ANALYSIS_ERROR, { message: err.message });
  });

  return NextResponse.json({ sessionId });
}

async function runAnalysis(
  sessionId: string,
  dto: { code?: string; sector?: string; index?: string; workflow?: string; provider?: string; model?: string; dataServiceUrl?: string }
): Promise<void> {
  const db = getDb();
  const repo = new AnalysisRepo(db);
  const io = getSocketIO();
  const ns = io.of("/analysis");

  if (dto.provider) {
    setDefaultLLMProvider(dto.provider as "anthropic" | "openai" | "deepseek");
  }

  const workflowDag = WORKFLOWS[dto.workflow ?? "bull-bear"];
  if (!workflowDag) throw new Error(`Unknown workflow: ${dto.workflow}`);

  const target = await resolveTarget(dto);

  ns.to(sessionId).emit(WS_EVENTS.ANALYSIS_START, {
    target: { type: target.type, code: target.code, name: target.name },
    workflow: dto.workflow ?? "bull-bear",
  });

  const registry = new AgentRegistry();
  registerBuiltinAgents(registry);

  const scheduler = new WorkflowScheduler(registry);
  const context = createContext(target, `对${target.name ?? target.code}进行分析`, dto.workflow ?? "bull-bear");

  const result = await scheduler.execute(workflowDag, context, {
    provider: dto.provider as any,
    modelName: dto.model,
  }, {
    onStepStart: (stepId, type) => {
      const stepDef = workflowDag.steps.find(s => s.id === stepId);
      const agentIds = extractAgentIds(stepDef);
      ns.to(sessionId).emit(WS_EVENTS.STEP_START, { stepId, type, agentIds });
    },
    onStepComplete: (stepId, ctx: ExecutionContext) => {
      const stepFindings = ctx.findings
        .filter((f: Finding) => f.step === stepId || f.step.startsWith(stepId))
        .map((f: Finding) => ({
          agent: f.agent,
          conclusion: f.analysis.conclusion,
          reasoning: f.analysis.reasoning,
          sentiment: f.analysis.sentiment,
          confidence: f.analysis.confidence,
        }));
      ns.to(sessionId).emit(WS_EVENTS.STEP_COMPLETE, { stepId, findings: stepFindings });
    },
  });

  // Persist results
  repo.update(sessionId, {
    status: "complete",
    context: JSON.stringify({
      target: result.target,
      workflowName: result.workflowName,
      findings: result.findings,
      debateRounds: result.debateRounds,
    }),
  });

  ns.to(sessionId).emit(WS_EVENTS.ANALYSIS_COMPLETE, {
    context: {
      target: result.target,
      workflowName: result.workflowName,
      findings: result.findings.map((f: Finding) => ({
        step: f.step,
        agent: f.agent,
        conclusion: f.analysis.conclusion,
        reasoning: f.analysis.reasoning,
        sentiment: f.analysis.sentiment,
        confidence: f.analysis.confidence,
        timestamp: f.timestamp,
      })),
      debateRounds: result.debateRounds,
    },
  });
}

async function resolveTarget(dto: any): Promise<AnalysisTarget> {
  const client = new DataClient({ baseUrl: dto.dataServiceUrl ?? "http://localhost:9500" });
  if (dto.sector) {
    const target: AnalysisTarget = { type: "sector", code: dto.sector };
    try { const info = await client.sector.constituents(dto.sector); target.name = info.name; } catch { /* */ }
    return target;
  }
  if (dto.index) return { type: "index", code: dto.index };
  if (dto.code) {
    const target: AnalysisTarget = { type: "stock", code: dto.code };
    try { const info = await client.reference.get(dto.code); target.name = info.name; } catch { /* */ }
    return target;
  }
  throw new Error("Must specify code, sector, or index");
}

function extractAgentIds(stepDef: any): string[] {
  if (!stepDef) return [];
  const ids: string[] = [];
  if (stepDef.agent) {
    const agents = Array.isArray(stepDef.agent) ? stepDef.agent : [stepDef.agent];
    for (const a of agents) if (a.id) ids.push(a.id);
  }
  if (stepDef.match?.id) ids.push(stepDef.match.id);
  if (stepDef.children) for (const child of stepDef.children) ids.push(...extractAgentIds(child));
  return [...new Set(ids)];
}
