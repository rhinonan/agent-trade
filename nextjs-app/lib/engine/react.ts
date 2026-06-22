import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Analysis, BaseAgent, AnalysisTarget, ExecutionContext } from "./types.js";
import type { ToolDefinition, ToolContext } from "../tools/types.js";
import type { DataClient } from "../data/client.js";
import { buildSystemPrompt } from "../prompt/builder.js";
import { createLLM, type AnalyzeOptions } from "../llm/create-llm.js";
import { parseLLMJson, parseSentiment } from "../llm/parse.js";

// ——— Types ———

export interface ReActOptions {
  agent: BaseAgent;
  context: ExecutionContext;
  prompt: string;
  target: AnalysisTarget;
  dataClient?: DataClient;
  maxSteps?: number;
  toolTimeout?: number;
  llmOptions?: AnalyzeOptions;
  onEvent?: (event: ReActEvent) => void;
  signal?: AbortSignal;
}

export type ReActEvent =
  | { type: "thought"; step: number; content: string }
  | { type: "action"; step: number; toolName: string; params: Record<string, unknown> }
  | { type: "observation"; step: number; toolName: string; result: string }
  | { type: "final"; step: number; analysis: Analysis }
  | { type: "forced_summary"; step: number; analysis: Analysis };

// ——— Tool schema formatting (OpenAI function-calling format) ———

interface OpenAIToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function formatToolSchemas(tools: ToolDefinition[]): OpenAIToolDef[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as Record<string, unknown>,
    },
  }));
}

// ——— Tool execution with timeout ———

async function executeWithTimeout(
  tool: ToolDefinition,
  params: Record<string, unknown>,
  ctx: ToolContext,
  timeoutMs: number,
): Promise<string> {
  try {
    const result = await Promise.race([
      tool.execute(params, ctx),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(new Error(`Tool ${tool.name} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: message, tool: tool.name });
  }
}

// ——— LLM response helpers ———

interface ToolCallFromLLM {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

/** Extract tool calls from an LLM response, handling both direct and additional_kwargs paths. */
function extractToolCalls(
  response: Record<string, unknown>,
): ToolCallFromLLM[] {
  const direct = response.tool_calls;
  if (Array.isArray(direct) && direct.length > 0) {
    return direct as ToolCallFromLLM[];
  }
  // Some providers put tool calls in additional_kwargs
  const ak = response.additional_kwargs as Record<string, unknown> | undefined;
  if (ak?.tool_calls && Array.isArray(ak.tool_calls) && ak.tool_calls.length > 0) {
    return (ak.tool_calls as Array<Record<string, unknown>>).map((tc) => ({
      name: (tc.function as Record<string, string>)?.name ?? "unknown",
      args: JSON.parse((tc.function as Record<string, string>)?.arguments ?? "{}"),
      id: tc.id as string | undefined,
    }));
  }
  return [];
}

/** Get text content from a LangChain message, handling both string and content-block-array formats. */
function getTextContent(response: Record<string, unknown>): string {
  const content = response.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textBlocks = content.filter(
      (block): block is { type: "text"; text: string } =>
        (block as Record<string, unknown>).type === "text",
    );
    return textBlocks.map((b) => b.text).join("\n");
  }
  return "";
}

// ——— Parse final analysis from LLM text ———

function parseAnalysis(text: string): Analysis {
  try {
    const parsed = parseLLMJson(text) as Record<string, unknown>;
    return {
      conclusion: (parsed.conclusion as string) ?? text.slice(0, 200),
      confidence: Math.max(0, Math.min(1, (parsed.confidence as number) ?? 0.5)),
      sentiment: parseSentiment(parsed.sentiment),
      reasoning: Array.isArray(parsed.reasoning)
        ? (parsed.reasoning as string[])
        : [(parsed.reasoning as string) ?? text.slice(0, 100)],
      rawOutput: text,
    };
  } catch {
    return {
      conclusion: text.slice(0, 200),
      confidence: 0.5,
      sentiment: "neutral",
      reasoning: [text.slice(0, 100)],
      rawOutput: text,
    };
  }
}

// ——— Core Loop ———

export async function runReActLoop(options: ReActOptions): Promise<Analysis> {
  const {
    agent,
    context,
    prompt,
    target,
    dataClient,
    maxSteps = 5,
    toolTimeout = 10_000,
    llmOptions = {},
    onEvent,
    signal,
  } = options;

  // Check cancellation before any expensive setup
  if (signal?.aborted) {
    throw new Error("ReAct loop cancelled");
  }

  const tools = (agent.tools as unknown as ToolDefinition[]) ?? [];
  const systemPrompt = buildSystemPrompt(agent, context);
  const llm: BaseChatModel = createLLM(llmOptions);

  // Build message history
  const messages: (SystemMessage | HumanMessage | AIMessage | ToolMessage)[] = [
    new SystemMessage(systemPrompt),
    new HumanMessage(formatHumanPrompt(prompt, context)),
  ];

  let step = 0;

  while (step < maxSteps) {

    step++;

    // Bind tools if agent has them; bindTools is optional on BaseChatModel
    // but all concrete providers (Anthropic, OpenAI, DeepSeek) implement it.
    const llmForStep =
      tools.length > 0
        ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          llm.bindTools!(formatToolSchemas(tools) as unknown as Record<string, unknown>[])
        : llm;

    // Invoke LLM
    const response = (await llmForStep.invoke(messages)) as unknown as Record<
      string,
      unknown
    >;

    // Check for tool calls
    const toolCalls = extractToolCalls(response);

    if (toolCalls.length > 0) {
      // — Tool call path —
      const aiMsg = new AIMessage({
        content: getTextContent(response),
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id ?? `call_${step}_${tc.name}`,
          name: tc.name,
          args: tc.args,
        })),
      });
      messages.push(aiMsg);

      // Build tool context
      const toolCtx: ToolContext = {
        dataClient: dataClient ?? ({} as DataClient),
        target,
        executionState: context,
        signal: signal ?? new AbortController().signal,
      };

      // Execute each tool call sequentially
      for (const tc of toolCalls) {
        const tool = tools.find((t) => t.name === tc.name);
        if (!tool) {
          messages.push(
            new ToolMessage({
              content: JSON.stringify({
                error: `Unknown tool: ${tc.name}`,
                tool: tc.name,
              }),
              tool_call_id: tc.id ?? `call_${step}_${tc.name}`,
            }),
          );
          continue;
        }

        onEvent?.({ type: "action", step, toolName: tc.name, params: tc.args });

        const result = await executeWithTimeout(tool, tc.args, toolCtx, toolTimeout);

        onEvent?.({ type: "observation", step, toolName: tc.name, result });

        messages.push(
          new ToolMessage({
            content: result,
            tool_call_id: tc.id ?? `call_${step}_${tc.name}`,
          }),
        );
      }

      // Continue loop — LLM sees tool results and decides next action
      continue;
    }

    // — Final answer path (no tool calls) —
    const finalText = getTextContent(response);

    onEvent?.({ type: "thought", step, content: finalText.slice(0, 500) });

    const analysis = parseAnalysis(finalText);
    onEvent?.({ type: "final", step, analysis });

    return analysis;
  }

  // — Max steps reached, force summary —
  const observationTexts = messages
    .filter((m) => m._getType() === "tool")
    .map((m) => (m as ToolMessage).content as string)
    .join("\n");

  const forcePrompt = `你已完成了${maxSteps}步分析。以下是所有工具返回的数据：\n\n${observationTexts || "无数据"}\n\n请基于以上数据给出最终分析结论。${systemPrompt}`;

  const forceMessages = [
    new SystemMessage(forcePrompt),
    new HumanMessage(
      `请给出对 ${target.name ?? target.code} 的最终分析结论`,
    ),
  ];

  const forceResponse = (await llm.invoke(forceMessages)) as unknown as Record<
    string,
    unknown
  >;
  const forceText = getTextContent(forceResponse);
  const analysis = parseAnalysis(forceText);
  analysis.forcedSummary = true;

  onEvent?.({ type: "forced_summary", step, analysis });

  return analysis;
}

// ——— Helpers ———

function formatHumanPrompt(prompt: string, context: ExecutionContext): string {
  // Replace {target} placeholder with the actual target name/code
  const targetStr = context.target.name ?? context.target.code;
  const resolvedPrompt = prompt.replace(/\{target\}/g, targetStr);
  const parts = [resolvedPrompt];
  const prevFindings = context.findings;
  if (prevFindings.length > 0) {
    parts.push("\n\n已有的分析结论（供参考）：");
    for (const f of prevFindings) {
      parts.push(
        `- [${f.agent}]: ${f.analysis.conclusion} (置信度: ${f.analysis.confidence})`,
      );
    }
  }
  return parts.join("\n");
}
