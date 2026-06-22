import { ChatPanel } from "@/components/chat/ChatPanel.js";
import { AGENT_MANIFEST } from "@/lib/agents/manifest.js";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="h-screen flex flex-col bg-zinc-950">
      <ChatPanel sessionId={id} agents={AGENT_MANIFEST} />
    </main>
  );
}
