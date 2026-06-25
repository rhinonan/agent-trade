import type { Runnable } from "@langchain/core/runnables";
import { HumanMessage } from "@langchain/core/messages";
import { StructuredTool, tool } from "@langchain/core/tools";
import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { z } from "zod";
import type { CompiledAgent } from "../role-loader/loader.js";
import type { WorkflowState } from "./state.js";
import type { ToolDefinition, ToolContext, PropertySchema } from "../tools/types.js";
import type { AStockClient } from "../data-sdk/client.js";
import { createLogger } from "../logger.js";
import { AgentStreamCallbackHandler } from "./callback-handler.js";

const log = createLogger("nodes");

type State = typeof WorkflowState.State;

// ——— JSON Schema → Zod adapter ———

/**
 * Convert a PropertySchema (plain JSON Schema object from ToolDefinition)
 * into a real Zod schema, which is required by LangChain's `tool()` and
 * the OpenAI `bindTools` / `zodToJsonSchema` pipeline.
 */
function propertySchemaToZod(prop: PropertySchema): z.ZodTypeAny {
  let base: z.ZodTypeAny;
  switch (prop.type) {
    case "string":
      base = z.string();
      break;
    case "number":
      base = z.number();
      break;
    case "boolean":
      base = z.boolean();
      break;
    case "array":
      base = z.array(prop.items ? propertySchemaToZod(prop.items) : z.string());
      break;
    case "object":
      // For generic objects, use z.record — specific object shapes
      // with nested properties would need the full parameters shape,
      // but tools don't use nested objects currently.
      base = z.record(z.any());
      break;
    default:
      base = z.string();
  }
  if (prop.description) base = base.describe(prop.description);
  if (prop.enum && prop.type === "string") {
    base = z.enum(prop.enum as [string, ...string[]]);
    if (prop.description) base = base.describe(prop.description);
  }
  return base;
}

/**
 * Convert a ToolDefinition's `parameters` block into a Zod object schema.
 */
function parametersToZodSchema(params: ToolDefinition["parameters"]): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, prop] of Object.entries(params.properties)) {
    let field = propertySchemaToZod(prop);
    // Make the field optional if not in the required list
    if (!params.required.includes(key)) {
      field = field.optional();
    }
    shape[key] = field;
  }
  return z.object(shape);
}

// ——— Tool Definition → LangChain StructuredTool adapter ———

/**
 * Convert our internal ToolDefinition to a LangChain StructuredTool.
 * This bridges the gap between YAML-declared tools and LangChain's tool-calling agent.
 */
function toolDefinitionToStructuredTool(
  td: ToolDefinition,
  ctx: ToolContext,
): StructuredTool {
  return tool(
    async (params: Record<string, unknown>) => {
      const result = await td.execute(params, ctx);
      return result;
    },
    {
      name: td.name,
      description: td.description,
      schema: parametersToZodSchema(td.parameters),
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

  // Also handle {target} (single brace) — some callers pre-convert via interpolateTemplate
  result = result.replace(/\{target\}/g, state.target);

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

  // {{debate.messages}} — formatted debate transcript
  result = result.replace(
    /\{\{debate\.messages\}\}/g,
    () => {
      const msgs = state.messages ?? [];
      if (msgs.length === 0) return "(暂无辩论记录)";
      return msgs
        .map((m, i) => `[第${Math.floor(i / 2) + 1}轮] ${m.role}：${m.content}`)
        .join("\n\n");
    },
  );

  // {{debate.stop_reason}} — why the debate ended
  result = result.replace(
    /\{\{debate\.stop_reason\}\}/g,
    () => {
      if (state.stop_reason === "yield") return "一方认输";
      if (state.stop_reason === "max_rounds") return "达到最大轮次上限";
      return state.stop_reason || "辩论结束";
    },
  );

  // {{debate.total_rounds}} — total debate rounds
  result = result.replace(
    /\{\{debate\.total_rounds\}\}/g,
    () => String(state.total_rounds ?? state.round ?? 0),
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
  dataClient: AStockClient,
  nodeId: string,
  callbacks?: import("./compiler.js").AgentNodeCallbacks,
) {
  return async (state: State): Promise<Partial<State>> => {
    const llm = llmFactory();

    // Build ToolContext with real dataClient and the current analysis target
    const toolCtx: ToolContext = {
      dataClient,
      target: { type: "stock", code: state.target },
      executionState: {} as any,
      signal: new AbortController().signal,
    };

    // Interpolate all state variables in the task prompt
    const resolvedPrompt = resolveStateVariables(taskPrompt, state);

    if (compiled.tools.length === 0) {
      // Simple path: no tools, just invoke LLM with system prompt
      const messages = [
        ...(await compiled.systemPrompt.formatMessages({})),
        new HumanMessage(resolvedPrompt),
      ];

      log.verbose("LLM invoke (simple)", {
        nodeId,
        agentName: compiled.id,
        promptLength: resolvedPrompt.length,
        tools: 0,
      });

      const startMs = Date.now();
      const response = await llm.invoke(messages);
      const latencyMs = Date.now() - startMs;

      const text =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

      log.verbose("LLM response (simple)", {
        nodeId,
        agentName: compiled.id,
        responseLength: text.length,
        latencyMs,
      });

      // Emit writing event for frontend typewriter (simple path, no tools)
      if (callbacks) {
        const agentName = compiled.id;
        let conclusion = "";
        let reasoning = "";
        try {
          const preParsed = JSON.parse(text);
          conclusion = preParsed.conclusion ?? text;
          reasoning = preParsed.reasoning ?? "";
        } catch {
          conclusion = text;
        }
        await callbacks.onAgentWriting?.(nodeId, agentName, conclusion, reasoning);
      }

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
          [nodeId]: parsed,
        },
      };
    }

    // Tool path: convert ToolDefinition[] → StructuredTool[], then invoke
    const structuredTools = compiled.tools.map((td) =>
      toolDefinitionToStructuredTool(td, toolCtx),
    );

    // Build a full prompt with agent_scratchpad (required by createToolCallingAgent).
    // compiled.systemPrompt is a ChatPromptTemplate containing the system message;
    // we extend it with {input} and a MessagesPlaceholder for tool call history.
    const agentPrompt = ChatPromptTemplate.fromMessages([
      ...compiled.systemPrompt.promptMessages,
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad"),
    ]);

    const agent = createToolCallingAgent({
      llm: llm as any,
      tools: structuredTools,
      prompt: agentPrompt,
    });

    const executor = new AgentExecutor({
      agent,
      tools: structuredTools,
      maxIterations: compiled.maxToolSteps,
      returnIntermediateSteps: true,
    });

    log.verbose("LLM invoke (tools)", {
      nodeId,
      agentName: compiled.id,
      promptLength: resolvedPrompt.length,
      toolCount: structuredTools.length,
      maxSteps: compiled.maxToolSteps,
    });

    // Use LangChain callback handler for real-time tool call/result events
    // emitted *during* agent execution instead of after it completes.
    const streamHandler = callbacks
      ? new AgentStreamCallbackHandler(nodeId, compiled.id, callbacks)
      : undefined;

    const startMs = Date.now();
    const result = await executor.invoke(
      { input: resolvedPrompt },
      streamHandler ? { callbacks: [streamHandler] } : undefined,
    );
    const latencyMs = Date.now() - startMs;

    log.verbose("LLM response (tools)", {
      nodeId,
      agentName: compiled.id,
      outputLength: String(result.output ?? "").length,
      intermediateSteps: (result as any).intermediateSteps?.length ?? 0,
      latencyMs,
    });

    const outputText = result.output as string;

    // Emit writing event with full conclusion/reasoning for frontend typewriter
    if (callbacks) {
      const agentName = compiled.id;
      let conclusion = "";
      let reasoning = "";
      try {
        const preParsed = JSON.parse(outputText);
        conclusion = preParsed.conclusion ?? outputText;
        reasoning = preParsed.reasoning ?? "";
      } catch {
        conclusion = outputText;
      }
      await callbacks.onAgentWriting?.(nodeId, agentName, conclusion, reasoning);
    }

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
        [nodeId]: parsed,
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
      total_rounds: state.round + 1,
    };
  };
}
