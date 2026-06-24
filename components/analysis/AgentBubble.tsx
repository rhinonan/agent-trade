"use client";

interface AgentBubbleProps {
  agent: string;
  conclusion: string;
  sentiment: string;
  confidence: number;
  timestamp: number;
  /** Optional reasoning chain from LangGraph node output. */
  reasoning?: string;
}

export function AgentBubble({
  agent,
  conclusion,
  sentiment,
  confidence,
  timestamp,
  reasoning,
}: AgentBubbleProps) {
  const sentimentColor =
    sentiment === "bullish"
      ? "border-l-blue-500"
      : sentiment === "bearish"
        ? "border-l-red-500"
        : "border-l-zinc-500";
  return (
    <div className={`bg-zinc-900 rounded-lg p-4 border-l-4 ${sentimentColor}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm text-zinc-300">{agent}</span>
        <span className="text-xs text-zinc-500">
          {sentiment} · {(confidence * 100).toFixed(0)}% ·{" "}
          {new Date(timestamp).toLocaleTimeString("zh-CN")}
        </span>
      </div>
      <p className="text-zinc-400 text-sm leading-relaxed">{conclusion}</p>
      {reasoning && (
        <details className="mt-2">
          <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400">
            推理过程
          </summary>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{reasoning}</p>
        </details>
      )}
    </div>
  );
}
