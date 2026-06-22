"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SessionSummary {
  id: string;
  targetCode: string;
  targetName: string | null;
  workflowName: string;
  status: string;
  createdAt: number;
}

const STATUS_STYLES: Record<string, { dot: string; label: string; text: string }> = {
  RUNNING:  { dot: "bg-emerald-400 animate-pulse", label: "进行中", text: "text-emerald-400" },
  PAUSED:   { dot: "bg-amber-400", label: "已暂停", text: "text-amber-400" },
  STOPPED:  { dot: "bg-zinc-500", label: "已完成", text: "text-zinc-400" },
};

export function RecentAnalyses() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/sessions?limit=5")
      .then((res) => res.json())
      .then((data) => {
        setSessions(data.sessions ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  // Silent hide on error or empty
  if (error) return null;
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="h-5 w-24 bg-zinc-800 rounded" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-zinc-900/50 border border-zinc-800 rounded-xl" />
        ))}
      </div>
    );
  }
  if (sessions.length === 0) return null;

  function formatDate(ts: number): string {
    const d = new Date(ts);
    return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-400">最近分析</h3>
        <button
          onClick={() => router.push("/history")}
          className="text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
        >
          查看全部 →
        </button>
      </div>
      <div className="space-y-2">
        {sessions.map((s) => {
          const style = STATUS_STYLES[s.status] ?? STATUS_STYLES.STOPPED;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => router.push(`/session/${s.id}`)}
              className="w-full text-left bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-3 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-emerald-400">{s.targetCode}</span>
                  {s.targetName && (
                    <span className="text-sm text-zinc-300">{s.targetName}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                  <span className={`text-xs ${style.text}`}>{style.label}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-zinc-600">{s.workflowName}</span>
                <span className="text-xs text-zinc-600">{formatDate(s.createdAt)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
