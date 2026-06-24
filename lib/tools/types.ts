import type { AnalysisTarget, ExecutionContext } from "../engine/types.js";
import type { AStockClient } from "../data-sdk/client.js";

export interface PropertySchema {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: PropertySchema;
  default?: unknown;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, PropertySchema>;
    required: string[];
  };
  execute(params: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

export interface ToolContext {
  dataClient: AStockClient;
  target: AnalysisTarget;
  executionState: ExecutionContext;
  signal: AbortSignal;
}
