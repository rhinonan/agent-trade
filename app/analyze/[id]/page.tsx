import { AnalysisHeader } from "@/components/analysis/AnalysisHeader";
import { DataPanel } from "@/components/analysis/DataPanel";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { getDb } from "@/lib/db/client.js";
import { AnalysisRepo } from "@/lib/db/analysis-repo.js";
import { EventRepo } from "@/lib/db/event-repo.js";
import { AnalysisLiveClient } from "./client";
import { StaticFindingsPanel } from "./static-panel";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  const repo = new AnalysisRepo(db);
  const record = repo.getById(id);

  if (!record) {
    return (
      <div className="p-8 text-center text-zinc-500">分析记录不存在</div>
    );
  }

  const context = JSON.parse(record.context);
  const isRunning = record.status === "running";

  // 如果是 running 状态，从 DB 读取已有事件供客户端回放
  let initialEvents: Array<{
    id: number;
    sessionId: string;
    seq: number;
    eventType: string;
    payload: string;
    createdAt: number;
  }> = [];
  if (isRunning) {
    const eventRepo = new EventRepo(db);
    initialEvents = eventRepo.getBySession(id);
  }

  const dataPanelContent = (
    <DataPanel
      code={record.targetCode}
      name={record.targetName}
      agentConclusions={[]}
    />
  );

  return (
    <main className="h-screen flex flex-col md:flex-row bg-zinc-950">
      {/* Left: Analysis content */}
      <div className="flex-1 min-w-0 overflow-y-auto p-4 pb-16 md:pb-4">
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
          <AnalysisLiveClient sessionId={id} initialEvents={initialEvents} />
        ) : (
          <StaticFindingsPanel
            findings={context.findings ?? []}
          />
        )}
      </div>

      {/* Right: Data panel (desktop sidebar) */}
      <aside className="hidden md:flex md:w-[420px] lg:w-[540px] flex-shrink-0 border-l border-zinc-800 bg-zinc-950/50 overflow-y-auto">
        {dataPanelContent}
      </aside>

      {/* Mobile: BottomSheet data panel */}
      <BottomSheet triggerLabel="📊 行情数据" title="行情数据">
        {dataPanelContent}
      </BottomSheet>
    </main>
  );
}
