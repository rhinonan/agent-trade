interface AnalysisHeaderProps {
  target: { type: string; code: string; name?: string };
  workflow: string;
  status: "running" | "complete" | "error";
}

export function AnalysisHeader({ target, workflow, status }: AnalysisHeaderProps) {
  const statusLabel: Record<string, string> = {
    running: "分析中",
    complete: "已完成",
    error: "出错",
  };
  const statusColor: Record<string, string> = {
    running: "text-amber-400",
    complete: "text-blue-400",
    error: "text-red-400",
  };
  return (
    <div className="flex items-center justify-between py-4 border-b border-zinc-800">
      <div>
        <h1 className="text-2xl font-bold">{target.name ?? target.code}</h1>
        <p className="text-zinc-500 text-sm">
          {target.code} · {workflow}
        </p>
      </div>
      <span className={`${statusColor[status]} text-sm font-medium`}>
        {statusLabel[status] ?? status}
      </span>
    </div>
  );
}
