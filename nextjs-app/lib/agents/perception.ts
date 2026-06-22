import type { AgentPersona, ExecutionContext, Analysis } from "../engine/types.js";
import type { StructuredTool } from "@langchain/core/tools";
import { BaseAgent } from "../engine/types.js";

// ——— 行情数据Agent ———
export class MarketDataAgent implements BaseAgent {
  id: string;
  name = "行情数据Agent";
  capabilities: string[] = [];
  personality: AgentPersona;
  tools: StructuredTool[] = [];
  canCritique = false;
  canDebate = false;
  layer?: string = "perception";

  constructor(config: { id: string; personality?: AgentPersona }) {
    this.id = config.id;
    this.personality = config.personality ?? { stance: "neutral" };
    this.capabilities = ["market-data", "data-perception"];
  }

  async analyze(_context: ExecutionContext): Promise<Analysis> {
    return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
  }
}

// ——— 舆情分析Agent ———
export class SentimentAgent implements BaseAgent {
  id: string;
  name = "舆情分析Agent";
  capabilities: string[] = [];
  personality: AgentPersona;
  tools: StructuredTool[] = [];
  canCritique = false;
  canDebate = false;
  layer?: string = "perception";

  constructor(config: { id: string; personality?: AgentPersona }) {
    this.id = config.id;
    this.personality = config.personality ?? { stance: "neutral" };
    this.capabilities = ["sentiment", "data-perception"];
  }

  async analyze(_context: ExecutionContext): Promise<Analysis> {
    return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
  }
}

// ——— 宏观数据Agent ———
export class MacroAgent implements BaseAgent {
  id: string;
  name = "宏观数据Agent";
  capabilities: string[] = [];
  personality: AgentPersona;
  tools: StructuredTool[] = [];
  canCritique = false;
  canDebate = false;
  layer?: string = "perception";

  constructor(config: { id: string; personality?: AgentPersona }) {
    this.id = config.id;
    this.personality = config.personality ?? { stance: "neutral" };
    this.capabilities = ["macro", "data-perception"];
  }

  async analyze(_context: ExecutionContext): Promise<Analysis> {
    return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
  }
}

// ——— 资金流向Agent ———
export class CapitalFlowAgent implements BaseAgent {
  id: string;
  name = "资金流向Agent";
  capabilities: string[] = [];
  personality: AgentPersona;
  tools: StructuredTool[] = [];
  canCritique = false;
  canDebate = false;
  layer?: string = "perception";

  constructor(config: { id: string; personality?: AgentPersona }) {
    this.id = config.id;
    this.personality = config.personality ?? { stance: "neutral" };
    this.capabilities = ["capital-flow", "data-perception"];
  }

  async analyze(_context: ExecutionContext): Promise<Analysis> {
    return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
  }
}

// ——— 机构动向Agent ———
export class InstitutionalAgent implements BaseAgent {
  id: string;
  name = "机构动向Agent";
  capabilities: string[] = [];
  personality: AgentPersona;
  tools: StructuredTool[] = [];
  canCritique = false;
  canDebate = false;
  layer?: string = "perception";

  constructor(config: { id: string; personality?: AgentPersona }) {
    this.id = config.id;
    this.personality = config.personality ?? { stance: "neutral" };
    this.capabilities = ["institutional", "data-perception"];
  }

  async analyze(_context: ExecutionContext): Promise<Analysis> {
    return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
  }
}
