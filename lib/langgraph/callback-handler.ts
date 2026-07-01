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

  /** runId → { toolName, ts } 映射。ts 在 handleToolStart 生成，handleToolEnd/handleToolError 复用，保证同一 tool call 的两次回调使用相同 key */
  private toolMetaByRunId = new Map<string, { toolName: string; ts: number }>();
  private _lastTs = 0;

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
    tool: { name?: string; id?: string[]; kwargs?: Record<string, unknown> },
    input: string,
    runId: string,
    _parentRunId?: string,
    _tags?: string[],
  ): Promise<void> {
    // LangChain 的 Serialized 类型将工具名放在 id 数组末位或 kwargs.name，
    // 而非顶层的 name 属性。优先级：kwargs.name > id[-1] > "unknown"
    const toolName =
      (tool.kwargs?.name as string) ??
      tool.id?.[tool.id.length - 1] ??
      tool.name ??
      "unknown";

    // 单调递增时间戳 — 同一个 tool call 的 onToolCall 和 onToolResult 共享同一个 ts，
    // 前端以 `${tool}-${ts}` 为 ToolCallCard key 并据此关联 result
    const now = Date.now();
    this._lastTs = now > this._lastTs ? now : this._lastTs + 1;
    const ts = this._lastTs;

    this.toolMetaByRunId.set(runId, { toolName, ts });

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
      ts,
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
    const meta = this.toolMetaByRunId.get(runId);
    this.toolMetaByRunId.delete(runId); // 清理映射，防止内存泄漏
    const toolName = meta?.toolName ?? "unknown";
    const ts = meta?.ts ?? Date.now();

    const result =
      typeof output === "string" ? output : JSON.stringify(output);

    await this.callbacks?.onToolResult?.(
      this.nodeId,
      this.agentName,
      toolName,
      result,
      ts,
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
    const meta = this.toolMetaByRunId.get(runId);
    this.toolMetaByRunId.delete(runId);
    const toolName = meta?.toolName ?? "unknown";
    const ts = meta?.ts ?? Date.now();

    await this.callbacks?.onToolResult?.(
      this.nodeId,
      this.agentName,
      toolName,
      `Error: ${err.message}`,
      ts,
    );
  }
}
