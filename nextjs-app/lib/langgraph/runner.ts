import * as fs from "node:fs";
import * as path from "node:path";
import { load as parseYaml } from "js-yaml";
import type { WorkflowYaml } from "../role-loader/schema.js";
import { WorkflowYamlSchema } from "../role-loader/schema.js";
import { getRoleLoader } from "../role-loader/loader.js";
import { compileWorkflow } from "./compiler.js";
import { createLLM, type AnalyzeOptions } from "../llm/create-llm.js";

// ——— Public interfaces ———

export interface WorkflowRunResult {
  findings: Record<string, unknown>;
  messages: { role: string; content: string }[];
  stop_reason: string;
}

export interface WorkflowRunCallbacks {
  onNodeStart?(nodeId: string, agentName: string): Promise<void>;
  onNodeEnd?(nodeId: string, result: unknown): Promise<void>;
  onStreamChunk?(chunk: string): Promise<void>;
}

// ——— YAML loading ———

/**
 * Resolve the roles directory relative to the Next.js app cwd.
 * Roles live at <repo-root>/roles/; nextjs-app is one level down.
 */
function resolveRolesDir(): string {
  return path.resolve(process.cwd(), "..", "roles");
}

/**
 * Load a workflow YAML from roles/workflows/<name>.yaml.
 * Validates against WorkflowYamlSchema before returning.
 */
export async function loadWorkflowYaml(name: string): Promise<WorkflowYaml> {
  const filePath = path.join(resolveRolesDir(), "workflows", `${name}.yaml`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Workflow YAML not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = parseYaml(raw);
  return WorkflowYamlSchema.parse(parsed);
}

/**
 * Ensure the singleton RoleLoader has agents loaded from roles/agents/.
 * Idempotent — skips scanning if agents are already loaded.
 */
export async function ensureAgentsLoaded(): Promise<void> {
  const loader = getRoleLoader();
  if (loader.listAgents().length === 0) {
    const agentsDir = path.join(resolveRolesDir(), "agents");
    await loader.scanAgents(agentsDir);
  }
}

// ——— Core runner ———

/**
 * Run a WorkflowYaml against a target string.
 *
 * 1. Ensures agents are loaded into the RoleLoader singleton
 * 2. Compiles the workflow into a LangGraph StateGraph
 * 3. Streams through nodes, calling lifecycle callbacks
 * 4. Returns the final accumulated state as WorkflowRunResult
 */
export async function runWorkflow(
  workflow: WorkflowYaml,
  target: string,
  options: AnalyzeOptions = {},
  callbacks: WorkflowRunCallbacks = {},
): Promise<WorkflowRunResult> {
  await ensureAgentsLoaded();
  const loader = getRoleLoader();
  const llmFactory = () => createLLM(options);
  const compiled = compileWorkflow(workflow, loader, llmFactory);

  const initialState = {
    target,
    task: `分析 ${target}`,
    findings: {} as Record<string, unknown>,
    messages: [] as { role: string; content: string }[],
    round: 0,
    should_stop: false,
    stop_reason: "" as const,
  };

  let finalState = initialState;

  const app = compiled.graph.compile();
  for await (const event of await app.stream(initialState, {
    streamMode: "updates",
  })) {
    for (const [nodeId, update] of Object.entries(event)) {
      await callbacks.onNodeStart?.(nodeId, nodeId);
      // Merge the partial state update into the accumulated state
      finalState = { ...finalState, ...(update as typeof initialState) };
      await callbacks.onNodeEnd?.(nodeId, update);
    }
  }

  return {
    findings: finalState.findings,
    messages: finalState.messages,
    stop_reason: finalState.stop_reason,
  };
}
