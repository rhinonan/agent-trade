import { Annotation } from "@langchain/langgraph";

export const WorkflowState = Annotation.Root({
  /** Analysis target code (e.g. "000001") */
  target: Annotation<string>,
  /** Current task description */
  task: Annotation<string>,
  /** All node outputs — keyed by node_id */
  findings: Annotation<Record<string, unknown>>,
  /** Debate conversation messages */
  messages: Annotation<{ role: string; content: string }[]>,
  /** Current debate round */
  round: Annotation<number>,
  /** Debate stop flag */
  should_stop: Annotation<boolean>,
  /** Reason debate stopped */
  stop_reason: Annotation<"yield" | "max_rounds" | "">,
});
