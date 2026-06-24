"use client";
import { useAnalysisSocket } from "@/hooks/useAnalysisSocket";
import { StepProgress } from "@/components/analysis/StepProgress";
import { LiveDebatePanel } from "@/components/analysis/LiveDebatePanel";
import { ConclusionCard } from "@/components/analysis/ConclusionCard";

export function AnalysisLiveClient({ sessionId }: { sessionId: string }) {
  const { connected, findings, steps, nodes, debateRounds, yields, status } = useAnalysisSocket(sessionId);

  const judgeFinding = findings.find((f) => f.agent === "judge");

  return (
    <div>
      <StepProgress steps={steps} nodes={nodes} />
      <LiveDebatePanel findings={findings} />
      {judgeFinding && (
        <ConclusionCard
          conclusion={judgeFinding.conclusion}
          reasoning={judgeFinding.reasoning ?? []}
          sentiment={judgeFinding.sentiment}
          confidence={judgeFinding.confidence}
        />
      )}
      {status === "running" && (
        <p
          className={`text-sm mt-4 ${
            connected
              ? "text-amber-400 animate-pulse"
              : "text-red-400"
          }`}
        >
          {connected
            ? "● 实时分析进行中..."
            : "● 连接断开，正在重连..."}
        </p>
      )}
    </div>
  );
}
