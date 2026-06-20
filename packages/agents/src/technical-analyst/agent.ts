import type { BaseAgent, AgentPersona, Analysis } from "@agenttrade/core";
import type { ExecutionContext } from "@agenttrade/core";
import type { StructuredTool } from "@langchain/core/tools";
import { TECHNICAL_SYSTEM_PROMPT, getStanceGuide } from "./prompts.js";
import { getKlineTool, getIndicatorsTool } from "./tools.js";

export class TechnicalAnalystAgent implements BaseAgent {
  id: string;
  name = "技术面分析Agent";
  capabilities = ["technical", "trend", "volume", "kline"];
  personality: AgentPersona;
  tools: StructuredTool[];

  constructor(config: { id: string; personality: AgentPersona }) {
    this.id = config.id;
    this.personality = config.personality;
    this.capabilities = [...this.capabilities, config.personality.stance];
    this.tools = [getKlineTool, getIndicatorsTool] as unknown as StructuredTool[];
  }

  canCritique = true;
  canDebate = true;

  async analyze(context: ExecutionContext): Promise<Analysis> {
    // In production, this would use LangChain AgentExecutor with tools.
    // For MVP, the analyze primitive handles LLM interaction.
    // This method is a fallback for direct agent invocation (tests).
    const systemPrompt = TECHNICAL_SYSTEM_PROMPT
      .replace("{stance_guide}", getStanceGuide(this.personality.stance));

    // Delegate to LangChain AgentExecutor or the framework's LLM layer
    // The actual execution is handled by executeAnalyze primitive
    throw new Error("TechnicalAnalystAgent.analyze() should be called via executeAnalyze primitive, not directly");
  }
}
