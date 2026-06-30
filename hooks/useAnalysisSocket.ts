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

export function useAnalysisSocket(sessionId: string) {
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

    socket.on(WS_EVENTS.ANALYSIS_START, (payload: any) => {
      const wfSteps =
        payload.workflow === "earnings-debate"
          ? ["research", "debate", "narrator"]
          : payload.workflow === "quick-scan"
            ? ["tech", "fundamental", "final"]
            : [];
      setSteps(
        wfSteps.map((id) => ({
          stepId: id,
          type: id,
          agentIds: [],
          status: "pending" as const,
        })),
      );
      // Initialize node list from workflow steps
      setNodes(
        wfSteps.map((id) => ({
          nodeId: id,
          agentName: id,
          nodeType: "standard" as const,
          status: "pending" as const,
        })),
      );
    });

    socket.on(WS_EVENTS.ANALYSIS_COMPLETE, (payload: any) => {
      setStatus("complete");
      if (payload.context?.findings) {
        setFindings(payload.context.findings);
      }
    });

    socket.on(WS_EVENTS.ANALYSIS_ERROR, (_payload: any) => setStatus("error"));

    // —— Legacy step-level events (backward compat) ——

    socket.on(WS_EVENTS.STEP_START, (payload: any) => {
      setSteps((prev) =>
        prev.map((s) =>
          s.stepId === payload.stepId
            ? {
                ...s,
                status: "running" as const,
                agentIds: payload.agentIds,
              }
            : s,
        ),
      );
    });

    socket.on(WS_EVENTS.STEP_COMPLETE, (payload: any) => {
      setSteps((prev) =>
        prev.map((s) =>
          s.stepId === payload.stepId
            ? { ...s, status: "complete" as const }
            : s,
        ),
      );
      if (payload.findings) {
        setFindings((prev) => [
          ...prev,
          ...payload.findings.map((f: any) => ({
            step: payload.stepId,
            agent: f.agent,
            conclusion: f.conclusion,
            reasoning: f.reasoning,
            sentiment: f.sentiment,
            confidence: f.confidence,
            timestamp: Date.now(),
          })),
        ]);
      }
    });

    socket.on(WS_EVENTS.STEP_ERROR, () => {});

    // —— LangGraph node-level events ——

    socket.on(WS_EVENTS.NODE_START, (payload: {
      nodeId: string;
      agentName: string;
      nodeType: string;
    }) => {
      // Add or update node in the node list
      setNodes((prev) => {
        const existing = prev.find((n) => n.nodeId === payload.nodeId);
        if (existing) {
          return prev.map((n) =>
            n.nodeId === payload.nodeId
              ? {
                  ...n,
                  agentName: payload.agentName,
                  nodeType: payload.nodeType,
                  status: "running" as const,
                }
              : n,
          );
        }
        return [
          ...prev,
          {
            nodeId: payload.nodeId,
            agentName: payload.agentName,
            nodeType: payload.nodeType,
            status: "running" as const,
          },
        ];
      });
    });

    socket.on(WS_EVENTS.NODE_END, (payload: {
      nodeId: string;
      agentName: string;
      findings: {
        agent: string;
        conclusion: string;
        sentiment: string;
        confidence: number;
        reasoning?: string;
      }[];
    }) => {
      // Mark node as complete
      setNodes((prev) =>
        prev.map((n) =>
          n.nodeId === payload.nodeId
            ? { ...n, status: "complete" as const }
            : n,
        ),
      );
      // Mark the agent stream as done and attach finding
      setAgentStreams((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.nodeId);
        if (existing) {
          const finding = payload.findings?.[0];
          next.set(payload.nodeId, {
            ...existing,
            status: "done",
            finding: finding ? {
              step: payload.nodeId,
              agent: finding.agent,
              conclusion: finding.conclusion,
              reasoning: finding.reasoning ? [finding.reasoning] : undefined,
              sentiment: finding.sentiment,
              confidence: finding.confidence,
              timestamp: Date.now(),
            } : null,
          });
        }
        return next;
      });
      // Merge findings
      if (payload.findings && payload.findings.length > 0) {
        setFindings((prev) => [
          ...prev,
          ...payload.findings.map((f) => ({
            step: payload.nodeId,
            agent: f.agent,
            conclusion: f.conclusion,
            reasoning: f.reasoning ? [f.reasoning] : undefined,
            sentiment: f.sentiment,
            confidence: f.confidence,
            timestamp: Date.now(),
          })),
        ]);
      }
    });

    socket.on(WS_EVENTS.NODE_ERROR, (payload: {
      nodeId: string;
      error: string;
    }) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.nodeId === payload.nodeId
            ? { ...n, status: "error" as const }
            : n,
        ),
      );
    });

    socket.on(WS_EVENTS.DEBATE_ROUND, (payload: {
      nodeId: string;
      round: number;
      participantLabel: string;
    }) => {
      setDebateRounds((prev) => [...prev, payload]);
    });

    socket.on(WS_EVENTS.DEBATE_YIELD, (payload: {
      nodeId: string;
      fromAgent: string;
      toAgent: string;
      reason: string;
    }) => {
      setYields((prev) => [...prev, payload]);
    });

    // —— Agent-level granular events ——

    socket.on(WS_EVENTS.AGENT_THINKING, (payload: {
      nodeId: string;
      agentName: string;
    }) => {
      setAgentStreams((prev) => {
        const next = new Map(prev);
        if (!next.has(payload.nodeId)) {
          next.set(payload.nodeId, {
            nodeId: payload.nodeId,
            agentName: payload.agentName,
            status: "thinking",
            toolCalls: [],
            toolResults: new Map(),
            conclusion: "",
            reasoning: "",
            finding: null,
            startedAt: Date.now(),
          });
        } else {
          const existing = next.get(payload.nodeId)!;
          next.set(payload.nodeId, {
            ...existing,
            agentName: payload.agentName,
            status: "thinking",
          });
        }
        return next;
      });
    });

    socket.on(WS_EVENTS.AGENT_TOOL_CALL, (payload: {
      nodeId: string;
      agentName: string;
      tool: string;
      args: Record<string, unknown>;
      ts: number;
    }) => {
      setAgentStreams((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.nodeId);
        if (existing) {
          next.set(payload.nodeId, {
            ...existing,
            agentName: payload.agentName,
            status: "calling_tool",
            toolCalls: [
              ...existing.toolCalls,
              { tool: payload.tool, args: payload.args, ts: payload.ts },
            ],
          });
        }
        return next;
      });
    });

    socket.on(WS_EVENTS.AGENT_TOOL_RESULT, (payload: {
      nodeId: string;
      agentName: string;
      tool: string;
      result: string;
      ts: number;
    }) => {
      setAgentStreams((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.nodeId);
        if (existing) {
          const newResults = new Map(existing.toolResults);
          const isError = payload.result?.startsWith("Error:") ?? false;
          newResults.set(`${payload.tool}-${payload.ts}`, {
            tool: payload.tool,
            result: payload.result,
            ts: payload.ts,
            isError,
          });
          next.set(payload.nodeId, {
            ...existing,
            toolResults: newResults,
          });
        }
        return next;
      });
    });

    socket.on(WS_EVENTS.AGENT_WRITING, (payload: {
      nodeId: string;
      agentName: string;
      conclusion: string;
      reasoning: string;
    }) => {
      setAgentStreams((prev) => {
        const next = new Map(prev);
        const existing = next.get(payload.nodeId);
        // Create-or-update: AGENT_WRITING may arrive before AGENT_THINKING
        // because runner.ts emits onNodeStart only after the stream yields
        // (post node-completion), while onAgentWriting fires inside the node.
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
    });

    // —— Connection lifecycle ——

    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
  }, [sessionId]);

  useEffect(() => {
    connect();
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [connect]);

  return { connected, findings, steps, nodes, debateRounds, yields, status, agentStreams };
}
