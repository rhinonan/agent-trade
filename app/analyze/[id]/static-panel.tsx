"use client";
import { useMemo } from "react";
import { LiveDebatePanel } from "@/components/analysis/LiveDebatePanel";
import { ConclusionCard } from "@/components/analysis/ConclusionCard";
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

interface JudgeAnalysis {
  conclusion: string;
  reasoning: string[];
  sentiment: string;
  confidence: number;
}

interface Props {
  findings: Finding[];
  judgeAnalysis: JudgeAnalysis | null;
}

/**
 * Converts static findings from the DB into agentStreams Map for
 * LiveDebatePanel consumption on completed (non-live) analysis pages.
 */
export function StaticFindingsPanel({ findings, judgeAnalysis }: Props) {
  const agentStreams = useMemo(() => {
    const map = new Map<string, AgentStream>();
    for (const f of findings) {
      if (f.agent === "judge") continue; // judge shown in ConclusionCard
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

  const hasFindings = findings.some((f) => f.agent !== "judge");

  return (
    <>
      <LiveDebatePanel
        agentStreams={agentStreams}
        isRunning={false}
      />
      {judgeAnalysis && (
        <ConclusionCard
          conclusion={judgeAnalysis.conclusion}
          reasoning={judgeAnalysis.reasoning}
          sentiment={judgeAnalysis.sentiment}
          confidence={judgeAnalysis.confidence}
        />
      )}
    </>
  );
}
