import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { createTables } from "../client.js";
import { SessionRepo } from "../session-repo.js";

describe("SessionRepo", () => {
  let db: Database.Database;
  let repo: SessionRepo;

  beforeEach(() => {
    db = new Database(":memory:");
    createTables(db);
    repo = new SessionRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it("inserts and retrieves a session", () => {
    repo.insert({
      id: "s1", targetCode: "600519", targetName: "贵州茅台",
      targetType: "stock", workflowName: "牛熊对抗",
      status: "RUNNING", createdAt: 1000,
    });
    const session = repo.getById("s1");
    expect(session).not.toBeNull();
    expect(session!.targetCode).toBe("600519");
    expect(session!.status).toBe("RUNNING");
  });

  it("lists recent sessions ordered by created_at DESC", () => {
    repo.insert({ id: "s1", targetCode: "000001", targetName: null, targetType: "stock", workflowName: "layered", status: "STOPPED", createdAt: 1000 });
    repo.insert({ id: "s2", targetCode: "000002", targetName: null, targetType: "stock", workflowName: "bull-bear", status: "RUNNING", createdAt: 2000 });
    repo.insert({ id: "s3", targetCode: "000003", targetName: null, targetType: "stock", workflowName: "quick-scan", status: "STOPPED", createdAt: 3000 });

    const recent = repo.listRecent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].id).toBe("s3"); // most recent first
    expect(recent[1].id).toBe("s2");
  });

  it("updates session status", () => {
    repo.insert({ id: "s1", targetCode: "600519", targetName: null, targetType: "stock", workflowName: "layered", status: "RUNNING", createdAt: 1000 });
    repo.updateStatus("s1", "STOPPED");
    const session = repo.getById("s1");
    expect(session!.status).toBe("STOPPED");
  });

  it("deletes session by id", () => {
    repo.insert({ id: "s1", targetCode: "600519", targetName: null, targetType: "stock", workflowName: "layered", status: "RUNNING", createdAt: 1000 });
    repo.deleteById("s1");
    expect(repo.getById("s1")).toBeNull();
  });

  it("returns null for missing session", () => {
    expect(repo.getById("nonexistent")).toBeNull();
  });
});
