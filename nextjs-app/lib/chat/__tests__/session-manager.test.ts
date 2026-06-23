import { describe, it, expect, beforeEach } from "vitest";
import { SessionManager } from "../session-manager.js";
import { ChatRepo } from "../../db/chat-repo.js";
import { SessionRepo } from "../../db/session-repo.js";
import { AgentRegistry } from "../../engine/registry.js";
import type { WorkflowDAG } from "../../engine/types.js";
import Database from "better-sqlite3";
import { createTables } from "../../db/client.js";

const testDag: WorkflowDAG = {
  name: "test", version: "1",
  steps: [
    { id: "perception-1", type: "analyze", agent: { id: "market-data" }, prompt: "采集 {target} 行情" },
  ],
};

describe("SessionManager", () => {
  let db: Database.Database;
  let repo: ChatRepo;
  let registry: AgentRegistry;

  beforeEach(() => {
    db = new Database(":memory:");
    createTables(db);
    repo = new ChatRepo(db);
    registry = new AgentRegistry();
  });

  it("creates a session and starts in RUNNING", () => {
    const mgr = new SessionManager(repo);
    const session = mgr.createSession("s1", { code: "000001" }, testDag, registry, { provider: "deepseek" });
    expect(session.status).toBe("RUNNING");
  });

  it("persists session to database on createSession", () => {
    const sessionRepo = new SessionRepo(db);
    const mgr = new SessionManager(repo, sessionRepo);
    mgr.createSession("s1", { code: "000001" }, testDag, registry, { provider: "deepseek" });

    const persisted = sessionRepo.getById("s1");
    expect(persisted).not.toBeNull();
    expect(persisted!.targetCode).toBe("000001");
    expect(persisted!.status).toBe("RUNNING");
  });

  it("removes session from DB on deleteSession", () => {
    const sessionRepo = new SessionRepo(db);
    const mgr = new SessionManager(repo, sessionRepo);
    mgr.createSession("s1", { code: "000001" }, testDag, registry, { provider: "deepseek" });
    mgr.deleteSession("s1");
    expect(sessionRepo.getById("s1")).toBeNull();
  });

  it("returns undefined for non-existent session", () => {
    const mgr = new SessionManager(repo);
    expect(mgr.getSession("non-existent")).toBeUndefined();
  });

  it("startAutoAdvance is a no-op (Director removed)", () => {
    const mgr = new SessionManager(repo);
    // Should not throw — simply a no-op
    expect(() => mgr.startAutoAdvance("s1")).not.toThrow();
  });
});
