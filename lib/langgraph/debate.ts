import { StateGraph, END, START } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import type { RoleLoader, CompiledAgent } from "../role-loader/loader.js";
import { WorkflowState } from "./state.js";
import { buildCheckYieldNode } from "./nodes.js";

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
 * Build a debate subgraph with dynamic first-speaker routing.
 *
 * Graph structure:
 *   START → (conditional: meets_expectations?) → first speaker
 *   first speaker → (conditional) → second speaker → check_yield
 *   check_yield → END (yield) | set_max_end (max rounds) | increment_round → first speaker
 *
 * When research.meets_expectations === false (below expectations):
 *   The bear (空方) speaks first.
 * Otherwise (true or undefined, at/above expectations):
 *   The bull (多方) speaks first.
 *
 * Node IDs are role-based (e.g. 多方_speak, 空方_speak) rather than
 * position-based (p1_speak, p2_speak).
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

  const p1 = participants[0]; // e.g. { agent: "earnings-bull", role: "多方" }
  const p2 = participants[1]; // e.g. { agent: "earnings-bear", role: "空方" }

  const p1Agent = loader.getAgent(p1.agent);
  const p2Agent = loader.getAgent(p2.agent);

  if (!p1Agent || !p2Agent) {
    throw new Error(
      `Debate agent "${!p1Agent ? p1.agent : p2.agent}" not found for debate "${config.id}"`
    );
  }

  // Node IDs are role-based, not position-based
  const p1NodeId = `${p1.role}_speak`;
  const p2NodeId = `${p2.role}_speak`;

  graph.addNode(p1NodeId, buildDebateSpeakerNode(p1Agent, llmFactory, p1.role, p2.role, config.prompt_template));
  graph.addNode(p2NodeId, buildDebateSpeakerNode(p2Agent, llmFactory, p2.role, p1.role, config.prompt_template));
  graph.addNode("check_yield", buildCheckYieldNode(config.stop_when.field, config.stop_when.condition));
  graph.addNode("increment_round", incrementRoundNode);
  graph.addNode("set_max_end", (state: State): Partial<State> => ({
    should_stop: true,
    stop_reason: "max_rounds",
    total_rounds: state.round + 1,
  }));
  graph.addEdge("set_max_end" as any, END as any);

  // Routing function: bear speaks first when earnings miss expectations
  const routeToFirstSpeaker = (state: State): string => {
    const research = state.findings?.research as Record<string, unknown> | undefined;
    // meets_expectations === false → below expectations → bear (空方) first
    // Otherwise (true or undefined) → bull (多方) first
    const bearFirst = research?.meets_expectations === false;
    return bearFirst ? p2NodeId : p1NodeId;
  };

  // START → conditional to first speaker
  graph.addConditionalEdges(START as any, routeToFirstSpeaker);

  // From p1 (e.g. 多方): if bear is first → p1 speaks second → check_yield;
  // otherwise p1 speaks first → go to p2
  graph.addConditionalEdges(p1NodeId as any, (state: State) => {
    const research = state.findings?.research as Record<string, unknown> | undefined;
    const bearFirst = research?.meets_expectations === false;
    return bearFirst ? "check_yield" : p2NodeId;
  });

  // From p2 (e.g. 空方): if bear is first → p2 speaks first → go to p1;
  // otherwise p2 speaks second → check_yield
  graph.addConditionalEdges(p2NodeId as any, (state: State) => {
    const research = state.findings?.research as Record<string, unknown> | undefined;
    const bearFirst = research?.meets_expectations === false;
    return bearFirst ? p1NodeId : "check_yield";
  });

  // check_yield → END (yield) | set_max_end (max rounds) | increment_round
  graph.addConditionalEdges("check_yield" as any, (state: State) => {
    if (state.should_stop) return END;
    if (state.round >= config.max_rounds - 1) return "set_max_end";
    return "increment_round";
  });

  // increment_round → back to first speaker (same routing logic)
  graph.addConditionalEdges("increment_round" as any, routeToFirstSpeaker);

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
 * Resolve debate-specific template variables in a prompt string.
 *
 * Supported variables:
 * - `{{role}}` → current speaker's role (e.g. "bull", "bear")
 * - `{{round}}` → current debate round number
 * - `{{opponent.last_argument}}` → last argument text from the opposing role
 * - `{{findings}}` → formatted JSON list of all findings
 * - `{{target}}` → the analysis target code
 */
function resolveDebateTemplate(
  template: string,
  state: State,
  role: string,
  opponentRole: string,
): string {
  let result = template;

  result = result.replace(/\{\{role\}\}/g, role);
  result = result.replace(/\{\{round\}\}/g, String(state.round ?? 0));
  result = result.replace(/\{\{target\}\}/g, state.target);

  // {{opponent.last_argument}}
  result = result.replace(
    /\{\{opponent\.last_argument\}\}/g,
    () => {
      // Collect all opponent messages from the current debate
      const opponentMsgs = (state.messages ?? [])
        .filter((m) => m.role === opponentRole);
      if (opponentMsgs.length > 0) {
        return opponentMsgs[opponentMsgs.length - 1].content;
      }
      return "(尚无对方论点)";
    },
  );

  // {{findings}}
  result = result.replace(/\{\{findings\}\}/g, () => {
    const entries = Object.entries(state.findings ?? {});
    if (entries.length === 0) return "(暂无分析结果)";
    return entries
      .map(([key, value]) => `[${key}]: ${JSON.stringify(value)}`)
      .join("\n");
  });

  // {{state.<node_id>.<field>}} — specific field from a node's findings
  result = result.replace(
    /\{\{state\.(\w+)\.(\w+)\}\}/g,
    (_match, nodeId: string, field: string) => {
      const finding = state.findings?.[nodeId];
      if (finding && typeof finding === "object" && field in (finding as Record<string, unknown>)) {
        return String((finding as Record<string, unknown>)[field]);
      }
      return `{{state.${nodeId}.${field}}}`; // leave unresolved if not found
    },
  );

  // {{state.<node_id>}} — whole finding from a node
  result = result.replace(
    /\{\{state\.(\w+)\}\}/g,
    (_match, nodeId: string) => {
      const finding = state.findings?.[nodeId];
      if (finding !== undefined) {
        return typeof finding === "string" ? finding : JSON.stringify(finding);
      }
      return `{{state.${nodeId}}}`; // leave unresolved if not found
    },
  );

  return result;
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
  opponentRole: string,
  promptTemplate: string,
) {
  return async (state: State): Promise<Partial<State>> => {
    const llm = llmFactory();

    // Build the prompt from the YAML prompt_template with variable interpolation
    const prompt = resolveDebateTemplate(promptTemplate, state, role, opponentRole);

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
