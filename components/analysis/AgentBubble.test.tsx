import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentBubble } from "./AgentBubble";

describe("AgentBubble", () => {
  const baseProps = {
    agent: "Bull Agent",
    conclusion: "预计Q3营收增长20%，建议增持",
    sentiment: "bullish",
    confidence: 0.85,
    timestamp: 1700000000000,
  };

  it("renders the agent name", () => {
    render(<AgentBubble {...baseProps} />);
    expect(screen.getByText("Bull Agent")).toBeDefined();
  });

  it("renders the conclusion", () => {
    render(<AgentBubble {...baseProps} />);
    expect(screen.getByText("预计Q3营收增长20%，建议增持")).toBeDefined();
  });

  it("renders sentiment, confidence, and time in the info line", () => {
    render(<AgentBubble {...baseProps} />);
    expect(screen.getByText(/bullish/)).toBeDefined();
    expect(screen.getByText(/85%/)).toBeDefined();
  });

  it("applies blue left border for bullish sentiment", () => {
    const { container } = render(<AgentBubble {...baseProps} />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-l-blue-500");
  });

  it("applies red left border for bearish sentiment", () => {
    const { container } = render(
      <AgentBubble {...baseProps} sentiment="bearish" />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-l-red-500");
  });

  it("applies zinc left border for neutral sentiment", () => {
    const { container } = render(
      <AgentBubble {...baseProps} sentiment="neutral" />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("border-l-zinc-500");
  });

  it("formats confidence as integer percentage", () => {
    render(<AgentBubble {...baseProps} confidence={0.42} />);
    expect(screen.getByText(/42%/)).toBeDefined();
  });
});
