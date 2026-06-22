import { describe, it, expect } from "vitest";
import { WS_EVENTS } from "../events.js";

describe("WS_EVENTS", () => {
  it("defines server-emitted event names", () => {
    expect(WS_EVENTS.ANALYSIS_START).toBe("analysis:start");
    expect(WS_EVENTS.STEP_START).toBe("step:start");
    expect(WS_EVENTS.STEP_COMPLETE).toBe("step:complete");
    expect(WS_EVENTS.STEP_ERROR).toBe("step:error");
    expect(WS_EVENTS.ANALYSIS_COMPLETE).toBe("analysis:complete");
    expect(WS_EVENTS.ANALYSIS_ERROR).toBe("analysis:error");
  });

  it("defines client-emitted event names", () => {
    expect(WS_EVENTS.SUBSCRIBE).toBe("subscribe");
    expect(WS_EVENTS.UNSUBSCRIBE).toBe("unsubscribe");
  });

  it("has all expected event names as string constants", () => {
    const values = Object.values(WS_EVENTS);
    expect(values.length).toBe(9);
    expect(new Set(values).size).toBe(9); // all unique
    for (const v of values) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });
});

describe("setSocketIO / getSocketIO", () => {
  it("throws when getSocketIO is called before initialization", async () => {
    // We need a fresh module import to test the null state.
    // Dynamically import so the singleton is in its initial null state.
    const mod = await import("../server.js");
    expect(() => mod.getSocketIO()).toThrow("Socket.IO not initialized");
  });

  it("returns the io instance after setSocketIO is called", async () => {
    const mod = await import("../server.js");
    const fakeIo = { of: () => ({ on: () => {} }) } as any;
    mod.setSocketIO(fakeIo);
    expect(mod.getSocketIO()).toBe(fakeIo);
  });
});
