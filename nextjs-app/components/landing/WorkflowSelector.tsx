"use client";

const WORKFLOW_OPTIONS = [
  { value: "bull-bear", label: "牛熊对抗", description: "Bull vs Bear 对抗分析" },
  { value: "quick-scan", label: "快速扫描", description: "快速技术面+基本面扫描" },
  { value: "layered", label: "四层深度分析", description: "四层对抗分析：感知→分析→决策→执行风控" },
];

interface WorkflowSelectorProps {
  selected: string;
  onSelect: (name: string) => void;
}

export function WorkflowSelector({ selected, onSelect }: WorkflowSelectorProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-zinc-400">分析工作流</label>
      <div className="grid grid-cols-1 gap-2">
        {WORKFLOW_OPTIONS.map((wf) => (
          <button
            key={wf.value}
            onClick={() => onSelect(wf.value)}
            className={`text-left p-3 rounded-lg border transition-colors ${
              selected === wf.value
                ? "border-blue-500 bg-blue-500/10 text-blue-300"
                : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            <div className="font-medium text-zinc-100">{wf.label}</div>
            <div className="text-xs mt-1">{wf.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
