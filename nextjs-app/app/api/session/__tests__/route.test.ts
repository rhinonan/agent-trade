import { describe, it, expect, afterEach } from "vitest";
import { resetSessionManager } from "@/lib/chat/session-manager.js";
import { POST, DELETE } from "../route.js";

describe("POST /api/session", () => {
  afterEach(() => {
    resetSessionManager();
  });

  it("returns 400 when no code/sector/index provided", async () => {
    const req = new Request("http://localhost:3000/api/session", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns sessionId for valid code", async () => {
    const req = new Request("http://localhost:3000/api/session", {
      method: "POST",
      body: JSON.stringify({ code: "000001" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBeDefined();
    expect(body.agents).toBeInstanceOf(Array);
    expect(body.agents.length).toBeGreaterThan(0);
  });
});

describe("DELETE /api/session", () => {
  afterEach(() => {
    resetSessionManager();
  });

  it("returns 400 when no id provided", async () => {
    // Use a trailing slash so pathname.split("/").pop() yields "" (falsy)
    const req = new Request("http://localhost:3000/api/session/", {
      method: "DELETE",
    });
    const res = await DELETE(req as any);
    expect(res.status).toBe(400);
  });
});
