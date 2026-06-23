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
  const router = useRouter();

  async function handleStart() {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), workflow }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `请求失败 (${res.status})`);
      }
      const { sessionId } = await res.json();
      router.push(`/session/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败，请重试");
      setLoading(false);
    }
  }

  return (
    <main className="relative z-10 min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight text-emerald-400 text-glow">
            AgentTrade
          </h1>
          <p className="mt-3 text-zinc-500">多 Agent 对抗行情分析</p>
        </div>
        <div className="space-y-6 bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
          <StockSearchInput value={code} onChange={setCode} />
          <WorkflowSelector selected={workflow} onSelect={setWorkflow} />
          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}
          <button
            onClick={handleStart}
            disabled={!code.trim() || loading}
            className="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors"
          >
            {loading ? "启动中..." : "开始分析"}
          </button>
        </div>
        <RecentAnalyses />
      </div>
    </main>
  );
}
