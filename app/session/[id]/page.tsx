import { ChatPanel } from "@/components/chat/ChatPanel.js";
import { DataPanel } from "@/components/analysis/DataPanel.js";
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

  return (
    <main className="h-screen flex flex-col lg:flex-row bg-zinc-950">
      {/* Left: Chat (always visible, takes remaining space) */}
      <div className="flex-1 min-w-0 flex flex-col">
        <ChatPanel sessionId={id} />
      </div>

      {/* Right: Data panel (hidden on mobile, fixed width on desktop) */}
      <aside className="hidden lg:flex lg:w-[440px] flex-shrink-0 border-l border-zinc-800 bg-zinc-950/50 overflow-y-auto">
        <DataPanel
          code={targetCode ?? ""}
          name={targetName}
          agentConclusions={[]}
        />
      </aside>
    </main>
  );
}
