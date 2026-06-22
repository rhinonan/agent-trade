interface MessageBubbleProps {
  role: "agent" | "user";
  senderName: string;
  content: string;
  metadata?: any;
  timestamp: number;
}

export function MessageBubble({ role, senderName, content, metadata, timestamp }: MessageBubbleProps) {
  const isUser = role === "user";
  const analysis = metadata?.analysis;
  const sentiment = analysis?.sentiment ?? "neutral";
  const sentimentColor = sentiment === "bullish" ? "border-l-emerald-500"
    : sentiment === "bearish" ? "border-l-red-500" : "border-l-zinc-500";

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[75%] bg-emerald-600/20 border border-emerald-700/40 rounded-2xl rounded-br-sm px-4 py-2.5">
          <p className="text-sm text-zinc-200 whitespace-pre-wrap">{content}</p>
          <span className="text-[10px] text-zinc-500 mt-1">
            {new Date(timestamp).toLocaleTimeString("zh-CN")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex mb-4">
      <div className={`max-w-[80%] bg-zinc-900 rounded-xl border-l-4 ${sentimentColor} px-4 py-3`}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-medium text-emerald-400">{senderName}</span>
          {analysis && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              sentiment === "bullish" ? "bg-emerald-900/50 text-emerald-300"
              : sentiment === "bearish" ? "bg-red-900/50 text-red-300"
              : "bg-zinc-800 text-zinc-400"
            }`}>
              {sentiment}
            </span>
          )}
          {analysis?.confidence !== undefined && (
            <span className="text-[10px] text-zinc-500">
              conf: {(analysis.confidence * 100).toFixed(0)}%
            </span>
          )}
        </div>
        <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{content.length > 300 ? content.slice(0, 300) + "…" : content}</p>
        {analysis?.reasoning?.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400">推理过程</summary>
            <ul className="mt-1 ml-3 space-y-0.5">
              {analysis.reasoning.map((r: string, i: number) => (
                <li key={i} className="text-xs text-zinc-400">— {r}</li>
              ))}
            </ul>
          </details>
        )}
        <span className="text-[10px] text-zinc-600 mt-1.5 block">
          {new Date(timestamp).toLocaleTimeString("zh-CN")}
        </span>
      </div>
    </div>
  );
}
