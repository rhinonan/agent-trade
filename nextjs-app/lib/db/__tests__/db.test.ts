import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { AnalysisRepo } from "../analysis-repo.js";
import { createTables } from "../client.js";

describe("AnalysisRepo", () => {
  let db: Database.Database;
  let repo: AnalysisRepo;

  beforeEach(() => {
    db = new Database(":memory:");
    createTables(db);
    repo = new AnalysisRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates and retrieves an analysis", () => {
    const record = repo.create({
      id: "test-1",
      targetCode: "600519",
      targetName: "贵州茅台",
      targetType: "stock",
      workflowName: "bull-bear",
      status: "running",
      context: JSON.stringify({ target: { code: "600519" }, findings: [] }),
      createdAt: Date.now(),
    });

    expect(record.id).toBe("test-1");

    const found = repo.getById("test-1");
    expect(found?.targetCode).toBe("600519");
    expect(found?.workflowName).toBe("bull-bear");
  });

  it("updates status and context", () => {
    repo.create({
      id: "update-test",
      targetCode: "000001",
      targetName: null,
      targetType: "stock",
      workflowName: "quick-scan",
      status: "running",
      context: "{}",
      createdAt: Date.now(),
    });

    repo.update("update-test", {
      status: "complete",
      context: JSON.stringify({ target: { code: "000001" }, findings: [{ step: "s1", agent: "a1", analysis: {} }] }),
    });

    const updated = repo.getById("update-test");
    expect(updated?.status).toBe("complete");
  });

  it("lists recent analyses", () => {
    repo.create({ id: "a1", targetCode: "x", targetName: null, targetType: "stock", workflowName: "wf", status: "complete", context: "{}", createdAt: 1000 });
    repo.create({ id: "a2", targetCode: "y", targetName: null, targetType: "stock", workflowName: "wf", status: "complete", context: "{}", createdAt: 2000 });
    const recent = repo.listRecent(10);
    expect(recent).toHaveLength(2);
  });
});
