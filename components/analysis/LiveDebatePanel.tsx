import { AgentBubble } from "./AgentBubble";

interface Finding {
  agent: string;
  conclusion: string;
  sentiment: string;
  confidence: number;
  step: string;
  timestamp: number;
}

export function LiveDebatePanel({ findings }: { findings: Finding[] }) {
  return (
    <div className="space-y-3 py-4">
      {findings.length === 0 && (
        <p className="text-zinc-600 text-center py-8">
          等待 Agent 分析结果...
        </p>
      )}
      {findings.map((f, i) => (
        <AgentBubble
          key={`${f.step}-${f.agent}-${i}`}
          agent={f.agent}
          conclusion={f.conclusion}
          sentiment={f.sentiment}
          confidence={f.confidence}
          timestamp={f.timestamp}
        />
      ))}
    </div>
  );
}
