import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { load as parseYaml } from "js-yaml";
import { WorkflowYamlSchema } from "@/lib/role-loader/schema.js";

/**
 * Workflow 列表接口 — GET /api/workflows
 *
 * 扫描 roles/workflows/ 目录，解析并验证所有 YAML 文件，
 * 返回 workfow 的名称和描述列表。无效的 YAML 文件会被跳过。
 */

/** 解析 roles 目录的绝对路径 */
function resolveRolesDir(): string {
  return path.resolve(process.cwd(), "roles");
}

export async function GET() {
  const workflowsDir = path.join(resolveRolesDir(), "workflows");
  const list: { name: string; description: string }[] = [];

  if (fs.existsSync(workflowsDir)) {
    const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith(".yaml"));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(workflowsDir, file), "utf-8");
        const parsed = parseYaml(raw);
        const wf = WorkflowYamlSchema.parse(parsed);
        list.push({
          name: wf.name,
          description: wf.description ?? "",
        });
      } catch {
        // 跳过无效的 YAML 文件
      }
    }
  }

  return NextResponse.json(list);
}
