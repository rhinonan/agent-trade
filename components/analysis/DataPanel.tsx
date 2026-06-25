"use client";
import { QuoteCard } from "./QuoteCard.js";
import { IndicatorList } from "./IndicatorList.js";
import { AgentSummary } from "./AgentSummary.js";
import type { AgentConclusion } from "./types.js";

interface DataPanelProps {
  code: string;
  name?: string | null;
  agentConclusions: AgentConclusion[];
}

export function DataPanel({ code, name, agentConclusions }: DataPanelProps) {
  return (
    <div className="w-full flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <QuoteCard code={code} name={name ?? undefined} />
      {/* IndicatorList receives null for now — indicators will be wired
          when the SSE stream or indicator API is integrated. */}
      <IndicatorList indicators={null} />
      <AgentSummary agents={agentConclusions} />
    </div>
  );
}
