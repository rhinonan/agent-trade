import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConclusionCard } from "./ConclusionCard";

describe("ConclusionCard", () => {
  const baseProps = {
    conclusion: "综合研判：该股票短期承压，中长期具备配置价值",
    reasoning: ["Q3财报营收同比增15%", "行业PE处于历史低位", "政策面利好"],
    sentiment: "neutral",
    confidence: 0.72,
  };

  it("renders the heading", () => {
    render(<ConclusionCard {...baseProps} />);
    expect(screen.getByText("综合研判")).toBeDefined();
  });

  it("renders the conclusion text", () => {
    render(<ConclusionCard {...baseProps} />);
    expect(
      screen.getByText("综合研判：该股票短期承压，中长期具备配置价值"),
    ).toBeDefined();
  });

  it("renders all reasoning items", () => {
    render(<ConclusionCard {...baseProps} />);
    expect(screen.getByText(/Q3财报营收同比增15%/)).toBeDefined();
    expect(screen.getByText(/行业PE处于历史低位/)).toBeDefined();
    expect(screen.getByText(/政策面利好/)).toBeDefined();
  });

  it("does not render reasoning list when empty", () => {
    const { container } = render(
      <ConclusionCard {...baseProps} reasoning={[]} />,
    );
    expect(container.querySelector("ul")).toBeNull();
  });

  it("renders sentiment and confidence", () => {
    render(<ConclusionCard {...baseProps} />);
    expect(screen.getByText("neutral")).toBeDefined();
    expect(screen.getByText("72%")).toBeDefined();
  });
});
