import { Annotation } from "@langchain/langgraph";

export const WorkflowState = Annotation.Root({
  /** Analysis target code (e.g. "000001") */
  target: Annotation<string>,
  /** Current task description */
  task: Annotation<string>,
  /** All node outputs — keyed by node_id (merge reducer for parallel nodes) */
  findings: Annotation<Record<string, unknown>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
  /** Debate conversation messages (concat reducer for safety with parallel writes) */
  messages: Annotation<{ role: string; content: string }[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
  /** Current debate round */
  round: Annotation<number>,
  /** Debate stop flag */
  should_stop: Annotation<boolean>,
  /** Reason debate stopped */
  stop_reason: Annotation<"yield" | "max_rounds" | "">,
  /** Total debate rounds completed (set at debate end, read by narrator) */
  total_rounds: Annotation<number>,
});
