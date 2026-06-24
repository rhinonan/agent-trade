import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveDebatePanel } from "./LiveDebatePanel";

describe("LiveDebatePanel", () => {
  const baseFindings = [
    {
      agent: "Bull Agent",
      conclusion: "看涨观点",
      sentiment: "bullish",
      confidence: 0.8,
      step: "analyze",
      timestamp: 1700000000000,
    },
    {
      agent: "Bear Agent",
      conclusion: "看跌观点",
      sentiment: "bearish",
      confidence: 0.7,
      step: "critique",
      timestamp: 1700000001000,
    },
  ];

  it("renders the empty state when findings is empty", () => {
    render(<LiveDebatePanel findings={[]} />);
    expect(screen.getByText("等待 Agent 分析结果...")).toBeDefined();
  });

  it("renders all findings as AgentBubble components", () => {
    render(<LiveDebatePanel findings={baseFindings} />);
    expect(screen.getByText("Bull Agent")).toBeDefined();
    expect(screen.getByText("Bear Agent")).toBeDefined();
    expect(screen.getByText("看涨观点")).toBeDefined();
    expect(screen.getByText("看跌观点")).toBeDefined();
  });

  it("does not render empty state when findings exist", () => {
    render(<LiveDebatePanel findings={baseFindings} />);
    expect(screen.queryByText("等待 Agent 分析结果...")).toBeNull();
  });
});
