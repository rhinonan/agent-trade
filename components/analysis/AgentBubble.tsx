"use client";
import { useState, useMemo } from "react";
import type { AgentStream } from "@/hooks/useAnalysisSocket";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { TypewriterText } from "./TypewriterText";
import { MarkdownContent } from "./MarkdownContent";
import { ToolCallCard } from "./ToolCallCard";

interface AgentBubbleProps {
  stream: AgentStream;
  /** Called when typewriter finishes and agent is fully done. */
  onRevealDone?: () => void;
}

export function AgentBubble({ stream, onRevealDone }: AgentBubbleProps) {
  const [expanded, setExpanded] = useState(true); // open by default during live analysis
  const [conclusionTypingDone, setConclusionTypingDone] = useState(false);
  const [reasoningTypingDone, setReasoningTypingDone] = useState(false);

  const isFullyDone =
    conclusionTypingDone && (reasoningTypingDone || !stream.reasoning);

  // Derive sentiment color from finding (if available)
  const sentimentColor = useMemo(() => {
    const s = stream.finding?.sentiment;
    if (!s) {
      return isFullyDone ? "border-l-zinc-600" : "border-l-zinc-700";
    }
    return s === "bullish"
      ? "border-l-blue-500"
      : s === "bearish"
        ? "border-l-red-500"
        : "border-l-zinc-500";
  }, [stream.finding, isFullyDone]);

  // First ~80 chars of conclusion for collapsed preview
  const conclusionPreview = stream.conclusion
    ? stream.conclusion.slice(0, 80) + (stream.conclusion.length > 80 ? "…" : "")
    : "";

  return (
    <div
      className={`bg-zinc-900/80 rounded-lg border-l-4 transition-all duration-700 ${sentimentColor}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="font-medium text-sm text-zinc-300">
          {stream.agentName}
        </span>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-zinc-600 hover:text-zinc-400 cursor-pointer transition-colors"
        >
          {expanded ? "收起 ▲" : "展开 ▼"}
        </button>
      </div>

      <div className="px-4 pb-2">
        {/* Thinking indicator */}
        {(stream.status === "thinking" || stream.status === "calling_tool") &&
          stream.conclusion === "" && <ThinkingIndicator />}

        {/* Collapsed mode: show preview only */}
        {!expanded && (
          <div className="text-zinc-500 text-sm leading-relaxed line-clamp-2 whitespace-pre-wrap break-words">
            {conclusionPreview || (
              <span className="text-zinc-600 italic">等待输出…</span>
            )}
          </div>
        )}

        {/* Expanded mode: full content */}
        {expanded && (
          <>
            {/* Tool calls */}
            {stream.toolCalls.length > 0 && (
              <div className="space-y-0.5 mb-2">
                {stream.toolCalls.map((tc) => {
                  const tr = stream.toolResults.get(`${tc.tool}-${tc.ts}`);
                  return (
                    <ToolCallCard
                      key={`${tc.tool}-${tc.ts}`}
                      tool={tc.tool}
                      args={tc.args}
                      result={tr?.result}
                      ts={tc.ts}
                      isError={tr?.isError}
                      collapsed={stream.toolCalls.length > 6}
                    />
                  );
                })}
              </div>
            )}

            {/* Conclusion: typewriter → markdown */}
            {stream.conclusion && (
              <div className="my-2">
                <p className="text-xs text-zinc-600 mb-1">结论</p>
                {conclusionTypingDone ? (
                  <MarkdownContent>
                    {stream.conclusion}
                  </MarkdownContent>
                ) : (
                  <TypewriterText
                    text={stream.conclusion}
                    speed={100}
                    onDone={() => setConclusionTypingDone(true)}
                    className="text-zinc-300 text-sm leading-relaxed"
                  />
                )}
              </div>
            )}

            {/* Reasoning: shown after conclusion typewriter finishes */}
            {stream.reasoning && conclusionTypingDone && (
              <div className="mt-2">
                <p className="text-xs text-zinc-600 mb-1">推理</p>
                {reasoningTypingDone ? (
                  <MarkdownContent>
                    {stream.reasoning}
                  </MarkdownContent>
                ) : (
                  <TypewriterText
                    text={stream.reasoning}
                    speed={100}
                    onDone={() => setReasoningTypingDone(true)}
                    className="text-zinc-500 text-sm leading-relaxed"
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* Completion indicator */}
        {isFullyDone && stream.finding && (
          <div className="flex items-center gap-2 mt-2 text-xs text-zinc-600">
            <span>{stream.finding.sentiment}</span>
            <span>·</span>
            <span>{(stream.finding.confidence * 100).toFixed(0)}% 信心度</span>
          </div>
        )}
      </div>
    </div>
  );
}
