// nextjs-app/app/api/roles/__tests__/route.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET, POST } from "../route.js";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db/client.js";
import { RoleRepo } from "@/lib/role-loader/repo.js";

/** Build a mock FormData-like object that the POST handler's formData.get() & file.text() understand */
function mockFormData(entries: Record<string, string | { name: string; content: string; type: string } | undefined>) {
  const data = new Map<string, any>();
  for (const [key, val] of Object.entries(entries)) {
    if (val === undefined) continue;
    if (typeof val === "string") {
      data.set(key, val);
    } else {
      data.set(key, {
        name: val.name,
        type: val.type,
        size: val.content.length,
        text: async () => val.content,
      });
    }
  }
  return {
    get: (key: string) => data.get(key) ?? null,
  } as unknown as FormData;
}

function buildRequest(path: string, method: string, headers?: Record<string, string>): NextRequest {
  const url = new URL(path, "http://localhost");
  return new NextRequest(url, {
    method,
    headers: { ...headers },
  });
}

describe("GET /api/roles", () => {
  const userId = "test-roles-api";

  beforeEach(() => {
    const repo = new RoleRepo(getDb());
    repo.deleteAll(userId);
  });

  it("returns empty list for user with no roles", async () => {
    const req = buildRequest("/api/roles", "GET", {
      "x-user-id": userId,
    });
    const res = await GET(req);
    const data = await res.json();
    expect(data.roles).toEqual([]);
  });

  it("returns roles after insertion", async () => {
    const repo = new RoleRepo(getDb());
    repo.insert({
      id: "test-agent",
      userId,
      type: "agent",
      name: "Test",
      yamlContent: "id: test-agent\nname: Test\nsystem_prompt: hi",
    });

    const req = buildRequest("/api/roles?type=agent", "GET", {
      "x-user-id": userId,
    });
    const res = await GET(req);
    const data = await res.json();
    expect(data.roles).toHaveLength(1);
    expect(data.roles[0].id).toBe("test-agent");
  });
});

describe("POST /api/roles", () => {
  const userId = "test-roles-post";

  beforeEach(() => {
    new RoleRepo(getDb()).deleteAll(userId);
  });

  it("rejects missing file", async () => {
    const req = buildRequest("/api/roles", "POST", {
      "x-user-id": userId,
    });
    vi.spyOn(req, "formData").mockResolvedValue(
      mockFormData({ type: "agent", file: undefined }),
    );
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects invalid YAML", async () => {
    const req = buildRequest("/api/roles", "POST", {
      "x-user-id": userId,
    });
    vi.spyOn(req, "formData").mockResolvedValue(
      mockFormData({
        type: "agent",
        file: { name: "bad.yaml", content: "not: valid: yaml: [", type: "text/yaml" },
      }),
    );
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("accepts valid agent YAML", async () => {
    const yaml = "id: my-test-agent\nname: 测试\nsystem_prompt: 你好 {{target}}";
    const req = buildRequest("/api/roles", "POST", {
      "x-user-id": userId,
    });
    vi.spyOn(req, "formData").mockResolvedValue(
      mockFormData({
        type: "agent",
        file: { name: "test.yaml", content: yaml, type: "text/yaml" },
      }),
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("my-test-agent");
  });
});
