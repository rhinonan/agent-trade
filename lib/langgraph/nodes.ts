import type { Runnable } from "@langchain/core/runnables";
import { HumanMessage } from "@langchain/core/messages";
import { StructuredTool, tool } from "@langchain/core/tools";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import type { CompiledAgent } from "../role-loader/loader.js";
import type { WorkflowState } from "./state.js";
import type { ToolDefinition } from "../tools/types.js";

type State = typeof WorkflowState.State;

// ——— Tool Definition → LangChain StructuredTool adapter ———

/**
 * Convert our internal ToolDefinition to a LangChain StructuredTool.
 * This bridges the gap between YAML-declared tools and LangChain's tool-calling agent.
 */
function toolDefinitionToStructuredTool(td: ToolDefinition): StructuredTool {
  return tool(
    async (params: Record<string, unknown>) => {
      // Minimal context — real context injection happens in the tool-calling path
      const result = await td.execute(params, {
        dataClient: undefined as any,
        target: { type: "stock", code: "" },
        executionState: {} as any,
        signal: new AbortController().signal,
      });
      return result;
    },
    {
      name: td.name,
      description: td.description,
      schema: td.parameters as any,
    },
  );
}

// ——— State variable interpolation ———

/**
 * Resolve template variables in a prompt string against the current workflow state.
 *
 * Supported variables:
 * - `{{target}}` → state.target
 * - `{{findings}}` → formatted JSON list of all findings
 * - `{{state.<node_id>}}` → JSON of that node's finding
 * - `{{state.<node_id>.<field>}}` → specific field of that node's finding
 * - `{{round}}` → state.round
 */
function resolveStateVariables(template: string, state: State): string {
  let result = template;

  // {{target}}
  result = result.replace(/\{\{target\}\}/g, state.target);

  // {{round}}
  result = result.replace(/\{\{round\}\}/g, String(state.round ?? 0));

  // {{findings}} — formatted list
  result = result.replace(/\{\{findings\}\}/g, () => {
    const entries = Object.entries(state.findings ?? {});
    if (entries.length === 0) return "(暂无分析结果)";
    return entries
      .map(([key, value]) => `[${key}]: ${JSON.stringify(value)}`)
      .join("\n");
  });

  // {{state.<node_id>.<field>}} — specific field
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

  // {{state.<node_id>}} — whole finding
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

// ——— Agent Node ———

/**
 * Build a LangGraph node that runs a tool-calling agent.
 *
 * The node:
 * 1. Creates a tool-calling agent from the compiled agent's prompt + tools
 * 2. Invokes it with the given task prompt (with {{target}} and {{state.*}} interpolation)
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

    // Interpolate all state variables in the task prompt
    const resolvedPrompt = resolveStateVariables(taskPrompt, state);

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

    // Tool path: convert ToolDefinition[] → StructuredTool[], then invoke
    const structuredTools = compiled.tools.map(toolDefinitionToStructuredTool);

    const agent = createToolCallingAgent({
      llm: llm as any,
      tools: structuredTools,
      prompt: compiled.systemPrompt as any,
    });

    const executor = new AgentExecutor({
      agent,
      tools: structuredTools,
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
