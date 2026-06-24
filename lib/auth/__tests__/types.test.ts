import { describe, it, expect } from "vitest";
import {
  NoopAuthAdapter,
  getAuthAdapter,
  setAuthAdapter,
} from "../types.js";
import type { AuthAdapter } from "../types.js";

describe("NoopAuthAdapter", () => {
  const adapter = new NoopAuthAdapter();

  it("returns anonymous user from getSession", async () => {
    const req = new Request("http://localhost:3000/api/analyze");
    const session = await adapter.getSession(req);
    expect(session).not.toBeNull();
    expect(session!.user.id).toBe("anonymous");
    expect(session!.user.name).toBe("匿名用户");
    expect(session!.user.role).toBe("anonymous");
  });

  it("grants all permissions", () => {
    expect(
      adapter.hasPermission(
        { id: "test", name: "test", role: "user" },
        "admin:access",
      ),
    ).toBe(true);
  });

  it("returns unlimited quota", async () => {
    const limit = await adapter.getQuotaLimit({
      id: "test",
      name: "test",
      role: "user",
    });
    expect(limit).toBe(-1);
  });

  it("returns zero used quota", async () => {
    const used = await adapter.getQuotaUsed({
      id: "test",
      name: "test",
      role: "user",
    });
    expect(used).toBe(0);
  });
});

describe("getAuthAdapter / setAuthAdapter", () => {
  it("returns NoopAuthAdapter by default", () => {
    setAuthAdapter(new NoopAuthAdapter());
    const adapter = getAuthAdapter();
    expect(adapter).toBeInstanceOf(NoopAuthAdapter);
  });

  it("allows replacing the adapter", () => {
    const mock: AuthAdapter = {
      getSession: async () => null,
      hasPermission: () => false,
      getQuotaLimit: async () => 5,
      getQuotaUsed: async () => 3,
    };
    setAuthAdapter(mock);
    expect(getAuthAdapter()).toBe(mock);
    setAuthAdapter(new NoopAuthAdapter());
  });
});
