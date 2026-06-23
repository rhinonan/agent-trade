import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { AnalysisRepo } from "../analysis-repo.js";
import { createTables, getDb } from "../client.js";

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

  it("migrates analyses and sessions tables with user_id column", () => {
    const db2 = getDb(":memory:");
    // Verify user_id column exists on analyses
    const anaCols = db2.prepare("PRAGMA table_info(analyses)").all() as any[];
    const hasUserId = anaCols.some((c: any) => c.name === "user_id");
    expect(hasUserId).toBe(true);

    // Verify user_id column exists on sessions
    const sessCols = db2.prepare("PRAGMA table_info(sessions)").all() as any[];
    const sessHasUserId = sessCols.some((c: any) => c.name === "user_id");
    expect(sessHasUserId).toBe(true);

    // Verify default value works
    db2.prepare(
      `INSERT INTO analyses (id, target_code, target_name, target_type, workflow_name, status, context, created_at)
       VALUES ('test-mig', '000001', 'test', 'stock', 'bull-bear', 'running', '{}', 0)`
    ).run();
    const row = db2.prepare("SELECT user_id FROM analyses WHERE id = 'test-mig'").get() as any;
    expect(row.user_id).toBe("anonymous");
  });
});
