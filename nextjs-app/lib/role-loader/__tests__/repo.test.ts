import { describe, it, expect, beforeEach } from "vitest";
import { RoleRepo } from "../repo.js";
import { getDb } from "../../db/client.js";

describe("RoleRepo", () => {
  let repo: RoleRepo;
  const userId = "test-user-001";

  beforeEach(() => {
    repo = new RoleRepo(getDb());
    // Clean up
    repo.deleteAll(userId);
  });

  it("inserts and retrieves an agent role", () => {
    repo.insert({
      id: "my-agent",
      userId,
      type: "agent",
      name: "我的分析师",
      yamlContent: "id: my-agent\nname: 我的分析师\nsystem_prompt: 你好",
    });

    const roles = repo.listByUser(userId, "agent");
    expect(roles).toHaveLength(1);
    expect(roles[0].id).toBe("my-agent");
    expect(roles[0].type).toBe("agent");
  });

  it("inserts and retrieves a workflow role", () => {
    repo.insert({
      id: "my-wf",
      userId,
      type: "workflow",
      name: "我的工作流",
      yamlContent: "name: my-wf\nnodes: []",
    });

    const roles = repo.listByUser(userId, "workflow");
    expect(roles).toHaveLength(1);
  });

  it("rejects duplicate id+type for same user", () => {
    repo.insert({
      id: "dup", userId, type: "agent", name: "A", yamlContent: "x",
    });
    expect(() => repo.insert({
      id: "dup", userId, type: "agent", name: "B", yamlContent: "y",
    })).toThrow();
  });

  it("deletes a role", () => {
    repo.insert({
      id: "to-delete", userId, type: "agent", name: "X", yamlContent: "x",
    });
    repo.delete("to-delete", userId, "agent");
    const roles = repo.listByUser(userId, "agent");
    expect(roles).toHaveLength(0);
  });

  it("listByUser returns empty array for user with no roles", () => {
    const roles = repo.listByUser("nonexistent-user", "agent");
    expect(roles).toEqual([]);
  });
});
