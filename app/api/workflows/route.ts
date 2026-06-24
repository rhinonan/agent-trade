import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { load as parseYaml } from "js-yaml";
import { WorkflowYamlSchema } from "@/lib/role-loader/schema.js";

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
        // Skip invalid YAML files
      }
    }
  }

  return NextResponse.json(list);
}
