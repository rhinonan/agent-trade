export interface AgentConclusion {
  agentId: string;
  agentName: string;
  conclusion: string;
  sentiment: "bullish" | "bearish" | "neutral";
  confidence: number;
}
