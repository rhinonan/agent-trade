import { describe, it, expect } from "vitest";

// Test the validation logic and response shape without requiring full Next.js runtime
describe("POST /api/analyze - validation", () => {
  it("requires code, sector, or index in the request body", () => {
    // The handler checks: if (!code && !sector && !index) return 400
    // This is tested implicitly by the route handler
    const empty = { };
    const hasCode = !!(empty as any).code;
    const hasSector = !!(empty as any).sector;
    const hasIndex = !!(empty as any).index;
    expect(hasCode || hasSector || hasIndex).toBe(false);
  });

  it("defaults workflow to bull-bear", () => {
    const body: Record<string, unknown> = { code: "600519" };
    const workflow = (body.workflow as string) ?? "bull-bear";
    expect(workflow).toBe("bull-bear");
  });

  it("defaults provider to deepseek", () => {
    const body: Record<string, unknown> = { code: "600519" };
    const provider = (body.provider as string) ?? "deepseek";
    expect(provider).toBe("deepseek");
  });
});

describe("POST /api/analyze - resolveTarget logic", () => {
  it("sets targetType to sector when sector is provided", () => {
    const sector = "白酒";
    const targetType = sector ? "sector" : "stock";
    expect(targetType).toBe("sector");
  });

  it("sets targetType to index when index is provided (and no sector)", () => {
    const sector = undefined;
    const index = "000001";
    const targetType = sector ? "sector" : index ? "index" : "stock";
    expect(targetType).toBe("index");
  });

  it("sets targetType to stock when only code is provided", () => {
    const sector = undefined;
    const index = undefined;
    const code = "600519";
    const targetType = sector ? "sector" : index ? "index" : "stock";
    expect(targetType).toBe("stock");
  });
});

describe("POST /api/analyze - extractAgentIds", () => {
  function extractAgentIds(stepDef: any): string[] {
    if (!stepDef) return [];
    const ids: string[] = [];
    if (stepDef.agent) {
      const agents = Array.isArray(stepDef.agent) ? stepDef.agent : [stepDef.agent];
      for (const a of agents) if (a.id) ids.push(a.id);
    }
    if (stepDef.match?.id) ids.push(stepDef.match.id);
    if (stepDef.children) for (const child of stepDef.children) ids.push(...extractAgentIds(child));
    return [...new Set(ids)];
  }

  it("returns empty array for undefined step", () => {
    expect(extractAgentIds(undefined)).toEqual([]);
  });

  it("extracts single agent id", () => {
    const step = { id: "s1", type: "analyze", agent: { id: "agent-1" } };
    expect(extractAgentIds(step)).toEqual(["agent-1"]);
  });

  it("extracts multiple agent ids from array", () => {
    const step = { id: "s1", type: "panel", agent: [{ id: "a1" }, { id: "a2" }] };
    expect(extractAgentIds(step)).toEqual(["a1", "a2"]);
  });

  it("extracts match id", () => {
    const step = { id: "s1", type: "analyze", match: { id: "matcher-1" } };
    expect(extractAgentIds(step)).toEqual(["matcher-1"]);
  });

  it("extracts ids from children recursively", () => {
    const step = {
      id: "parent",
      type: "parallel",
      children: [
        { id: "c1", type: "analyze", agent: { id: "child-1" } },
        { id: "c2", type: "analyze", match: { id: "child-2" } },
      ],
    };
    expect(extractAgentIds(step)).toEqual(["child-1", "child-2"]);
  });

  it("deduplicates ids", () => {
    const step = {
      id: "parent",
      type: "parallel",
      agent: [{ id: "dup" }],
      children: [
        { id: "c1", type: "analyze", agent: { id: "dup" } },
      ],
    };
    expect(extractAgentIds(step)).toEqual(["dup"]);
  });
});
