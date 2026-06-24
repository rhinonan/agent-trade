import { AnalysisHeader } from "@/components/analysis/AnalysisHeader";
import { LiveDebatePanel } from "@/components/analysis/LiveDebatePanel";
import { ConclusionCard } from "@/components/analysis/ConclusionCard";
import { DataPanel } from "@/components/analysis/DataPanel";
import { getDb } from "@/lib/db/client.js";
import { AnalysisRepo } from "@/lib/db/analysis-repo.js";
import { AnalysisLiveClient } from "./client";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const repo = new AnalysisRepo(getDb());
  const record = repo.getById(id);

  if (!record) {
    return (
      <div className="p-8 text-center text-zinc-500">分析记录不存在</div>
    );
  }

  const context = JSON.parse(record.context);
  const isRunning = record.status === "running";

  return (
    <main className="h-screen flex flex-col lg:flex-row bg-zinc-950">
      {/* Left: Analysis content */}
      <div className="flex-1 min-w-0 overflow-y-auto p-4">
        <AnalysisHeader
          target={{
            type: record.targetType,
            code: record.targetCode,
            name: record.targetName ?? undefined,
          }}
          workflow={record.workflowName}
          status={record.status}
        />
        {isRunning ? (
          <AnalysisLiveClient sessionId={id} />
        ) : (
          <>
            <LiveDebatePanel findings={context.findings ?? []} />
            {(() => {
              const judgeFinding = context.findings?.find((f: any) => f.agent === "judge");
              return judgeFinding ? (
                <ConclusionCard
                  conclusion={judgeFinding.analysis.conclusion}
                  reasoning={judgeFinding.analysis.reasoning}
                  sentiment={judgeFinding.analysis.sentiment}
                  confidence={judgeFinding.analysis.confidence}
                />
              ) : null;
            })()}
          </>
        )}
      </div>

      {/* Right: Data panel */}
      <aside className="hidden lg:flex lg:w-[440px] flex-shrink-0 border-l border-zinc-800 bg-zinc-950/50 overflow-y-auto">
        <DataPanel
          code={record.targetCode}
          name={record.targetName}
          agentConclusions={[]}
        />
      </aside>
    </main>
  );
}
