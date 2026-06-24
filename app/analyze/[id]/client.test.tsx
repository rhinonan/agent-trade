import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Hoisted mock for useAnalysisSocket
const { mockUseAnalysisSocket } = vi.hoisted(() => ({
  mockUseAnalysisSocket: vi.fn(),
}));

vi.mock("@/hooks/useAnalysisSocket", () => ({
  useAnalysisSocket: mockUseAnalysisSocket,
}));

import { AnalysisLiveClient } from "./client";

function defaultReturn(overrides: Record<string, unknown> = {}) {
  return {
    connected: true,
    findings: [],
    steps: [],
    nodes: [],
    agentStreams: new Map(),
    status: "running" as const,
    ...overrides,
  };
}

describe("AnalysisLiveClient (with useAnalysisSocket)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAnalysisSocket.mockReturnValue(defaultReturn());
  });

  it("renders the live analysis indicator when running and connected", () => {
    render(<AnalysisLiveClient sessionId="test-123" />);
    expect(screen.getByText(/实时分析进行中/)).toBeDefined();
    expect(screen.getByText(/实时分析进行中/).className).toContain("text-amber-400");
  });

  it("shows disconnected warning when status is running but not connected", () => {
    mockUseAnalysisSocket.mockReturnValue(
      defaultReturn({ connected: false }),
    );

    render(<AnalysisLiveClient sessionId="test-123" />);
    expect(screen.getByText(/连接断开/)).toBeDefined();
  });

  it("renders StepProgress with nodes from hook", () => {
    const nodes = [
      { nodeId: "s1", agentName: "bull", nodeType: "standard", status: "complete" as const },
      { nodeId: "s2", agentName: "bear", nodeType: "standard", status: "running" as const },
    ];
    mockUseAnalysisSocket.mockReturnValue(
      defaultReturn({ nodes }),
    );

    render(<AnalysisLiveClient sessionId="test-123" />);
    expect(screen.getByText("bull")).toBeDefined();
    expect(screen.getByText("bear")).toBeDefined();
  });

  it("renders ConclusionCard when a judge finding exists", () => {
    const findings = [
      {
        step: "final",
        agent: "judge",
        conclusion: "Overall neutral",
        reasoning: ["Market is uncertain"],
        sentiment: "neutral",
        confidence: 0.5,
        timestamp: Date.now(),
      },
    ];
    mockUseAnalysisSocket.mockReturnValue(
      defaultReturn({ findings, status: "complete" }),
    );

    render(<AnalysisLiveClient sessionId="test-123" />);
    // "Overall neutral" appears in both the agent bubble and the conclusion card
    expect(screen.getByText("综合研判")).toBeDefined();
  });

  it("does not render ConclusionCard when no judge finding", () => {
    const findings = [
      {
        step: "s1",
        agent: "bull",
        conclusion: "Bullish",
        sentiment: "bullish",
        confidence: 0.8,
        timestamp: Date.now(),
      },
    ];
    mockUseAnalysisSocket.mockReturnValue(
      defaultReturn({ findings }),
    );

    render(<AnalysisLiveClient sessionId="test-123" />);
    expect(screen.queryByText("综合研判")).toBeNull();
  });

  it("hides status indicator when analysis is complete", () => {
    mockUseAnalysisSocket.mockReturnValue(
      defaultReturn({ status: "complete" }),
    );

    render(<AnalysisLiveClient sessionId="test-123" />);
    expect(screen.queryByText(/实时分析进行中/)).toBeNull();
    expect(screen.queryByText(/连接断开/)).toBeNull();
  });

  it("calls useAnalysisSocket with the correct sessionId", () => {
    render(<AnalysisLiveClient sessionId="my-session" />);
    expect(mockUseAnalysisSocket).toHaveBeenCalledWith("my-session");
  });
});
