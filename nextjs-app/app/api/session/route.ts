import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { AgentRegistry } from "@/lib/engine/registry.js";
import { getDb } from "@/lib/db/client.js";
import { ChatRepo } from "@/lib/db/chat-repo.js";
import { SessionRepo } from "@/lib/db/session-repo.js";
import { getSessionManager } from "@/lib/chat/session-manager.js";
import { setDefaultLLMProvider } from "@/lib/llm/create-llm.js";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { code, sector, index, workflow = "bull-bear", provider = "deepseek", model } = body;

  if (!code && !sector && !index) {
    return NextResponse.json({ error: "Must specify code, sector, or index" }, { status: 400 });
  }

  const sessionId = randomUUID();
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const db = getDb();
  const repo = new ChatRepo(db);
  const sessionRepo = new SessionRepo(db);
  const mgr = getSessionManager(repo, sessionRepo);

  if (provider) setDefaultLLMProvider(provider as any);

  const registry = new AgentRegistry();

  mgr.createSession(
    sessionId,
    { code, sector, index, workflow, provider, model, userId },
    { name: workflow, version: "1", steps: [] },
    registry,
    { provider: provider as any, modelName: model },
  );

  // Session auto-advance is handled by the LangGraph analyze API.
  // The deprecated Director-based advance is no-oped.

  const agents = registry.list().map((a) => ({
    id: a.id,
    name: a.name,
    capabilities: a.capabilities,
    layer: a.layer,
  }));

  return NextResponse.json({ sessionId, agents, workflow });
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || url.pathname.split("/").pop();
  if (!id) return NextResponse.json({ error: "Missing session id" }, { status: 400 });

  const userId = req.headers.get("x-user-id") ?? "anonymous";

  const db = getDb();
  const sessionRepo = new SessionRepo(db);
  const deleted = sessionRepo.deleteById(id, userId !== "anonymous" ? userId : undefined);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const mgr = getSessionManager(undefined, sessionRepo);
  mgr.deleteSession(id);
  return NextResponse.json({ deleted: true });
}
