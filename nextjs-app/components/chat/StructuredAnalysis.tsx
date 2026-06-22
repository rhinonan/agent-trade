"use client";

interface Analysis {
  conclusion: string;
  reasoning?: string[];
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
}

interface StructuredAnalysisProps {
  analysis: Analysis;
  content: string;
  expanded: boolean;
  onToggle: () => void;
}

const sentimentStyles: Record<string, string> = {
  bullish: "text-emerald-400 bg-emerald-950/40 border-emerald-500/30",
  bearish: "text-red-400 bg-red-950/40 border-red-500/30",
  neutral: "text-zinc-300 bg-zinc-800 border-zinc-600/30",
};

export function StructuredAnalysis({
  analysis,
  content,
  expanded,
  onToggle,
}: StructuredAnalysisProps) {
  const sentimentClass = sentimentStyles[analysis.sentiment] ?? sentimentStyles.neutral;
  const sentimentLabel =
    analysis.sentiment === "bullish" ? "bullish"
    : analysis.sentiment === "bearish" ? "bearish"
    : "neutral";

  const MAX_CHARS = 120;
  const conclusionText = analysis.conclusion || content;
  const needsTruncation = conclusionText.length > MAX_CHARS;

  return (
    <div onClick={onToggle} className="cursor-pointer">
      {/* Header row: sentiment + confidence */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${sentimentClass}`}>
          {sentimentLabel}
        </span>
        <span className="text-[10px] text-zinc-500">
          conf: {(analysis.confidence * 100).toFixed(0)}%
        </span>
      </div>

      {/* Conclusion */}
      <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
        {needsTruncation && !expanded
          ? conclusionText.slice(0, MAX_CHARS) + "…"
          : conclusionText}
      </p>

      {/* Reasoning (visible only when expanded) */}
      {expanded && analysis.reasoning && analysis.reasoning.length > 0 && (
        <div className="mt-3 pt-3 border-t border-zinc-800">
          <span className="text-xs font-medium text-zinc-500">推理过程</span>
          <ul className="mt-2 space-y-1">
            {analysis.reasoning.map((r, i) => (
              <li key={i} className="flex gap-2 text-xs text-zinc-400">
                <span className="text-zinc-600 shrink-0">▎</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Expand/collapse toggle */}
      {needsTruncation && (
        <div className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
          {expanded ? "点击收起 ▲" : "点击展开 ▼"}
        </div>
      )}
    </div>
  );
}
