"use client";
import type { AgentConclusion } from "./types.js";

interface AgentSummaryProps {
  agents: AgentConclusion[];
  finalConclusion?: string;
}

const SENTIMENT_STYLE: Record<AgentConclusion["sentiment"], string> = {
  bullish: "border-l-emerald-500",
  bearish: "border-l-red-500",
  neutral: "border-l-zinc-500",
};

export function AgentSummary({ agents, finalConclusion }: AgentSummaryProps) {
  if (agents.length === 0 && !finalConclusion) {
    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-medium text-zinc-400 mb-2">Agent 结论</h3>
        <p className="text-xs text-zinc-600">暂无 Agent 结论</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-medium text-zinc-400">Agent 结论</h3>
      <div className="space-y-2">
        {agents.map((a) => (
          <div
            key={a.agentId}
            className={`border-l-4 ${SENTIMENT_STYLE[a.sentiment] ?? "border-l-zinc-500"} bg-zinc-900/80 rounded p-3`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-zinc-300">
                {a.agentName}
              </span>
              <span className="text-xs text-zinc-500">
                {Math.round(a.confidence * 100)}%
              </span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
              {a.conclusion}
            </p>
          </div>
        ))}
      </div>
      {finalConclusion && (
        <div className="border-b-2 border-emerald-500 pb-3">
          <p className="text-sm text-emerald-300 leading-relaxed">
            {finalConclusion}
          </p>
        </div>
      )}
    </div>
  );
}
