import type { Runnable } from "@langchain/core/runnables";
import { HumanMessage } from "@langchain/core/messages";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import type { CompiledAgent } from "../role-loader/loader.js";
import type { WorkflowState } from "./state.js";

type State = typeof WorkflowState.State;

// ——— Agent Node ———

/**
 * Build a LangGraph node that runs a tool-calling agent.
 *
 * The node:
 * 1. Creates a tool-calling agent from the compiled agent's prompt + tools
 * 2. Invokes it with the given task prompt (with {{target}} interpolation)
 * 3. Parses the output (via StructuredOutputParser if configured)
 * 4. Stores the result in state.findings[agentId]
 */
export function buildAgentNode(
  compiled: CompiledAgent,
  taskPrompt: string,
  llmFactory: () => Runnable,
) {
  return async (state: State): Promise<Partial<State>> => {
    const llm = llmFactory();

    // Interpolate {{target}} in the task prompt
    const resolvedPrompt = taskPrompt.replace(/\{\{target\}\}/g, state.target);

    if (compiled.tools.length === 0) {
      // Simple path: no tools, just invoke LLM with system prompt
      const messages = [
        ...(await compiled.systemPrompt.formatMessages({})),
        new HumanMessage(resolvedPrompt),
      ];
      const response = await llm.invoke(messages);
      const text =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

      let parsed: unknown = text;
      if (compiled.outputParser) {
        try {
          parsed = await compiled.outputParser.parse(text);
        } catch {
          parsed = { conclusion: text.slice(0, 200), raw: text };
        }
      } else {
        // Try JSON parse as a convenience for structured LLM outputs
        try {
          parsed = JSON.parse(text);
        } catch {
          // keep as raw text
        }
      }

      return {
        findings: {
          ...state.findings,
          [compiled.id]: parsed,
        },
      };
    }

    // Tool path: use createToolCallingAgent
    // NOTE: compiled.tools are ToolDefinition[], not LangChain StructuredTool[].
    // We cast here; a proper adapter wrapping ToolDefinition.execute → StructuredTool
    // will be needed when end-to-end tool calling is exercised.
    const agent = createToolCallingAgent({
      llm: llm as any,
      tools: compiled.tools as any,
      prompt: compiled.systemPrompt as any,
    });

    const executor = new AgentExecutor({
      agent,
      tools: compiled.tools as any,
      maxIterations: compiled.maxToolSteps,
      returnIntermediateSteps: false,
    });

    const result = await executor.invoke({ input: resolvedPrompt });
    const outputText = result.output as string;

    let parsed: unknown = outputText;
    if (compiled.outputParser) {
      try {
        parsed = await compiled.outputParser.parse(outputText);
      } catch {
        parsed = { conclusion: outputText.slice(0, 200), raw: outputText };
      }
    } else {
      // Try JSON parse as a convenience for structured LLM outputs
      try {
        parsed = JSON.parse(outputText);
      } catch {
        // keep as raw text
      }
    }

    return {
      findings: {
        ...state.findings,
        [compiled.id]: parsed,
      },
    };
  };
}

// ——— Check Yield Node (debate exit condition) ———

/**
 * Pure function node — no LLM call. Reads the current round participant
 * outputs from state.findings and checks if any/all have yield=true.
 *
 * Keys looked up: `round_{r}_{role}` for the current round.
 */
export function buildCheckYieldNode(
  field: string,
  condition: "any" | "all",
) {
  return async (state: State): Promise<Partial<State>> => {
    // Get entries that were created this round
    const entryKeys = Object.keys(state.findings).filter((k) =>
      k.startsWith(`round_${state.round}_`),
    );

    const yields: boolean[] = [];
    for (const key of entryKeys) {
      const entry = state.findings[key] as Record<string, unknown> | undefined;
      if (entry && typeof entry[field] === "boolean") {
        yields.push(entry[field] as boolean);
      }
    }

    const shouldStop =
      condition === "any"
        ? yields.some((y) => y === true)
        : yields.every((y) => y === true);

    return {
      should_stop: shouldStop,
      stop_reason: shouldStop ? "yield" : "",
    };
  };
}
