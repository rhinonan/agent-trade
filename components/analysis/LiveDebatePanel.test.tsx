import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveDebatePanel } from "./LiveDebatePanel";
import type { AgentStream } from "@/hooks/useAnalysisSocket";

function mockStream(overrides: Partial<AgentStream> = {}): AgentStream {
  return {
    nodeId: "test",
    agentName: "Test Agent",
    status: "done",
    toolCalls: [],
    toolResults: new Map(),
    conclusion: "",
    reasoning: "",
    finding: null,
    startedAt: Date.now(),
    ...overrides,
  };
}

describe("LiveDebatePanel", () => {
  it("renders the empty state when agentStreams is empty and running", () => {
    render(
      <LiveDebatePanel agentStreams={new Map()} isRunning={true} />,
    );
    expect(screen.getByText("等待 Agent 分析结果...")).toBeDefined();
  });

  it("renders empty state for non-running when agentStreams is empty", () => {
    render(
      <LiveDebatePanel agentStreams={new Map()} isRunning={false} />,
    );
    expect(screen.getByText("暂无分析数据")).toBeDefined();
  });

  it("renders all agent streams as AgentBubble components", () => {
    const streams = new Map<string, AgentStream>();
    streams.set("node-1", mockStream({
      nodeId: "node-1",
      agentName: "Bull Agent",
      conclusion: "看涨观点",
    }));
    streams.set("node-2", mockStream({
      nodeId: "node-2",
      agentName: "Bear Agent",
      conclusion: "看跌观点",
    }));

    render(<LiveDebatePanel agentStreams={streams} />);
    expect(screen.getByText("Bull Agent")).toBeDefined();
    expect(screen.getByText("Bear Agent")).toBeDefined();
  });

  it("does not render empty state when streams exist", () => {
    const streams = new Map<string, AgentStream>();
    streams.set("node-1", mockStream());

    render(<LiveDebatePanel agentStreams={streams} />);
    expect(screen.queryByText("等待 Agent 分析结果...")).toBeNull();
    expect(screen.queryByText("暂无分析数据")).toBeNull();
  });
});
