import { AnalysisHeader } from "@/components/analysis/AnalysisHeader";
import { StepProgress } from "@/components/analysis/StepProgress";
import { LiveDebatePanel } from "@/components/analysis/LiveDebatePanel";
import { ConclusionCard } from "@/components/analysis/ConclusionCard";
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
    <main className="max-w-3xl mx-auto p-4 min-h-screen">
      <AnalysisHeader
        target={{
          type: record.targetType,
          code: record.targetCode,
          name: record.targetName ?? undefined,
        }}
        workflow={record.workflowName}
        status={record.status}
      />
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
      {isRunning && <AnalysisLiveClient sessionId={id} />}
    </main>
  );
}
