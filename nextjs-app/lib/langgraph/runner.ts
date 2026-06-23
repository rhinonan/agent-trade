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

let _builtinAgentsLoaded = false;
let _builtinWorkflowsLoaded = false;

/**
 * Build a nodeId → agentName lookup map from the workflow YAML.
 *
 * Standard nodes: workflow node ID → node.agent
 * Debate nodes: internal subgraph node IDs (p1_speak, p2_speak) →
 *   corresponding participant agent; check_yield / increment_round → debate node ID
 */
function buildAgentNameMap(
  workflow: WorkflowYaml,
  loader: ReturnType<typeof getRoleLoader>,
): Map<string, string> {
  const map = new Map<string, string>();

  for (const node of workflow.nodes) {
    if (node.type === "debate") {
      // Debate subgraph internal nodes
      const participants = node.participants ?? [];
      const sorted = [...participants].sort(
        (a, b) => (b.first ? 1 : 0) - (a.first ? 1 : 0),
      );
      if (sorted.length >= 1) map.set("p1_speak", sorted[0].agent);
      if (sorted.length >= 2) map.set("p2_speak", sorted[1].agent);
      // check_yield and increment_round belong to the debate node
      map.set("check_yield", node.id);
      map.set("increment_round", node.id);
    } else {
      map.set(node.id, node.agent);
    }
  }

  return map;
}

/**
 * Ensure the singleton RoleLoader has built-in agents and workflows loaded.
 * Idempotent — skips scanning if already loaded in this process.
 * Also scans workflows from roles/workflows/.
 */
export async function ensureAgentsLoaded(): Promise<void> {
  const loader = getRoleLoader();
  if (!_builtinAgentsLoaded) {
    const agentsDir = path.join(resolveRolesDir(), "agents");
    await loader.scanAgents(agentsDir);
    _builtinAgentsLoaded = true;
  }
  if (!_builtinWorkflowsLoaded) {
    const workflowsDir = path.join(resolveRolesDir(), "workflows");
    if (fs.existsSync(workflowsDir)) {
      await loader.scanWorkflows(workflowsDir);
    }
    _builtinWorkflowsLoaded = true;
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

  // Build a nodeId → agentName lookup from the workflow YAML.
  // Standard nodes: node.id → node.agent
  // Debate nodes: internal subgraph node IDs → debate participant agents
  const agentNameMap = buildAgentNameMap(workflow, loader);

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
      const agentName = agentNameMap.get(nodeId) ?? nodeId;
      await callbacks.onNodeStart?.(nodeId, agentName);
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
