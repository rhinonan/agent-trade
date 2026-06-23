import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentSummary } from "../AgentSummary";

const MOCK_AGENTS = [
  {
    agentId: "technical-bull",
    agentName: "牛方技术分析师",
    conclusion: "短期均线金叉，量能配合良好，看多",
    sentiment: "bullish" as const,
    confidence: 0.78,
  },
  {
    agentId: "technical-bear",
    agentName: "熊方技术分析师",
    conclusion: "MACD 顶背离信号，警惕回调风险",
    sentiment: "bearish" as const,
    confidence: 0.65,
  },
];

describe("AgentSummary", () => {
  it("renders all agent names", () => {
    render(<AgentSummary agents={MOCK_AGENTS} />);
    expect(screen.getByText("牛方技术分析师")).toBeDefined();
    expect(screen.getByText("熊方技术分析师")).toBeDefined();
  });

  it("shows sentiment colors via border", () => {
    render(<AgentSummary agents={MOCK_AGENTS} />);
    const bullishEl = screen.getByText("牛方技术分析师").closest("div");
    expect(bullishEl?.parentElement?.className).toMatch(/emerald/);
    const bearishEl = screen.getByText("熊方技术分析师").closest("div");
    expect(bearishEl?.parentElement?.className).toMatch(/red/);
  });

  it("shows confidence percentage", () => {
    render(<AgentSummary agents={MOCK_AGENTS} />);
    expect(screen.getByText("78%")).toBeDefined();
  });

  it("shows empty state when no agents", () => {
    render(<AgentSummary agents={[]} />);
    expect(screen.getByText(/暂无 Agent 结论/)).toBeDefined();
  });
});
