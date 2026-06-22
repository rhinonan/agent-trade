import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { WORKFLOWS } from "@/lib/workflows/index.js";
import { AgentRegistry } from "@/lib/engine/registry.js";
import { registerBuiltinAgents } from "@/lib/agents/index.js";
import { getDb } from "@/lib/db/client.js";
import { ChatRepo } from "@/lib/db/chat-repo.js";
import { getSessionManager } from "@/lib/chat/session-manager.js";
import { setDefaultLLMProvider } from "@/lib/llm/create-llm.js";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { code, sector, index, workflow = "bull-bear", provider = "deepseek", model } = body;

  if (!code && !sector && !index) {
    return NextResponse.json({ error: "Must specify code, sector, or index" }, { status: 400 });
  }

  const dag = WORKFLOWS[workflow];
  if (!dag) {
    return NextResponse.json({ error: `Unknown workflow: ${workflow}` }, { status: 400 });
  }

  const sessionId = randomUUID();
  const db = getDb();
  const repo = new ChatRepo(db);
  const mgr = getSessionManager(repo);

  if (provider) setDefaultLLMProvider(provider as any);

  const registry = new AgentRegistry();
  registerBuiltinAgents(registry);

  mgr.createSession(
    sessionId,
    { code, sector, index, workflow, provider, model },
    dag,
    registry,
    { provider: provider as any, modelName: model },
  );

  // Start director advancing immediately (fire-and-forget loop until PAUSED/STOPPED)
  mgr.startAutoAdvance(sessionId);

  const agents = registry.list().map((a) => ({
    id: a.id,
    name: a.name,
    capabilities: a.capabilities,
    layer: a.layer,
  }));

  return NextResponse.json({ sessionId, agents, workflow: dag.name });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || url.pathname.split("/").pop();
  if (!id) return NextResponse.json({ error: "Missing session id" }, { status: 400 });

  const mgr = getSessionManager();
  mgr.deleteSession(id);
  return NextResponse.json({ deleted: true });
}
