import { Annotation } from "@langchain/langgraph";

/**
 * LangGraph 工作流共享状态 Schema。
 *
 * 定义整个分析工作流（含辩论子图）的共享状态。每个字段都是一个 Annotation
 * channel，LangGraph 在节点间传递状态时会根据 reducer 策略合并增量更新。
 *
 * 关键设计：
 * - findings 使用 spread-merge reducer，确保并行 agent 节点独立写入而不互相覆盖
 *   （每个节点的 key 是唯一的 node_id）
 * - messages 使用 concat reducer，确保并行发言的辩论消息不会丢失
 * - 节点只需返回增量（delta），reducer 自动完成合并
 */
export const WorkflowState = Annotation.Root({
  /** 分析目标代码，如 "000001"（平安银行） */
  target: Annotation<string>,
  /** 当前任务描述，由 workflow 的初始状态设置 */
  task: Annotation<string>,
  /**
   * 所有节点的分析结果，以 node_id 为 key。
   * 使用对象展开合并（spread-merge）reducer：
   * - 每个节点只写入自己的 key，不会覆盖其他节点的结果
   * - 并行节点可以同时写入不同的 key，互不冲突
   * - 浅合并足够，因为 key 是唯一的 node_id
   */
  findings: Annotation<Record<string, unknown>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
  /**
   * 辩论对话记录。
   * 使用数组拼接（concat）reducer：
   * - 多方和空方交替发言，每次发言追加一条消息
   * - 如果用 spread-merge，并行写入会丢失消息
   * - concat 保证每条消息都被保留
   */
  messages: Annotation<{ role: string; content: string }[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  /** 当前辩论轮次，从 0 开始 */
  round: Annotation<number>,
  /** 辩论终止标志，由 check_yield 或 set_max_end 节点设置 */
  should_stop: Annotation<boolean>,
  /** 辩论终止原因："yield"（一方认输）/ "max_rounds"（达到最大轮次）/ ""（未终止） */
  stop_reason: Annotation<"yield" | "max_rounds" | "">,
  /** 辩论总轮次数（辩论结束时设置，由旁白节点读取） */
  total_rounds: Annotation<number>,
});
