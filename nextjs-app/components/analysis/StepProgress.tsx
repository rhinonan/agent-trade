import type { NodeState } from "@/hooks/useAnalysisSocket";

interface StepState {
  stepId: string;
  type: string;
  status: "pending" | "running" | "complete";
}

interface StepProgressProps {
  /** Legacy step-level state (backward compat). */
  steps?: StepState[];
  /** LangGraph node-level state — takes precedence when provided. */
  nodes?: NodeState[];
}

export function StepProgress({ steps = [], nodes }: StepProgressProps) {
  const items = nodes
    ? nodes.map((n) => ({
        id: n.nodeId,
        label: n.agentName ?? n.nodeId,
        status: n.status,
      }))
    : steps.map((s) => ({
        id: s.stepId,
        label: s.type,
        status: s.status,
      }));

  return (
    <div className="flex gap-2 py-4">
      {items.map((item, i) => (
        <div key={item.id} className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${
              item.status === "complete"
                ? "bg-blue-500"
                : item.status === "error"
                  ? "bg-red-500"
                  : item.status === "running"
                    ? "bg-amber-400 animate-pulse"
                    : "bg-zinc-700"
            }`}
          />
          <span className="text-xs text-zinc-500">{item.label}</span>
          {i < items.length - 1 && <div className="w-8 h-px bg-zinc-700" />}
        </div>
      ))}
    </div>
  );
}
