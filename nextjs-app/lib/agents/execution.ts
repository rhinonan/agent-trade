import type { AgentPersona, ExecutionContext, Analysis } from "../engine/types.js";
import type { StructuredTool } from "@langchain/core/tools";
import { BaseAgent } from "../engine/types.js";

// ——— 执行Agent ———
export class ExecutionAgent implements BaseAgent {
  id: string;
  name = "执行Agent";
  capabilities: string[] = [];
  personality: AgentPersona;
  tools: StructuredTool[] = [];
  canCritique = false;
  canDebate = true;

  constructor(config?: { id?: string; personality?: AgentPersona }) {
    this.id = config?.id ?? "execution";
    this.personality = config?.personality ?? { stance: "neutral", style: "balanced" };
    this.capabilities = ["execution"];
  }

  async analyze(_context: ExecutionContext): Promise<Analysis> {
    return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
  }
}

// ——— 风控Agent ———
export class RiskControlAgent implements BaseAgent {
  id: string;
  name = "风控Agent";
  capabilities: string[] = [];
  personality: AgentPersona;
  tools: StructuredTool[] = [];
  canCritique = true;
  canDebate = true;

  constructor(config?: { id?: string; personality?: AgentPersona }) {
    this.id = config?.id ?? "risk-ctrl";
    this.personality = config?.personality ?? { stance: "bearish", style: "conservative" };
    this.capabilities = ["risk-control"];
  }

  async analyze(_context: ExecutionContext): Promise<Analysis> {
    return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
  }
}

// ——— 合规Agent ———
export class ComplianceAgent implements BaseAgent {
  id: string;
  name = "合规Agent";
  capabilities: string[] = [];
  personality: AgentPersona;
  tools: StructuredTool[] = [];
  canCritique = true;
  canDebate = false;

  constructor(config?: { id?: string; personality?: AgentPersona }) {
    this.id = config?.id ?? "compliance";
    this.personality = config?.personality ?? { stance: "neutral", style: "conservative" };
    this.capabilities = ["compliance"];
  }

  async analyze(_context: ExecutionContext): Promise<Analysis> {
    return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
  }
}

// ——— 成本优化Agent ———
export class CostOptimizationAgent implements BaseAgent {
  id: string;
  name = "成本优化Agent";
  capabilities: string[] = [];
  personality: AgentPersona;
  tools: StructuredTool[] = [];
  canCritique = false;
  canDebate = true;

  constructor(config?: { id?: string; personality?: AgentPersona }) {
    this.id = config?.id ?? "cost-optimizer";
    this.personality = config?.personality ?? { stance: "neutral", style: "balanced" };
    this.capabilities = ["cost-optimization", "execution"];
  }

  async analyze(_context: ExecutionContext): Promise<Analysis> {
    return { conclusion: "", confidence: 0.5, sentiment: "neutral", reasoning: [] };
  }
}
