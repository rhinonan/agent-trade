"use client";
import { useMemo } from "react";
import { LiveDebatePanel } from "@/components/analysis/LiveDebatePanel";
import type { AgentStream } from "@/hooks/useAnalysisSocket";

interface Finding {
  agent: string;
  conclusion: string;
  sentiment: string;
  confidence: number;
  step: string;
  timestamp: number;
  reasoning?: string[];
}

interface Props {
  findings: Finding[];
}

/**
 * Converts static findings from the DB into agentStreams Map for
 * LiveDebatePanel consumption on completed (non-live) analysis pages.
 */
export function StaticFindingsPanel({ findings }: Props) {
  const agentStreams = useMemo(() => {
    const map = new Map<string, AgentStream>();
    for (const f of findings) {
      const key = f.step || f.agent;
      map.set(key, {
        nodeId: key,
        agentName: f.agent,
        status: "done",
        toolCalls: [],
        toolResults: new Map(),
        conclusion: f.conclusion,
        reasoning: Array.isArray(f.reasoning) ? f.reasoning.join("\n") : (f.reasoning ?? ""),
        finding: f,
        startedAt: f.timestamp,
      });
    }
    return map;
  }, [findings]);

  return (
    <LiveDebatePanel
      agentStreams={agentStreams}
      isRunning={false}
    />
  );
}
