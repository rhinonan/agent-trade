import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useAnalysisStore } from "@/stores/analysis";

describe("analysis store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("defaults targetType to stock", () => {
    const store = useAnalysisStore();
    expect(store.targetType).toBe("stock");
  });

  it("setTargetType switches mode", () => {
    const store = useAnalysisStore();
    store.setTargetType("sector");
    expect(store.targetType).toBe("sector");
  });

  it("reset keeps targetType unchanged (user preference)", () => {
    const store = useAnalysisStore();
    store.setTargetType("sector");
    store.reset();
    expect(store.targetType).toBe("sector");
  });
});
