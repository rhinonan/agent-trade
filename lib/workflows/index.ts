import type { WorkflowDAG } from "../engine/types.js";

/**
 * Legacy DSL workflow registry.
 * @deprecated Workflows are now defined as YAML in roles/workflows/ and
 * executed via the LangGraph engine (lib/langgraph/).
 */
export const WORKFLOWS: Record<string, WorkflowDAG> = {};
