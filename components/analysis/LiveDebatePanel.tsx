"use client";
import { useMemo } from "react";
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

  // Determine which agent stream received the most recent AGENT_WRITING event.
  // When a new card starts writing, earlier cards accelerate their typewriter
  // to finish within ~1s.
  const latestWritingNodeId = useMemo(() => {
    if (!agentStreams) return null;
    let latest: { nodeId: string; ts: number } | null = null;
    for (const stream of agentStreams.values()) {
      if (stream.lastWritingTs && (!latest || stream.lastWritingTs > latest.ts)) {
        latest = { nodeId: stream.nodeId, ts: stream.lastWritingTs };
      }
    }
    return latest?.nodeId ?? null;
  }, [agentStreams]);

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
          isLatestWriting={
            latestWritingNodeId === null
              ? undefined
              : stream.nodeId === latestWritingNodeId
          }
        />
      ))}
    </div>
  );
}
