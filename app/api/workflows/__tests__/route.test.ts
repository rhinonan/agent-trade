import { describe, it, expect } from "vitest";
import { GET } from "../route.js";

describe("GET /api/workflows", () => {
  it("returns a list of workflows with name and description", async () => {
    const response = await GET();
    const data = await response.json();

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);

    for (const wf of data) {
      expect(wf).toHaveProperty("name");
      expect(wf).toHaveProperty("description");
      expect(typeof wf.name).toBe("string");
    }

    const names = data.map((w: { name: string }) => w.name);
    expect(names).toContain("bull-bear");
    expect(names).toContain("quick-scan");
  });
});
