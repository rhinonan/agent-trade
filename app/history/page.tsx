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
  RUNNING:  { dot: "bg-blue-400 animate-pulse", label: "进行中", text: "text-blue-400" },
  PAUSED:   { dot: "bg-amber-400", label: "已暂停", text: "text-amber-400" },
  STOPPED:  { dot: "bg-zinc-500", label: "已完成", text: "text-zinc-400" },
};

export default function HistoryPage() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/sessions?limit=50")
      .then((res) => res.json())
      .then((data) => {
        setSessions(data.sessions ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function formatDate(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  return (
    <main className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ← 返回
          </button>
          <h1 className="text-2xl font-bold text-zinc-200">历史分析</h1>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-zinc-900/50 border border-zinc-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-center text-zinc-500 py-12">暂无分析记录</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const style = STATUS_STYLES[s.status] ?? STATUS_STYLES.STOPPED;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => router.push(`/analyze/${s.id}`)}
                  className="w-full text-left bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 rounded-xl px-4 py-3 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-blue-400">{s.targetCode}</span>
                      {s.targetName && (
                        <span className="text-sm text-zinc-300">{s.targetName}</span>
                      )}
                      <span className="text-xs text-zinc-600">{s.workflowName}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                      <span className={`text-xs ${style.text}`}>{style.label}</span>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-600 mt-1">{formatDate(s.createdAt)}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
