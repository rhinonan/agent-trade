"use client";
import { AgentBubble } from "./AgentBubble";
import type { AgentStream } from "@/hooks/useAnalysisSocket";

interface LiveDebatePanelProps {
  /** Stream data from a live analysis session. Omit for completed analyses. */
  agentStreams?: Map<string, AgentStream>;
  /** Whether the analysis is still running (to show conn status). */
  isRunning?: boolean;
}

export function LiveDebatePanel({
  agentStreams,
  isRunning,
}: LiveDebatePanelProps) {
  const entries = agentStreams ? Array.from(agentStreams.values()) : [];

  return (
    <div className="space-y-3 py-4">
      {entries.length === 0 && isRunning && (
        <p className="text-zinc-600 text-center py-8">
          等待 Agent 分析结果...
        </p>
      )}
      {entries.length === 0 && !isRunning && (
        <p className="text-zinc-600 text-center py-8">
          暂无分析数据
        </p>
      )}
      {entries.map((stream) => (
        <AgentBubble
          key={stream.nodeId}
          stream={stream}
        />
      ))}
    </div>
  );
}
