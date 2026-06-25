import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { AgentNodeCallbacks } from "./compiler.js";

/**
 * LangChain callback handler that emits real-time agent events during
 * tool-calling agent execution (not after).  Tracks tool-name ↔ runId
 * mappings so handleToolEnd / handleToolError can report which tool
 * produced the result.
 */
export class AgentStreamCallbackHandler extends BaseCallbackHandler {
  name = "agent_stream_callback";
  lc_serializable = false;

  private toolNameByRunId = new Map<string, string>();

  constructor(
    private nodeId: string,
    private agentName: string,
    private callbacks?: AgentNodeCallbacks,
  ) {
    super();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async handleToolStart(
    tool: { name?: string },
    input: string,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
  ): Promise<void> {
    const toolName = tool.name ?? "unknown";
    this.toolNameByRunId.set(runId, toolName);

    let args: Record<string, unknown>;
    try {
      args = JSON.parse(input);
    } catch {
      args = { input };
    }

    await this.callbacks?.onToolCall?.(
      this.nodeId,
      this.agentName,
      toolName,
      args,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async handleToolEnd(
    output: string,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
  ): Promise<void> {
    const toolName = this.toolNameByRunId.get(runId) ?? "unknown";
    this.toolNameByRunId.delete(runId);

    const result =
      typeof output === "string" ? output : JSON.stringify(output);

    await this.callbacks?.onToolResult?.(
      this.nodeId,
      this.agentName,
      toolName,
      result,
    );
  }

  async handleToolError(
    err: Error,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
  ): Promise<void> {
    const toolName = this.toolNameByRunId.get(runId) ?? "unknown";
    this.toolNameByRunId.delete(runId);

    await this.callbacks?.onToolResult?.(
      this.nodeId,
      this.agentName,
      toolName,
      `Error: ${err.message}`,
    );
  }
}
