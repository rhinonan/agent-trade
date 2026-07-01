import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { setDefaultLLMProvider } from "@/lib/engine/index.js";
import { AStockClient } from "@/lib/data-sdk/index.js";
import { getSocketIO } from "@/lib/socket/server.js";
import { WS_EVENTS } from "@/lib/socket/events.js";
import type { AnalysisTarget } from "@/lib/engine/types.js";
import { getDb } from "@/lib/db/client.js";
import { AnalysisRepo } from "@/lib/db/analysis-repo.js";
import { SessionRepo } from "@/lib/db/session-repo.js";
import { EventRepo } from "@/lib/db/event-repo.js";
import { getQuotaHook, type QuotaHook } from "@/lib/auth/types.js";
import { runWorkflow, loadWorkflowYaml, ensureAgentsLoaded } from "@/lib/langgraph/runner.js";
import { createLogger } from "@/lib/logger.js";

/**
 * 主分析端点 — POST /api/analyze
 *
 * 完整的分析流水线：
 * 1. 验证请求参数（股票代码/行业/指数 + workflow + provider）
 * 2. 配额检查（私有部署的付费用户配额控制）
 * 3. 创建分析会话（DB 持久化）
 * 4. 异步执行分析（LangGraph + WebSocket 实时推送）
 * 5. 失败时退还配额
 *
 * WebSocket 事件流：
 *   ANALYSIS_START → NODE_START/END → AGENT_THINKING → AGENT_TOOL_CALL/TOOL_RESULT → AGENT_WRITING
 *   → DEBATE_ROUND → DEBATE_YIELD → ANALYSIS_COMPLETE / ANALYSIS_ERROR
 */

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

  // 配额预扣 — 匿名用户跳过（私有部署可注入 QuotaHook 实现付费限制）
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

  // 保存分析会话到 DB（状态：running）
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

  // 同步写入 sessions 表 — 历史页（RecentAnalyses、/history）通过
  // /api/sessions 读取此表。两张表共存属于历史遗留，后续可统一为 analyses。
  new SessionRepo(db).insert({
    id: sessionId,
    targetCode: code ?? sector ?? index,
    targetName: null,
    targetType: sector ? "sector" : index ? "index" : "stock",
    workflowName: workflow,
    status: "RUNNING",
    createdAt: Date.now(),
    userId,
  });

  // 异步执行分析（fire-and-forget），失败在 catch 中处理
  const quotaHook = getQuotaHook();
  runAnalysis(
    sessionId,
    { code, sector, index, workflow, provider, model, userId },
    userId !== "anonymous" ? quotaHook : null
  ).catch(async (err) => {
    console.error(`Analysis ${sessionId} failed:`, err);
    repo.update(sessionId, { status: "error", context: JSON.stringify({ error: err.message }) });
    new SessionRepo(db).updateStatus(sessionId, "STOPPED");
    const io = getSocketIO();
    io.of("/analysis").to(sessionId).emit(WS_EVENTS.ANALYSIS_ERROR, { message: err.message });
    // Persist error event
    try {
      const eventRepo = new EventRepo(db);
      eventRepo.insert(sessionId, 0, WS_EVENTS.ANALYSIS_ERROR, { message: err.message });
    } catch (e) { console.error("Failed to persist error event:", e); }
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
  const eventRepo = new EventRepo(db);
  let seq = 0;

  // 单调递增时间戳 — Date.now() 在同毫秒内可能重复，
  // 前端以 `${tool}-${ts}` 为 ToolCallCard 的 React key，
  // 重复 key 会触发 "Encountered two children with the same key" 错误
  let _lastTs = 0;
  function uniqueTs(): number {
    const now = Date.now();
    _lastTs = now > _lastTs ? now : _lastTs + 1;
    return _lastTs;
  }

  function emitAndPersist(eventType: string, payload: Record<string, unknown>) {
    ns.to(sessionId).emit(eventType, payload);
    try {
      eventRepo.insert(sessionId, seq++, eventType, payload);
    } catch (e) {
      console.error(`[event-repo] Failed to persist event ${eventType} seq=${seq - 1}:`, e);
    }
  }

  try {
    if (dto.provider) {
      setDefaultLLMProvider(dto.provider as "anthropic" | "openai" | "deepseek");
    }

    const target = await resolveTarget(dto);
    log.info("Target resolved", { sessionId, target: target.code, name: target.name });

    emitAndPersist(WS_EVENTS.ANALYSIS_START, {
      target: { type: target.type, code: target.code, name: target.name },
      workflow: dto.workflow ?? "earnings-debate",
    });

    // ── 从 DB 加载用户上传的自定义角色 ──
    if (dto.userId !== "anonymous") {
      const { getRoleLoader } = await import("@/lib/role-loader/loader.js");
      await getRoleLoader().loadFromDB(dto.userId);
    }

    // ── LangGraph 引擎：YAML workflow → LangGraph runner ──
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

          emitAndPersist(WS_EVENTS.NODE_START, {
            nodeId,
            agentName,
            nodeType,
          });

          // 同时发送旧版 step:start 事件（向后兼容）
          emitAndPersist(WS_EVENTS.STEP_START, {
            stepId: nodeId,
            type: nodeType,
            agentIds: [agentName],
          });

          // 发出 agent:thinking 事件供前端状态机使用
          emitAndPersist(WS_EVENTS.AGENT_THINKING, {
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

          // 从 LangGraph 状态更新中提取 findings
          const update = result as Record<string, unknown>;
          const findings = extractFindings(nodeId, nodeCfg, update);

          emitAndPersist(WS_EVENTS.NODE_END, {
            nodeId,
            agentName,
            findings,
          });

          // 发送旧版 step:complete 事件（向后兼容）
          emitAndPersist(WS_EVENTS.STEP_COMPLETE, {
            stepId: nodeId,
            findings,
          });

          // 辩论节点：为每个已完成的轮次发出 DEBATE_ROUND 事件
          if (nodeCfg?.type === "debate" && update.round !== undefined) {
            const totalRounds = update.round as number;
            const msgs = (update.messages as { role: string; content: string }[]) ?? [];
            for (let r = 0; r <= totalRounds; r++) {
              emitAndPersist(WS_EVENTS.DEBATE_ROUND, {
                nodeId,
                round: r,
                participantLabel: msgs
                  .filter((m, i) => i % 2 === r % 2) // rough: alternating messages map to rounds
                  .slice(-1)
                  .map((m) => m.role)[0] ?? `round-${r}`,
              });
            }
            // 辩论因认输而终止时发出 DEBATE_YIELD 事件
            if (update.stop_reason === "yield") {
              const lastMsg = msgs[msgs.length - 1];
              emitAndPersist(WS_EVENTS.DEBATE_YIELD, {
                nodeId,
                fromAgent: lastMsg?.role ?? "unknown",
                toAgent: msgs.length >= 2 ? msgs[msgs.length - 2].role : "unknown",
                reason: "yield",
              });
            }
          }
        },
        onAgentThinking: async (nodeId, agentName) => {
          emitAndPersist(WS_EVENTS.AGENT_THINKING, {
            nodeId,
            agentName,
          });
        },
        onToolCall: async (nodeId, agentName, tool, args) => {
          emitAndPersist(WS_EVENTS.AGENT_TOOL_CALL, {
            nodeId,
            agentName,
            tool,
            args,
            ts: uniqueTs(),
          });
        },
        onToolResult: async (nodeId, agentName, tool, result) => {
          emitAndPersist(WS_EVENTS.AGENT_TOOL_RESULT, {
            nodeId,
            agentName,
            tool,
            result,
            ts: uniqueTs(),
          });
        },
        onAgentWriting: async (nodeId, agentName, conclusion, reasoning) => {
          emitAndPersist(WS_EVENTS.AGENT_WRITING, {
            nodeId,
            agentName,
            conclusion,
            reasoning,
          });
        },
      },
    );

    // 将 findings Record → 数组，供 DB 持久化和 WebSocket 推送
    const findingsArray = Object.entries(langGraphResult.findings).map(([nodeId, value]) => {
      const v = value as Record<string, unknown> | undefined;
      return {
        step: nodeId,
        agent: nodeId,
        conclusion: safeString(v?.conclusion, value),
        reasoning: safeString(v?.reasoning),
        sentiment: (v?.sentiment as string) ?? "neutral",
        confidence: (v?.confidence as number) ?? 0,
        timestamp: Date.now(),
      };
    });

    // 持久化分析结果到 DB
    repo.update(sessionId, {
      status: "complete",
      context: JSON.stringify({
        target,
        workflowName: dto.workflow ?? "earnings-debate",
        findings: findingsArray,
        debateRounds: [],
      }),
    });

    // 同步 sessions 表 — 历史页轮询此表
    new SessionRepo(db).updateStatus(sessionId, "STOPPED");

    emitAndPersist(WS_EVENTS.ANALYSIS_COMPLETE, {
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
    new SessionRepo(db).updateStatus(sessionId, "STOPPED");
    emitAndPersist(WS_EVENTS.ANALYSIS_ERROR, { message: (err as Error).message });
  }
}

/**
 * 安全地将值转为字符串（不硬截断）。
 * - 已是字符串 → 直接返回
 * - 非空值 → JSON 序列化（无长度限制）
 * - 其他情况 → 返回空字符串
 */
function safeString(val: unknown, fallbackObj?: unknown): string {
  if (typeof val === "string") return val;
  if (val != null) return JSON.stringify(val);
  if (fallbackObj != null && typeof fallbackObj === "string") return fallbackObj;
  if (fallbackObj != null) return JSON.stringify(fallbackObj);
  return "";
}

/** 从 LangGraph 状态更新中提取前端可用的 findings。支持辩论节点（round_N_role 键）和标准节点（agent ID 键）。 */
function extractFindings(
  nodeId: string,
  nodeCfg: { id: string; agent?: string; participants?: { agent: string; role: string }[]; type?: string } | undefined,
  update: Record<string, unknown>,
): { agent: string; conclusion: string; sentiment: string; confidence: number; reasoning?: string }[] {
  const rawFindings = (update.findings as Record<string, unknown>) ?? {};

  if (nodeCfg?.type === "debate") {
    // 辩论节点：findings 键为 round_N_role 格式
    return Object.entries(rawFindings)
      .filter(([key]) => key.startsWith("round_"))
      .map(([key, value]) => {
        const v = value as Record<string, unknown> | undefined;
        return {
          agent: key,
          conclusion: (v?.conclusion as string)
            ?? (v?.argument as string)
            ?? safeString(value),
          sentiment: (v?.sentiment as string) ?? "neutral",
          confidence: (v?.confidence as number) ?? 0,
          reasoning: safeString(v?.reasoning) || undefined,
        };
      });
  }

  // 标准节点：findings 键为 agent ID
  const agentId = nodeCfg?.agent ?? nodeId;
  const value = rawFindings[agentId] as Record<string, unknown> | undefined;
  if (!value) {
    // 降级：查找第一个非空 finding
    for (const [k, v] of Object.entries(rawFindings)) {
      if (v && typeof v === "object") {
        const vv = v as Record<string, unknown>;
        return [{
          agent: k,
          conclusion: (vv.conclusion as string) ?? safeString(v),
          sentiment: (vv.sentiment as string) ?? "neutral",
          confidence: (vv.confidence as number) ?? 0,
          reasoning: safeString(vv.reasoning) || undefined,
        }];
      }
    }
    return [];
  }

  return [{
    agent: agentId,
    conclusion: (value.conclusion as string) ?? safeString(value),
    sentiment: (value.sentiment as string) ?? "neutral",
    confidence: (value.confidence as number) ?? 0,
    reasoning: safeString(value.reasoning) || undefined,
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
