// nextjs-app/app/api/roles/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/client.js";
import { RoleRepo } from "@/lib/role-loader/repo.js";
import { getRoleLoader } from "@/lib/role-loader/loader.js";
import { AgentYamlSchema, WorkflowYamlSchema } from "@/lib/role-loader/schema.js";
import { load as parseYaml } from "js-yaml";

// GET /api/roles — list user's roles
export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const type = req.nextUrl.searchParams.get("type") as "agent" | "workflow" | null;

  const repo = new RoleRepo(getDb());
  const roles = repo.listByUser(userId, type ?? undefined);

  return NextResponse.json({ roles });
}

// POST /api/roles — upload a YAML role
export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const formData = await req.formData();
  const file = formData.get("file");
  const type = formData.get("type") as string;

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (type !== "agent" && type !== "workflow") {
    return NextResponse.json({ error: "type must be 'agent' or 'workflow'" }, { status: 400 });
  }

  const raw = await file.text();

  // Parse and validate
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch {
    return NextResponse.json({ error: "Invalid YAML syntax" }, { status: 422 });
  }

  try {
    if (type === "agent") {
      AgentYamlSchema.parse(parsed);
    } else {
      WorkflowYamlSchema.parse(parsed);
    }
  } catch (err: any) {
    return NextResponse.json({
      error: "YAML schema validation failed",
      details: err.errors ?? [err.message],
    }, { status: 422 });
  }

  const id = type === "agent"
    ? (parsed as any).id
    : (parsed as any).name;

  const name = type === "agent"
    ? (parsed as any).name
    : (parsed as any).description ?? (parsed as any).name;

  // Check conflict with built-in roles
  const loader = getRoleLoader();
  if (loader.hasAgent(id)) {
    return NextResponse.json(
      { error: `Role "${id}" conflicts with a built-in role` },
      { status: 409 },
    );
  }

  // Save to DB
  const repo = new RoleRepo(getDb());
  try {
    repo.insert({ id, userId, type, name, yamlContent: raw });
  } catch (err: any) {
    if (err.message.includes("already exists")) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  // Load into runtime
  if (type === "agent") {
    await loader.loadAgentYaml(raw, `db:${userId}/${id}`);
  }

  return NextResponse.json({ id, type, name }, { status: 200 });
}
