import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { setDefaultLLMProvider } from "@/lib/engine/index.js";
import { AStockClient } from "@/lib/data-sdk/index.js";
import { getSocketIO } from "@/lib/socket/server.js";
import { WS_EVENTS } from "@/lib/socket/events.js";
import type { AnalysisTarget } from "@/lib/engine/types.js";
import { getDb } from "@/lib/db/client.js";
import { AnalysisRepo } from "@/lib/db/analysis-repo.js";
import { getQuotaHook, type QuotaHook } from "@/lib/auth/types.js";
import { runWorkflow, loadWorkflowYaml, ensureAgentsLoaded } from "@/lib/langgraph/runner.js";
import { createLogger } from "@/lib/logger.js";

const log = createLogger("api:analyze");

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { code, sector, index, workflow = "earnings-debate", provider = "deepseek", model } = body;

  if (!code && !sector && !index) {
    return NextResponse.json({ error: "Must specify code, sector, or index" }, { status: 400 });
  }

  const VALID_PROVIDERS = new Set(["deepseek", "openai", "anthropic"]);
  if (provider && !VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: `Invalid provider: ${provider}. Must be one of: deepseek, openai, anthropic` }, { status: 400 });
  }

  const sessionId = randomUUID();
  const userId = req.headers.get("x-user-id") ?? "anonymous";

  log.info("Analysis requested", { sessionId, workflow, code, provider, userId });

  // 配额预扣（私有仓库注入的 QuotaHook）
  if (userId !== "anonymous") {
    const quotaHook = getQuotaHook();
    if (quotaHook) {
      const ok = await quotaHook.tryConsume(userId);
      if (!ok) {
        log.warn("Quota exhausted", { userId });
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
    { code, sector, index, workflow, provider, model, userId },
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
  dto: { code?: string; sector?: string; index?: string; workflow?: string; provider?: string; model?: string; userId: string },
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
    log.info("Target resolved", { sessionId, target: target.code, name: target.name });

    ns.to(sessionId).emit(WS_EVENTS.ANALYSIS_START, {
      target: { type: target.type, code: target.code, name: target.name },
      workflow: dto.workflow ?? "earnings-debate",
    });

    // ── Load user-uploaded roles from DB ────────────────────────────
    if (dto.userId !== "anonymous") {
      const { getRoleLoader } = await import("@/lib/role-loader/loader.js");
      await getRoleLoader().loadFromDB(dto.userId);
    }

    // ── LangGraph engine: YAML workflow → LangGraph runner ──
    const workflowYaml = await loadWorkflowYaml(dto.workflow ?? "earnings-debate");

    // Build lookup: nodeId → node config (agent name, type)
    const nodeMap = new Map<string, (typeof workflowYaml.nodes)[number]>();
    for (const node of workflowYaml.nodes) {
      nodeMap.set(node.id, node);
    }

    log.info("Starting workflow execution", { sessionId, workflow: dto.workflow });
    const langGraphResult = await runWorkflow(
      workflowYaml,
      target.code,
      { provider: dto.provider as any, modelName: dto.model },
      {
        onNodeStart: async (nodeId) => {
          const nodeCfg = nodeMap.get(nodeId);
          const agentName =
            nodeCfg?.type === "debate"
              ? nodeCfg.participants?.map((p) => p.agent).join(" vs ") ?? nodeId
              : (nodeCfg as any)?.agent ?? nodeId;
          const nodeType = nodeCfg?.type ?? "standard";

          ns.to(sessionId).emit(WS_EVENTS.NODE_START, {
            nodeId,
            agentName,
            nodeType,
          });

          // Also emit legacy step:start for backward compat
          ns.to(sessionId).emit(WS_EVENTS.STEP_START, {
            stepId: nodeId,
            type: nodeType,
            agentIds: [agentName],
          });

          // Emit agent:thinking for frontend typewriter/bubble UI
          ns.to(sessionId).emit(WS_EVENTS.AGENT_THINKING, {
            nodeId,
            agentName,
          });
        },
        onNodeEnd: async (nodeId, result) => {
          const nodeCfg = nodeMap.get(nodeId);
          const agentName =
            nodeCfg?.type === "debate"
              ? nodeCfg.participants?.map((p) => p.agent).join(" vs ") ?? nodeId
              : (nodeCfg as any)?.agent ?? nodeId;

          // Extract findings from the LangGraph state update
          const update = result as Record<string, unknown>;
          const findings = extractFindings(nodeId, nodeCfg, update);

          ns.to(sessionId).emit(WS_EVENTS.NODE_END, {
            nodeId,
            agentName,
            findings,
          });

          // Emit legacy step:complete for backward compat
          ns.to(sessionId).emit(WS_EVENTS.STEP_COMPLETE, {
            stepId: nodeId,
            findings,
          });

          // For debate nodes: emit DEBATE_ROUND events for each completed round
          if (nodeCfg?.type === "debate" && update.round !== undefined) {
            const totalRounds = update.round as number;
            const msgs = (update.messages as { role: string; content: string }[]) ?? [];
            for (let r = 0; r <= totalRounds; r++) {
              ns.to(sessionId).emit(WS_EVENTS.DEBATE_ROUND, {
                nodeId,
                round: r,
                participantLabel: msgs
                  .filter((m, i) => i % 2 === r % 2) // rough: alternating messages map to rounds
                  .slice(-1)
                  .map((m) => m.role)[0] ?? `round-${r}`,
              });
            }
            // Emit DEBATE_YIELD if debate ended by yield
            if (update.stop_reason === "yield") {
              const lastMsg = msgs[msgs.length - 1];
              ns.to(sessionId).emit(WS_EVENTS.DEBATE_YIELD, {
                nodeId,
                fromAgent: lastMsg?.role ?? "unknown",
                toAgent: msgs.length >= 2 ? msgs[msgs.length - 2].role : "unknown",
                reason: "yield",
              });
            }
          }
        },
        onAgentThinking: async (nodeId, agentName) => {
          ns.to(sessionId).emit(WS_EVENTS.AGENT_THINKING, {
            nodeId,
            agentName,
          });
        },
        onToolCall: async (nodeId, agentName, tool, args) => {
          ns.to(sessionId).emit(WS_EVENTS.AGENT_TOOL_CALL, {
            nodeId,
            agentName,
            tool,
            args,
            ts: Date.now(),
          });
        },
        onToolResult: async (nodeId, agentName, tool, result) => {
          ns.to(sessionId).emit(WS_EVENTS.AGENT_TOOL_RESULT, {
            nodeId,
            agentName,
            tool,
            result,
            ts: Date.now(),
          });
        },
        onAgentWriting: async (nodeId, agentName, conclusion, reasoning) => {
          ns.to(sessionId).emit(WS_EVENTS.AGENT_WRITING, {
            nodeId,
            agentName,
            conclusion,
            reasoning,
          });
        },
      },
    );

    // Convert findings Record → array for both DB persistence and WebSocket
    const findingsArray = Object.entries(langGraphResult.findings).map(([nodeId, value]) => {
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
    });

    // Persist results
    repo.update(sessionId, {
      status: "complete",
      context: JSON.stringify({
        target,
        workflowName: dto.workflow ?? "earnings-debate",
        findings: findingsArray,
        debateRounds: [],
      }),
    });

    ns.to(sessionId).emit(WS_EVENTS.ANALYSIS_COMPLETE, {
      context: {
        target,
        workflowName: dto.workflow ?? "earnings-debate",
        findings: findingsArray,
        debateRounds: [],
      },
    });

    log.info("Analysis complete", { sessionId, findingsCount: Object.keys(langGraphResult.findings).length });
  } catch (err) {
    // 失败 — 退还配额（涵盖 resolveTarget / workflow 校验 / scheduler 等所有早期失败）
    log.error(`Analysis ${sessionId} failed`, { error: (err as Error).message });
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

/** Extract frontend-ready findings from a LangGraph state update. */
function extractFindings(
  nodeId: string,
  nodeCfg: { id: string; agent?: string; participants?: { agent: string; role: string }[]; type?: string } | undefined,
  update: Record<string, unknown>,
): { agent: string; conclusion: string; sentiment: string; confidence: number; reasoning?: string }[] {
  const rawFindings = (update.findings as Record<string, unknown>) ?? {};

  if (nodeCfg?.type === "debate") {
    // Debate node: findings keyed as round_N_role
    return Object.entries(rawFindings)
      .filter(([key]) => key.startsWith("round_"))
      .map(([key, value]) => {
        const v = value as Record<string, unknown> | undefined;
        return {
          agent: key,
          conclusion: (v?.conclusion as string)
            ?? (v?.argument as string)
            ?? JSON.stringify(value).slice(0, 200),
          sentiment: (v?.sentiment as string) ?? "neutral",
          confidence: (v?.confidence as number) ?? 0,
          reasoning: (v?.reasoning as string) ?? undefined,
        };
      });
  }

  // Standard node: findings keyed by agent id
  const agentId = nodeCfg?.agent ?? nodeId;
  const value = rawFindings[agentId] as Record<string, unknown> | undefined;
  if (!value) {
    // Fallback: find the first non-empty finding
    for (const [k, v] of Object.entries(rawFindings)) {
      if (v && typeof v === "object") {
        const vv = v as Record<string, unknown>;
        return [{
          agent: k,
          conclusion: (vv.conclusion as string) ?? JSON.stringify(v).slice(0, 200),
          sentiment: (vv.sentiment as string) ?? "neutral",
          confidence: (vv.confidence as number) ?? 0,
          reasoning: (vv.reasoning as string) ?? undefined,
        }];
      }
    }
    return [];
  }

  return [{
    agent: agentId,
    conclusion: (value.conclusion as string) ?? JSON.stringify(value).slice(0, 200),
    sentiment: (value.sentiment as string) ?? "neutral",
    confidence: (value.confidence as number) ?? 0,
    reasoning: (value.reasoning as string) ?? undefined,
  }];
}

async function resolveTarget(dto: any): Promise<AnalysisTarget> {
  const client = new AStockClient();
  if (dto.sector) {
    const target: AnalysisTarget = { type: "sector", code: dto.sector };
    try {
      const ranking = await client.signal.sectorRanking();
      const info = ranking.data?.find(s => s.code === dto.sector);
      if (info) target.name = info.name;
    } catch { /* best-effort name lookup */ }
    return target;
  }
  if (dto.index) return { type: "index", code: dto.index };
  if (dto.code) {
    const target: AnalysisTarget = { type: "stock", code: dto.code };
    try { const r = await client.fundamentals.stockInfo(dto.code); if (r.data) target.name = r.data.name; } catch { /* */ }
    return target;
  }
  throw new Error("Must specify code, sector, or index");
}
