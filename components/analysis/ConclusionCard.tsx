interface ConclusionCardProps {
  conclusion: string;
  reasoning: string[];
  sentiment: string;
  confidence: number;
}

export function ConclusionCard({
  conclusion,
  reasoning,
  sentiment,
  confidence,
}: ConclusionCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mt-4">
      <h2 className="text-lg font-semibold text-zinc-100 mb-3">综合研判</h2>
      <p className="text-zinc-300 leading-relaxed">{conclusion}</p>
      {reasoning.length > 0 && (
        <ul className="mt-3 space-y-1">
          {reasoning.map((r, i) => (
            <li key={i} className="text-zinc-500 text-sm">
              · {r}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex gap-3 text-sm">
        <span className="text-zinc-500">
          倾向: <span className="text-zinc-300">{sentiment}</span>
        </span>
        <span className="text-zinc-500">
          置信度:{" "}
          <span className="text-zinc-300">
            {(confidence * 100).toFixed(0)}%
          </span>
        </span>
      </div>
    </div>
  );
}
