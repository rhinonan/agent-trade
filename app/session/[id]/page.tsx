import { ChatPanel } from "@/components/chat/ChatPanel.js";
import { DataPanel } from "@/components/analysis/DataPanel.js";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { getDb } from "@/lib/db/client.js";
import { SessionRepo } from "@/lib/db/session-repo.js";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch session info for the data panel
  let targetCode: string | null = null;
  let targetName: string | null = null;
  try {
    const db = getDb();
    const sessionRepo = new SessionRepo(db);
    const session = sessionRepo.getById(id);
    if (session) {
      targetCode = session.targetCode;
      targetName = session.targetName;
    }
  } catch (err) {
    console.error("Failed to fetch session info for DataPanel:", err);
  }

  const dataPanelContent = (
    <DataPanel
      code={targetCode ?? ""}
      name={targetName}
      agentConclusions={[]}
    />
  );

  return (
    <main className="h-screen flex flex-col md:flex-row bg-zinc-950">
      {/* Left: Chat (always visible, takes remaining space) */}
      <div className="flex-1 min-w-0 flex flex-col pb-16 md:pb-0">
        <ChatPanel sessionId={id} />
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
