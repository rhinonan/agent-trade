import { klineTool as _kline } from "./kline.js";
import { macdTool as _macd, rsiTool as _rsi, maTool as _ma } from "./indicator.js";
import type { ToolDefinition } from "./types.js";

export { klineTool } from "./kline.js";
export { macdTool, rsiTool, maTool } from "./indicator.js";
export type { ToolDefinition, ToolContext, PropertySchema } from "./types.js";

/** Lookup map: short YAML name → ToolDefinition. Keys match the strings used in agent YAML `tools: [...]`. */
export const toolsByName = new Map<string, ToolDefinition>([
  ["kline", _kline],
  ["macd", _macd],
  ["rsi", _rsi],
  ["ma", _ma],
]);
