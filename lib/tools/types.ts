import type { AnalysisTarget, ExecutionContext } from "../engine/types.js";
import type { DataClient } from "../data/client.js";

// ——— JSON Schema subset for tool parameters ———

export interface PropertySchema {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: PropertySchema;
  default?: unknown;
}

// ——— Tool Definition ———

export interface ToolDefinition {
  /** Unique tool identifier, used in function calling (e.g. "get-kline") */
  name: string;
  /** Natural-language description the LLM uses to decide when to call this tool */
  description: string;
  /** JSON Schema for the tool's parameters (OpenAI function-calling format) */
  parameters: {
    type: "object";
    properties: Record<string, PropertySchema>;
    required: string[];
  };
  /**
   * Execute the tool.
   * @returns JSON-serializable result string (data, or error object)
   */
  execute(params: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

// ——— Tool Context (injected at execution time) ———

export interface ToolContext {
  dataClient: DataClient;
  target: AnalysisTarget;
  /** Read-only snapshot of current workflow state */
  executionState: ExecutionContext;
  signal: AbortSignal;
}
