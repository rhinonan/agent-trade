import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { AgentNodeCallbacks } from "./compiler.js";

/**
 * LangChain 回调桥接层 — 在 Agent 执行期间（而非完成后）实时推送工具调用事件。
 *
 * 核心机制：
 * - 通过 runId → toolName 映射关联工具调用的开始和结束
 * - handleToolStart 记录工具名，handleToolEnd/handleToolError 通过 runId 查找对应工具名
 * - 所有事件通过 AgentNodeCallbacks 接口转发，最终经 WebSocket 推送到前端
 *
 * 为什么选用 BaseCallbackHandler 而非 streaming？
 * - LangChain 的 AgentExecutor.stream() 只在每步完成后产生事件
 * - BaseCallbackHandler 可以拦截工具调用期间（in-flight）的事件
 * - 前端需要实时看到"正在调用什么工具"和"工具返回了什么"
 */
export class AgentStreamCallbackHandler extends BaseCallbackHandler {
  name = "agent_stream_callback";
  lc_serializable = false;

  /** runId → toolName 映射，用于 handleToolEnd/handleToolError 时回查工具名 */
  private toolNameByRunId = new Map<string, string>();

  constructor(
    private nodeId: string,
    private agentName: string,
    private callbacks?: AgentNodeCallbacks,
  ) {
    super();
  }

  /**
   * 工具调用开始时触发。
   * 解析工具参数（JSON → 对象），记录 runId→toolName 映射，
   * 然后发出 onToolCall 回调。
   */
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

    // 尝试将参数解析为 JSON，失败则以原始字符串包装
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

  /**
   * 工具调用完成时触发。
   * 从 runId 映射中查找工具名，清理映射（防止内存泄漏），
   * 然后发出 onToolResult 回调。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async handleToolEnd(
    output: string,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
  ): Promise<void> {
    const toolName = this.toolNameByRunId.get(runId) ?? "unknown";
    this.toolNameByRunId.delete(runId); // 清理映射，防止内存泄漏

    const result =
      typeof output === "string" ? output : JSON.stringify(output);

    await this.callbacks?.onToolResult?.(
      this.nodeId,
      this.agentName,
      toolName,
      result,
    );
  }

  /**
   * 工具调用出错时触发。
   * 错误通过同一个 onToolResult 通道上报，结果以 "Error: " 为前缀，
   * 前端据此区分正常结果和错误。
   */
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
