"use client";
import { QuoteCard } from "./QuoteCard.js";
import { IndicatorList } from "./IndicatorList.js";
import { AgentSummary } from "./AgentSummary.js";

interface AgentConclusion {
  agentId: string;
  agentName: string;
  conclusion: string;
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
}

interface DataPanelProps {
  code: string;
  name?: string | null;
  agentConclusions: AgentConclusion[];
}

export function DataPanel({ code, name, agentConclusions }: DataPanelProps) {
  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <QuoteCard code={code} name={name ?? undefined} />
      {/* IndicatorList receives null for now — indicators will be wired
          when the SSE stream or indicator API is integrated. */}
      <IndicatorList indicators={null} />
      <AgentSummary agents={agentConclusions} />
    </div>
  );
}
