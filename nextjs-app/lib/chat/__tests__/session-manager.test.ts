import { describe, it, expect, beforeEach, vi } from "vitest";
import { SessionManager } from "../session-manager.js";
import { ChatRepo } from "../../db/chat-repo.js";
import { AgentRegistry } from "../../engine/registry.js";
import { registerBuiltinAgents } from "../../agents/index.js";
import type { WorkflowDAG } from "../../engine/types.js";
import Database from "better-sqlite3";
import { createTables } from "../../db/client.js";

const testDag: WorkflowDAG = {
  name: "test", version: "1",
  steps: [
    { id: "perception-1", type: "analyze", agent: { id: "market-data" }, prompt: "采集 {target} 行情" },
  ],
};

function mockLLM() {
  return {
    invoke: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        conclusion: "测试结论",
        confidence: 0.8,
        sentiment: "bullish",
        reasoning: ["理由1", "理由2", "理由3"],
      }),
    }),
  } as any;
}

describe("SessionManager", () => {
  let db: Database.Database;
  let repo: ChatRepo;
  let registry: AgentRegistry;

  beforeEach(() => {
    db = new Database(":memory:");
    createTables(db);
    repo = new ChatRepo(db);
    registry = new AgentRegistry();
    registerBuiltinAgents(registry);
  });

  it("creates a session and starts in RUNNING", () => {
    const mgr = new SessionManager(repo);
    const session = mgr.createSession("s1", { code: "000001" }, testDag, registry, { provider: "deepseek" });
    expect(session.status).toBe("RUNNING");
  });

  it("handleUserMessage without @mentions returns user message only", async () => {
    const mgr = new SessionManager(repo);
    mgr.createSession("s1", { code: "000001" }, testDag, registry, { provider: "deepseek" });
    const msgs = await mgr.handleUserMessage("s1", "hello");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
  });

  it("resumeSession changes PAUSED to RUNNING and advances director", async () => {
    const mgr = new SessionManager(repo);
    mgr.createSession("s1", { code: "000001" }, testDag, registry, { provider: "deepseek", llm: mockLLM() });
    // Send message with @mention to trigger pause and agent response
    await mgr.handleUserMessage("s1", "@market-data what?");
    const session = mgr.getSession("s1");
    expect(session?.status).toBe("PAUSED");
    // Resume
    const msgs = await mgr.resumeSession("s1");
    expect(mgr.getSession("s1")?.status).toBe("RUNNING");
  });
});
