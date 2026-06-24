"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { StockSearchInput } from "@/components/landing/StockSearchInput.js";
import { WorkflowSelector } from "@/components/landing/WorkflowSelector.js";
import { RecentAnalyses } from "@/components/landing/RecentAnalyses.js";

export default function AnalyzePage() {
  const [code, setCode] = useState("");
  const [workflow, setWorkflow] = useState("layered");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const router = useRouter();

  async function handleStart() {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), workflow }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `请求失败 (${res.status})`);
      }
      const { sessionId } = await res.json();
      router.push(`/analyze/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败，请重试");
      setLoading(false);
    }
  }

  return (
    <main className="relative z-10 min-h-[calc(100vh-3.5rem)] flex flex-col md:flex-row">
      {/* Left: Recent history */}
      <aside className="md:w-[40%] lg:w-[35%] border-b md:border-b-0 md:border-r border-zinc-800 md:overflow-y-auto md:max-h-[calc(100vh-3.5rem)]">
        {/* Mobile: collapsible toggle */}
        <div className="md:hidden">
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30 transition-colors"
          >
            <span className="flex items-center gap-2">
              <span>{historyOpen ? "▾" : "▸"}</span>
              历史记录
            </span>
            <span className="text-xs text-zinc-600">最近 5 条</span>
          </button>
          {historyOpen && (
            <div className="px-4 pb-4 border-b border-zinc-800">
              <RecentAnalyses />
            </div>
          )}
        </div>
        {/* Desktop: always visible */}
        <div className="hidden md:block p-4 md:p-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-400">历史记录</h2>
            </div>
            <RecentAnalyses />
          </div>
        </div>
      </aside>

      {/* Right: Input form */}
      <section className="flex-1 flex items-start justify-center p-4 md:p-8 md:pt-12">
        <div className="w-full max-w-lg space-y-6">
          <div className="space-y-6 md:bg-zinc-900/50 md:border md:border-zinc-800 md:rounded-xl md:p-6">
            <StockSearchInput value={code} onChange={setCode} />
            <WorkflowSelector selected={workflow} onSelect={setWorkflow} />
            {error && (
              <p className="text-sm text-red-400 text-center">{error}</p>
            )}
            <button
              onClick={handleStart}
              disabled={!code.trim() || loading}
              className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors"
            >
              {loading ? "启动中..." : "开始分析"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
