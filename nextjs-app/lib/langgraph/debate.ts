import { StateGraph, END } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import type { RoleLoader, CompiledAgent } from "../role-loader/loader.js";
import { WorkflowState } from "./state.js";
import { buildCheckYieldNode } from "./nodes.js";
import { interpolateTemplate } from "../role-loader/loader.js";
import type { Runnable } from "@langchain/core/runnables";

type LLMFactory = () => Runnable;
type State = typeof WorkflowState.State;

interface DebateConfig {
  id: string;
  participants: { agent: string; role: string; first?: boolean }[];
  max_rounds: number;
  stop_when: { field: string; condition: "any" | "all" };
  prompt_template: string;
}

/**
 * Build a debate subgraph:
 *
 *   P1_SPEAK → P2_SPEAK → CHECK_YIELD → (conditional)
 *     → if stop: END
 *     → if continue: INCREMENT_ROUND → P1_SPEAK
 *
 * Participants are ordered by first=true (the first speaker goes first).
 * Each speaker node invokes the LLM with a debate-specific prompt
 * and stores findings under round_{N}_{role} keys.
 */
export function buildDebateSubgraph(
  config: DebateConfig,
  loader: RoleLoader,
  llmFactory: LLMFactory,
) {
  const graph = new StateGraph(WorkflowState);
  const participants = config.participants;

  if (participants.length !== 2) {
    throw new Error("Debate currently supports exactly 2 participants");
  }

  // Sort: first=true participant comes first
  const sorted = [...participants].sort((a, b) => (b.first ? 1 : 0) - (a.first ? 1 : 0));
  const p1 = sorted[0];
  const p2 = sorted[1];

  const p1Agent = loader.getAgent(p1.agent);
  const p2Agent = loader.getAgent(p2.agent);

  if (!p1Agent || !p2Agent) {
    throw new Error(
      `Debate agent "${!p1Agent ? p1.agent : p2.agent}" not found for debate "${config.id}"`
    );
  }

  // Build nodes
  graph.addNode("p1_speak", buildDebateSpeakerNode(p1Agent, llmFactory, p1.role));
  graph.addNode("p2_speak", buildDebateSpeakerNode(p2Agent, llmFactory, p2.role));
  graph.addNode("check_yield", buildCheckYieldNode(config.stop_when.field, config.stop_when.condition));
  graph.addNode("increment_round", incrementRoundNode);

  // Edges: p1 → p2 → check
  graph.addEdge("p1_speak" as any, "p2_speak" as any);
  graph.addEdge("p2_speak" as any, "check_yield" as any);

  // Conditional: continue loop or exit
  graph.addConditionalEdges("check_yield" as any, (state: State) => {
    if (state.should_stop) return END;
    if (state.round >= config.max_rounds) return END;
    return "increment_round";
  });

  // increment_round → p1_speak (loop back)
  graph.addEdge("increment_round" as any, "p1_speak" as any);

  return graph;
}

// ——— Internal nodes ———

/**
 * Increment the debate round counter by 1.
 * Pure state transformation — no LLM call.
 */
function incrementRoundNode(state: State): Partial<State> {
  return { round: (state.round || 0) + 1 };
}

/**
 * Build a debate speaker node that:
 * 1. Constructs a round-specific prompt using the config's prompt_template
 * 2. Invokes the LLM (no-tools path)
 * 3. Stores the parsed output under findings[`round_{N}_{role}`]
 * 4. Appends a message to the messages array
 */
function buildDebateSpeakerNode(
  compiled: CompiledAgent,
  llmFactory: LLMFactory,
  role: string,
) {
  return async (state: State): Promise<Partial<State>> => {
    const llm = llmFactory();

    // Build the prompt from state context
    const prompt = `你是${role}方。当前第${state.round}轮辩论。请发表你的论点。`;

    // Invoke LLM with system prompt + debate prompt
    const messages = [
      ...(await compiled.systemPrompt.formatMessages({})),
      new HumanMessage(prompt),
    ];

    const response = await llm.invoke(messages);
    const text =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    // Try to parse structured output
    let parsed: unknown = text;
    if (compiled.outputParser) {
      try {
        parsed = await compiled.outputParser.parse(text);
      } catch {
        parsed = { argument: text.slice(0, 200), raw: text };
      }
    } else {
      try {
        parsed = JSON.parse(text);
      } catch {
        // keep as raw text
      }
    }

    const findingsKey = `round_${state.round}_${role}`;

    return {
      findings: {
        ...state.findings,
        [findingsKey]: parsed,
      },
      messages: [
        ...state.messages,
        { role, content: text },
      ],
    };
  };
}
