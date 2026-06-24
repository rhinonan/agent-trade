import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StepProgress } from "./StepProgress";

describe("StepProgress", () => {
  it("renders each step with its type label", () => {
    const steps = [
      { stepId: "1", type: "analyze", status: "complete" as const },
      { stepId: "2", type: "critique", status: "running" as const },
      { stepId: "3", type: "panel", status: "pending" as const },
    ];
    render(<StepProgress steps={steps} />);
    expect(screen.getByText("analyze")).toBeDefined();
    expect(screen.getByText("critique")).toBeDefined();
    expect(screen.getByText("panel")).toBeDefined();
  });

  it("renders an empty flex container when steps is empty", () => {
    const { container } = render(<StepProgress steps={[]} />);
    const div = container.firstChild as HTMLElement;
    expect(div).toBeDefined();
    expect(div?.className).toContain("flex");
  });

  it("applies blue-500 background for complete steps", () => {
    const steps = [
      { stepId: "1", type: "analyze", status: "complete" as const },
    ];
    const { container } = render(<StepProgress steps={steps} />);
    const indicator = container.querySelector(".rounded-full");
    expect(indicator?.className).toContain("bg-blue-500");
  });

  it("applies amber-400 background for running steps", () => {
    const steps = [
      { stepId: "1", type: "critique", status: "running" as const },
    ];
    const { container } = render(<StepProgress steps={steps} />);
    const indicator = container.querySelector(".rounded-full");
    expect(indicator?.className).toContain("bg-amber-400");
    expect(indicator?.className).toContain("animate-pulse");
  });

  it("applies zinc-700 background for pending steps", () => {
    const steps = [
      { stepId: "1", type: "panel", status: "pending" as const },
    ];
    const { container } = render(<StepProgress steps={steps} />);
    const indicator = container.querySelector(".rounded-full");
    expect(indicator?.className).toContain("bg-zinc-700");
  });
});
