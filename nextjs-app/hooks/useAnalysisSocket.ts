"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";

interface Finding {
  step: string;
  agent: string;
  conclusion: string;
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

export function useAnalysisSocket(sessionId: string) {
  const [connected, setConnected] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [status, setStatus] = useState<"running" | "complete" | "error">(
    "running",
  );
  const socketRef = useRef<Socket | null>(null);

  const connect = useCallback(() => {
    const url = window.location.origin;
    const socket = io(`${url}/analysis`, {
      transports: ["websocket", "polling"],
      forceNew: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("subscribe", { sessionId });
    });

    socket.on("analysis:start", (payload: any) => {
      const wfSteps =
        payload.workflow === "bull-bear"
          ? ["bull-analysis", "bear-analysis", "cross-critique", "final"]
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
    });

    socket.on("step:start", (payload: any) => {
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

    socket.on("step:complete", (payload: any) => {
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
            sentiment: f.sentiment,
            confidence: f.confidence,
            timestamp: Date.now(),
          })),
        ]);
      }
    });

    socket.on("analysis:complete", (payload: any) => {
      setStatus("complete");
      if (payload.context?.findings) {
        setFindings(payload.context.findings);
      }
    });

    socket.on("analysis:error", () => setStatus("error"));
    socket.on("step:error", () => {});

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

  return { connected, findings, steps, status };
}
