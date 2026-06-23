import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { setDefaultLLMProvider } from "@/lib/engine/index.js";
import { DataClient } from "@/lib/data/client.js";
import { getSocketIO } from "@/lib/socket/server.js";
import { WS_EVENTS } from "@/lib/socket/events.js";
import type { AnalysisTarget } from "@/lib/engine/types.js";
import { getDb } from "@/lib/db/client.js";
import { AnalysisRepo } from "@/lib/db/analysis-repo.js";
import { getQuotaHook, type QuotaHook } from "@/lib/auth/types.js";
import { runWorkflow, loadWorkflowYaml, ensureAgentsLoaded } from "@/lib/langgraph/runner.js";

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
  const userId = req.headers.get("x-user-id") ?? "anonymous";

  // 配额预扣（私有仓库注入的 QuotaHook）
  if (userId !== "anonymous") {
    const quotaHook = getQuotaHook();
    if (quotaHook) {
      const ok = await quotaHook.tryConsume(userId);
      if (!ok) {
        return NextResponse.json(
          { error: "本月分析次数已用完，请升级订阅" },
          { status: 429 }
        );
      }
    }
  }

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
    userId,
  });

  // Run analysis asynchronously
  const quotaHook = getQuotaHook();
  runAnalysis(
    sessionId,
    { code, sector, index, workflow, provider, model, dataServiceUrl, userId },
    userId !== "anonymous" ? quotaHook : null
  ).catch(async (err) => {
    console.error(`Analysis ${sessionId} failed:`, err);
    repo.update(sessionId, { status: "error", context: JSON.stringify({ error: err.message }) });
    const io = getSocketIO();
    io.of("/analysis").to(sessionId).emit(WS_EVENTS.ANALYSIS_ERROR, { message: err.message });
  });

  return NextResponse.json({ sessionId });
}

async function runAnalysis(
  sessionId: string,
  dto: { code?: string; sector?: string; index?: string; workflow?: string; provider?: string; model?: string; dataServiceUrl?: string; userId: string },
  quotaHook: QuotaHook | null,
): Promise<void> {
  const db = getDb();
  const repo = new AnalysisRepo(db);
  const io = getSocketIO();
  const ns = io.of("/analysis");

  try {
    if (dto.provider) {
      setDefaultLLMProvider(dto.provider as "anthropic" | "openai" | "deepseek");
    }

    const target = await resolveTarget(dto);

    ns.to(sessionId).emit(WS_EVENTS.ANALYSIS_START, {
      target: { type: target.type, code: target.code, name: target.name },
      workflow: dto.workflow ?? "bull-bear",
    });

    // ── LangGraph engine: YAML workflow → LangGraph runner ──
    const workflowYaml = await loadWorkflowYaml(dto.workflow ?? "bull-bear");
    const langGraphResult = await runWorkflow(
      workflowYaml,
      target.code,
      { provider: dto.provider as any, modelName: dto.model },
      {
        onNodeStart: async (nodeId) => {
          ns.to(sessionId).emit(WS_EVENTS.STEP_START, {
            stepId: nodeId,
            type: "standard",
            agentIds: [nodeId],
          });
        },
        onNodeEnd: async (nodeId, _data) => {
          ns.to(sessionId).emit(WS_EVENTS.STEP_COMPLETE, {
            stepId: nodeId,
            findings: [],
          });
        },
      },
    );

    // Persist results
    repo.update(sessionId, {
      status: "complete",
      context: JSON.stringify({
        target,
        workflowName: dto.workflow ?? "bull-bear",
        findings: langGraphResult.findings,
        debateRounds: [],
      }),
    });

    ns.to(sessionId).emit(WS_EVENTS.ANALYSIS_COMPLETE, {
      context: {
        target,
        workflowName: dto.workflow ?? "bull-bear",
        findings: Object.entries(langGraphResult.findings).map(([nodeId, value]) => {
          const v = value as Record<string, unknown> | undefined;
          return {
            step: nodeId,
            agent: nodeId,
            conclusion: (v?.conclusion as string) ?? JSON.stringify(value).slice(0, 200),
            reasoning: (v?.reasoning as string) ?? "",
            sentiment: (v?.sentiment as string) ?? "neutral",
            confidence: (v?.confidence as number) ?? 0,
            timestamp: Date.now(),
          };
        }),
        debateRounds: [],
      },
    });
  } catch (err) {
    // 失败 — 退还配额（涵盖 resolveTarget / workflow 校验 / scheduler 等所有早期失败）
    console.error(`Analysis ${sessionId} failed:`, err);
    if (quotaHook) {
      quotaHook.release(dto.userId).catch(e =>
        console.error(`Quota release failed for ${dto.userId}:`, e)
      );
    }
    repo.update(sessionId, { status: "error", context: JSON.stringify({ error: (err as Error).message }) });
    ns.to(sessionId).emit(WS_EVENTS.ANALYSIS_ERROR, { message: (err as Error).message });
  }
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
