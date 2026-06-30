"use client";
import { useAnalysisSocket, type PersistedEvent } from "@/hooks/useAnalysisSocket";
import { StepProgress } from "@/components/analysis/StepProgress";
import { LiveDebatePanel } from "@/components/analysis/LiveDebatePanel";

export function AnalysisLiveClient({
  sessionId,
  initialEvents,
}: {
  sessionId: string;
  initialEvents?: PersistedEvent[];
}) {
  const { connected, findings, steps, nodes, agentStreams, status } =
    useAnalysisSocket(sessionId, initialEvents);

  return (
    <div>
      <StepProgress steps={steps} nodes={nodes} />
      <LiveDebatePanel
        agentStreams={agentStreams}
        isRunning={status === "running"}
      />
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
      {status === "error" && (
        <div className="mt-4 p-4 bg-red-950/30 border border-red-900/50 rounded-lg">
          <p className="text-sm text-red-400 font-medium">分析失败</p>
          <p className="text-xs text-red-400/60 mt-1">
            分析过程出错，请返回重试
          </p>
        </div>
      )}
      {status === "complete" && (
        <p className="text-sm mt-4 text-emerald-400">
          ● 分析完成
        </p>
      )}
    </div>
  );
}
