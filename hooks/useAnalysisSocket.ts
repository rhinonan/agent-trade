"use client";

/**
 * 分析实时 Socket Hook — 管理 Socket.IO 连接，接收分析流程中的实时事件。
 *
 * 事件流状态机：
 *   空闲 → ANALYSIS_START → NODE_START → AGENT_THINKING → AGENT_TOOL_CALL/TOOL_RESULT
 *   → AGENT_WRITING → NODE_END → DEBATE_ROUND → DEBATE_YIELD → ANALYSIS_COMPLETE/ERROR
 *
 * 注意事项：
 * - AGENT_WRITING 可能先于 AGENT_THINKING 到达（竞态），需用 writingCache 处理
 * - 辩论节点通过 round、debateRounds 追踪辩论进度
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { WS_EVENTS } from "@/lib/socket/events.js";

/** 从 DB 回放的事件记录（payload 是 JSON 字符串） */
export interface PersistedEvent {
  id: number;
  sessionId: string;
  seq: number;
  eventType: string;
  payload: string; // JSON string — 需要 JSON.parse
  createdAt: number;
}

// ——— 数据类型 ———

interface Finding {
  step: string;
  agent: string;
  conclusion: string;
  reasoning?: string[];
  sentiment: string;
  confidence: number;
  timestamp: number;
}

interface StepState {
  stepId: string;
  type: string;
  agentIds: string[];
  status: "pending" | "running" | "complete";
}

/** LangGraph 节点级进度（替代旧版步骤级事件） */
export interface NodeState {
  nodeId: string;
  agentName: string;
  nodeType: string; // "standard" | "debate"
  status: "pending" | "running" | "complete" | "error";
}

/** 单个辩论轮次事件记录 */
export interface DebateRoundEvent {
  nodeId: string;
  round: number;
  participantLabel: string;
}

/** 辩论认输事件记录 */
export interface DebateYieldEvent {
  nodeId: string;
  fromAgent: string;
  toAgent: string;
  reason: string;
}

export interface ToolCallEvent {
  tool: string;
  args: Record<string, unknown>;
  ts: number;
}

export interface ToolResultEvent {
  tool: string;
  result: string;
  ts: number;
  isError?: boolean;
}

export type AgentStreamStatus =
  | "thinking"
  | "calling_tool"
  | "writing"
  | "done";

export interface AgentStream {
  nodeId: string;
  agentName: string;
  status: AgentStreamStatus;
  toolCalls: ToolCallEvent[];
  toolResults: Map<string, ToolResultEvent>;
  conclusion: string;
  reasoning: string;
  finding: Finding | null;
  startedAt: number;
  /** Timestamp of the most recent AGENT_WRITING event (for burst detection). */
  lastWritingTs?: number;
}

// ——— Hook ———

export function useAnalysisSocket(sessionId: string, initialEvents?: PersistedEvent[]) {
  const [connected, setConnected] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [nodes, setNodes] = useState<NodeState[]>([]);
  const [debateRounds, setDebateRounds] = useState<DebateRoundEvent[]>([]);
  const [yields, setYields] = useState<DebateYieldEvent[]>([]);
  const [agentStreams, setAgentStreams] = useState<
    Map<string, AgentStream>
  >(new Map());
  const [status, setStatus] = useState<"running" | "complete" | "error">(
    "running",
  );
  const socketRef = useRef<Socket | null>(null);

  const dispatchEvent = useCallback(
    (eventType: string, rawPayload: unknown) => {
      const payload = rawPayload as Record<string, any>;

      switch (eventType) {
        case WS_EVENTS.ANALYSIS_START: {
          const wfSteps =
            payload.workflow === "earnings-debate"
              ? ["research", "debate", "narrator"]
              : payload.workflow === "quick-scan"
                ? ["tech", "fundamental", "final"]
                : [];
          setSteps(
            wfSteps.map((id) => ({
              stepId: id, type: id, agentIds: [], status: "pending" as const,
            })),
          );
          setNodes(
            wfSteps.map((id) => ({
              nodeId: id, agentName: id, nodeType: "standard" as const, status: "pending" as const,
            })),
          );
          break;
        }

        case WS_EVENTS.ANALYSIS_COMPLETE: {
          setStatus("complete");
          if (payload.context?.findings) setFindings(payload.context.findings);
          break;
        }

        case WS_EVENTS.ANALYSIS_ERROR: {
          setStatus("error");
          break;
        }

        case WS_EVENTS.STEP_START: {
          setSteps((prev) =>
            prev.map((s) =>
              s.stepId === payload.stepId
                ? { ...s, status: "running" as const, agentIds: payload.agentIds }
                : s,
            ),
          );
          break;
        }

        case WS_EVENTS.STEP_COMPLETE: {
          setSteps((prev) =>
            prev.map((s) =>
              s.stepId === payload.stepId ? { ...s, status: "complete" as const } : s,
            ),
          );
          if (payload.findings) {
            setFindings((prev) => [
              ...prev,
              ...payload.findings.map((f: any) => ({
                step: payload.stepId, agent: f.agent, conclusion: f.conclusion,
                reasoning: f.reasoning, sentiment: f.sentiment,
                confidence: f.confidence, timestamp: Date.now(),
              })),
            ]);
          }
          break;
        }

        case WS_EVENTS.NODE_START: {
          setNodes((prev) => {
            const existing = prev.find((n) => n.nodeId === payload.nodeId);
            if (existing) {
              return prev.map((n) =>
                n.nodeId === payload.nodeId
                  ? { ...n, agentName: payload.agentName, nodeType: payload.nodeType, status: "running" as const }
                  : n,
              );
            }
            return [...prev, { nodeId: payload.nodeId, agentName: payload.agentName, nodeType: payload.nodeType, status: "running" as const }];
          });
          break;
        }

        case WS_EVENTS.NODE_END: {
          setNodes((prev) =>
            prev.map((n) =>
              n.nodeId === payload.nodeId ? { ...n, status: "complete" as const } : n,
            ),
          );
          setAgentStreams((prev) => {
            const next = new Map(prev);
            const existing = next.get(payload.nodeId);
            if (existing) {
              const finding = payload.findings?.[0];
              next.set(payload.nodeId, {
                ...existing, status: "done",
                finding: finding
                  ? { step: payload.nodeId, agent: finding.agent, conclusion: finding.conclusion,
                      reasoning: finding.reasoning ? [finding.reasoning] : undefined,
                      sentiment: finding.sentiment, confidence: finding.confidence, timestamp: Date.now() }
                  : null,
              });
            }
            return next;
          });
          if (payload.findings?.length) {
            setFindings((prev) => [
              ...prev,
              ...payload.findings.map((f: any) => ({
                step: payload.nodeId, agent: f.agent, conclusion: f.conclusion,
                reasoning: f.reasoning ? [f.reasoning] : undefined,
                sentiment: f.sentiment, confidence: f.confidence, timestamp: Date.now(),
              })),
            ]);
          }
          break;
        }

        case WS_EVENTS.NODE_ERROR: {
          setNodes((prev) =>
            prev.map((n) =>
              n.nodeId === payload.nodeId ? { ...n, status: "error" as const } : n,
            ),
          );
          break;
        }

        case WS_EVENTS.DEBATE_ROUND: {
          setDebateRounds((prev) => [...prev, payload as DebateRoundEvent]);
          break;
        }

        case WS_EVENTS.DEBATE_YIELD: {
          setYields((prev) => [...prev, payload as DebateYieldEvent]);
          break;
        }

        case WS_EVENTS.AGENT_THINKING: {
          setAgentStreams((prev) => {
            const next = new Map(prev);
            if (!next.has(payload.nodeId)) {
              next.set(payload.nodeId, {
                nodeId: payload.nodeId, agentName: payload.agentName, status: "thinking",
                toolCalls: [], toolResults: new Map(), conclusion: "", reasoning: "",
                finding: null, startedAt: Date.now(),
              });
            } else {
              const existing = next.get(payload.nodeId)!;
              next.set(payload.nodeId, { ...existing, agentName: payload.agentName, status: "thinking" });
            }
            return next;
          });
          break;
        }

        case WS_EVENTS.AGENT_TOOL_CALL: {
          setAgentStreams((prev) => {
            const next = new Map(prev);
            const existing = next.get(payload.nodeId);
            if (existing) {
              const key = `${payload.tool}-${payload.ts}`;
              // 防御性去重：同一事件可能因回放 + WebSocket 竞态或
              // StrictMode 双重挂载而被 dispatch 多次
              if (existing.toolCalls.some((tc) => `${tc.tool}-${tc.ts}` === key)) {
                return prev;
              }
              next.set(payload.nodeId, {
                ...existing, agentName: payload.agentName, status: "calling_tool",
                toolCalls: [...existing.toolCalls, { tool: payload.tool, args: payload.args, ts: payload.ts }],
              });
            }
            return next;
          });
          break;
        }

        case WS_EVENTS.AGENT_TOOL_RESULT: {
          setAgentStreams((prev) => {
            const next = new Map(prev);
            const existing = next.get(payload.nodeId);
            if (existing) {
              const newResults = new Map(existing.toolResults);
              const isError = payload.result?.startsWith?.("Error:") ?? false;
              newResults.set(`${payload.tool}-${payload.ts}`, {
                tool: payload.tool, result: payload.result, ts: payload.ts, isError,
              });
              next.set(payload.nodeId, { ...existing, toolResults: newResults });
            }
            return next;
          });
          break;
        }

        case WS_EVENTS.AGENT_WRITING: {
          setAgentStreams((prev) => {
            const next = new Map(prev);
            const existing = next.get(payload.nodeId);
            next.set(payload.nodeId, {
              nodeId: payload.nodeId,
              agentName: existing?.agentName ?? payload.agentName,
              status: "writing",
              toolCalls: existing?.toolCalls ?? [],
              toolResults: existing?.toolResults ?? new Map(),
              conclusion: payload.conclusion,
              reasoning: payload.reasoning,
              finding: existing?.finding ?? null,
              startedAt: existing?.startedAt ?? Date.now(),
              lastWritingTs: Date.now(),
            });
            return next;
          });
          break;
        }
      }
    },
    [], // 无依赖 — 所有 setState 是稳定的
  );

  const connect = useCallback(() => {
    // When running behind the SaaS proxy, the WebSocket server is on the
    // upstream port. Set NEXT_PUBLIC_WS_URL=http://localhost:3001 in .env
    const url = process.env.NEXT_PUBLIC_WS_URL || window.location.origin;
    const socket = io(`${url}/analysis`, {
      transports: ["websocket", "polling"],
      forceNew: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit(WS_EVENTS.SUBSCRIBE, { sessionId });
    });

    // —— Analysis lifecycle ——

    socket.on(WS_EVENTS.ANALYSIS_START, (payload: any) => dispatchEvent(WS_EVENTS.ANALYSIS_START, payload));
    socket.on(WS_EVENTS.ANALYSIS_COMPLETE, (payload: any) => dispatchEvent(WS_EVENTS.ANALYSIS_COMPLETE, payload));
    socket.on(WS_EVENTS.ANALYSIS_ERROR, (payload: any) => dispatchEvent(WS_EVENTS.ANALYSIS_ERROR, payload));

    // —— Legacy step-level events (backward compat) ——

    socket.on(WS_EVENTS.STEP_START, (payload: any) => dispatchEvent(WS_EVENTS.STEP_START, payload));
    socket.on(WS_EVENTS.STEP_COMPLETE, (payload: any) => dispatchEvent(WS_EVENTS.STEP_COMPLETE, payload));
    socket.on(WS_EVENTS.STEP_ERROR, () => {});

    // —— LangGraph node-level events ——

    socket.on(WS_EVENTS.NODE_START, (payload: any) => dispatchEvent(WS_EVENTS.NODE_START, payload));
    socket.on(WS_EVENTS.NODE_END, (payload: any) => dispatchEvent(WS_EVENTS.NODE_END, payload));
    socket.on(WS_EVENTS.NODE_ERROR, (payload: any) => dispatchEvent(WS_EVENTS.NODE_ERROR, payload));
    socket.on(WS_EVENTS.DEBATE_ROUND, (payload: any) => dispatchEvent(WS_EVENTS.DEBATE_ROUND, payload));
    socket.on(WS_EVENTS.DEBATE_YIELD, (payload: any) => dispatchEvent(WS_EVENTS.DEBATE_YIELD, payload));

    // —— Agent-level granular events ——

    socket.on(WS_EVENTS.AGENT_THINKING, (payload: any) => dispatchEvent(WS_EVENTS.AGENT_THINKING, payload));
    socket.on(WS_EVENTS.AGENT_TOOL_CALL, (payload: any) => dispatchEvent(WS_EVENTS.AGENT_TOOL_CALL, payload));
    socket.on(WS_EVENTS.AGENT_TOOL_RESULT, (payload: any) => dispatchEvent(WS_EVENTS.AGENT_TOOL_RESULT, payload));
    socket.on(WS_EVENTS.AGENT_WRITING, (payload: any) => dispatchEvent(WS_EVENTS.AGENT_WRITING, payload));

    // —— Connection lifecycle ——

    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
  }, [sessionId]);

  useEffect(() => {
    // Phase 1: 回放 DB 中的历史事件（如有）
    if (initialEvents && initialEvents.length > 0) {
      for (const event of initialEvents) {
        try {
          const payload = JSON.parse(event.payload);
          dispatchEvent(event.eventType, payload);
        } catch (e) {
          console.warn(`[replay] Failed to parse event seq=${event.seq} type=${event.eventType}:`, e);
        }
      }
    }

    // Phase 2: 连接 WebSocket 接收后续增量事件
    connect();

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [connect, dispatchEvent, initialEvents]);

  return { connected, findings, steps, nodes, debateRounds, yields, status, agentStreams };
}
