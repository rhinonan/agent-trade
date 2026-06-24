import { describe, it, expect, beforeEach } from "vitest";
import { RoleLoader } from "../loader.js";
import * as yaml from "js-yaml";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

function writeTempYaml(dir: string, filename: string, content: unknown): string {
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, yaml.dump(content), "utf-8");
  return filepath;
}

describe("RoleLoader", () => {
  let loader: RoleLoader;
  let tmpDir: string;

  beforeEach(() => {
    loader = new RoleLoader();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "roles-test-"));
  });

  it("loads a minimal agent YAML from filesystem", async () => {
    writeTempYaml(tmpDir, "minimal.yaml", {
      id: "minimal",
      name: "最小分析师",
      system_prompt: "分析 {{target}}",
    });

    await loader.scanAgents(tmpDir);
    const agent = loader.getAgent("minimal");

    expect(agent).toBeDefined();
    expect(agent!.id).toBe("minimal");
    expect(agent!.name).toBe("最小分析师");
    expect(agent!.tools).toEqual([]);
    expect(agent!.maxToolSteps).toBe(5); // default
  });

  it("loads an agent with tools and custom model config", async () => {
    writeTempYaml(tmpDir, "full.yaml", {
      id: "full-agent",
      name: "完整分析师",
      system_prompt: "分析 {{target}} 使用工具获取数据",
      tools: ["kline", "macd"],
      output_schema: {
        conclusion: { type: "string", description: "结论" },
        confidence: { type: "number", min: 0, max: 1 },
      },
      model: { provider: "deepseek", model: "deepseek-chat", temperature: 0.3 },
      max_tool_steps: 8,
    });

    await loader.scanAgents(tmpDir);
    const agent = loader.getAgent("full-agent");

    expect(agent).toBeDefined();
    expect(agent!.tools.length).toBe(2);
    expect(agent!.modelConfig?.provider).toBe("deepseek");
    expect(agent!.maxToolSteps).toBe(8);
    expect(agent!.outputParser).toBeDefined();
  });

  it("throws on invalid YAML", async () => {
    const filepath = path.join(tmpDir, "bad.yaml");
    fs.writeFileSync(filepath, "id: [invalid yaml: :", "utf-8");

    await expect(loader.scanAgents(tmpDir)).rejects.toThrow();
  });

  it("skips invalid agent and continues loading valid ones", async () => {
    writeTempYaml(tmpDir, "valid.yaml", {
      id: "valid", name: "Valid", system_prompt: "ok",
    });
    // Write a YAML that parses but fails validation (missing id)
    writeTempYaml(tmpDir, "invalid.yaml", {
      name: "No ID", system_prompt: "bad",
    });

    await loader.scanAgents(tmpDir);
    expect(loader.getAgent("valid")).toBeDefined();
    // The invalid one should log a warning but not crash
  });

  it("listAgents returns all loaded agents", async () => {
    writeTempYaml(tmpDir, "a.yaml", { id: "a", name: "A", system_prompt: "ok" });
    writeTempYaml(tmpDir, "b.yaml", { id: "b", name: "B", system_prompt: "ok" });

    await loader.scanAgents(tmpDir);
    const agents = loader.listAgents();
    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.id).sort()).toEqual(["a", "b"]);
  });
});

describe("interpolateTemplate", () => {
  // Import the helper — we'll test via the module
  it("is tested via compilation", () => {
    // Covered by workflow compilation tests
  });
});
