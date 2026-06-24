import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AgentBubble } from "./AgentBubble";
import type { AgentStream } from "@/hooks/useAnalysisSocket";

function mockStream(overrides: Partial<AgentStream> = {}): AgentStream {
  return {
    nodeId: "test-node",
    agentName: "Bull Agent",
    status: "done",
    toolCalls: [],
    toolResults: new Map(),
    conclusion: "预计Q3营收增长20%，建议增持",
    reasoning: "",
    finding: {
      step: "test-node",
      agent: "Bull Agent",
      conclusion: "预计Q3营收增长20%，建议增持",
      sentiment: "bullish",
      confidence: 0.85,
      timestamp: 1700000000000,
    },
    startedAt: 1700000000000,
    ...overrides,
  };
}

describe("AgentBubble", () => {
  it("renders the agent name", () => {
    render(<AgentBubble stream={mockStream()} />);
    expect(screen.getByText("Bull Agent")).toBeDefined();
  });

  it("renders the conclusion via typewriter", async () => {
    render(<AgentBubble stream={mockStream()} />);
    // TypewriterText renders in batches; wait for first characters to appear
    await waitFor(() => {
      expect(screen.getByText(/预计Q3/)).toBeDefined();
    });
  });

  it("shows toggle button for tool visibility", () => {
    render(<AgentBubble stream={mockStream({ toolCalls: [] })} />);
    expect(screen.getByText(/隐藏过程/)).toBeDefined();
  });

  it("shows thinking indicator when status is thinking", () => {
    render(
      <AgentBubble
        stream={mockStream({ status: "thinking", conclusion: "" })}
      />,
    );
    expect(screen.getByLabelText("Agent is thinking")).toBeDefined();
  });

  it("shows tool calls when visible", () => {
    render(
      <AgentBubble
        stream={mockStream({
          status: "done",
          toolCalls: [
            { tool: "get_kline", args: { code: "600519" }, ts: 1000 },
          ],
          toolResults: new Map([
            [
              "get_kline",
              {
                tool: "get_kline",
                result: '{"data": [1,2,3]}',
                ts: 2000,
              },
            ],
          ]),
        })}
      />,
    );
    expect(screen.getByText("get_kline")).toBeDefined();
  });

  it("shows completion indicator with sentiment and confidence when done", async () => {
    render(<AgentBubble stream={mockStream()} />);
    // Wait for typewriter to finish, then completion indicator appears
    await waitFor(() => {
      expect(screen.getByText(/85%/)).toBeDefined();
    });
    // Sentiment label also shown in completion indicator
    expect(screen.getByText(/bullish/)).toBeDefined();
  });

  it("applies blue left border for bullish finding", () => {
    const { container } = render(<AgentBubble stream={mockStream()} />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-l-blue-500");
  });

  it("applies red left border for bearish finding", () => {
    const { container } = render(
      <AgentBubble
        stream={mockStream({
          finding: {
            step: "test",
            agent: "Bear",
            conclusion: "跌",
            sentiment: "bearish",
            confidence: 0.7,
            timestamp: 1,
          },
        })}
      />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-l-red-500");
  });

  it("applies zinc left border for neutral finding", () => {
    const { container } = render(
      <AgentBubble
        stream={mockStream({
          finding: {
            step: "test",
            agent: "Neutral",
            conclusion: "平",
            sentiment: "neutral",
            confidence: 0.5,
            timestamp: 1,
          },
        })}
      />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-l-zinc-500");
  });

  it("defaults to muted border while still writing", () => {
    const { container } = render(
      <AgentBubble
        stream={mockStream({
          status: "writing",
          finding: null,
        })}
      />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-l-zinc-700");
  });
});
