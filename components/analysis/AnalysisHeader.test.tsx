import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AnalysisHeader } from "./AnalysisHeader";

describe("AnalysisHeader", () => {
  const baseTarget = { type: "stock", code: "600519", name: "贵州茅台" };
  const baseWorkflow = "bull-bear";

  it("renders the target name when provided", () => {
    render(
      <AnalysisHeader
        target={baseTarget}
        workflow={baseWorkflow}
        status="running"
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "贵州茅台",
    );
  });

  it("renders the target code when name is missing", () => {
    render(
      <AnalysisHeader
        target={{ type: "stock", code: "000001" }}
        workflow={baseWorkflow}
        status="running"
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "000001",
    );
  });

  it("renders the target code and workflow name in the subtitle", () => {
    render(
      <AnalysisHeader
        target={baseTarget}
        workflow={baseWorkflow}
        status="running"
      />,
    );
    expect(screen.getByText(/600519/)).toBeDefined();
    expect(screen.getByText(/bull-bear/)).toBeDefined();
  });

  it("renders running status with amber color", () => {
    render(
      <AnalysisHeader
        target={baseTarget}
        workflow={baseWorkflow}
        status="running"
      />,
    );
    const statusEl = screen.getByText("分析中");
    expect(statusEl).toBeDefined();
    expect(statusEl.className).toContain("text-amber-400");
  });

  it("renders complete status with blue color", () => {
    render(
      <AnalysisHeader
        target={baseTarget}
        workflow={baseWorkflow}
        status="complete"
      />,
    );
    const statusEl = screen.getByText("已完成");
    expect(statusEl).toBeDefined();
    expect(statusEl.className).toContain("text-blue-400");
  });

  it("renders error status with red color", () => {
    render(
      <AnalysisHeader
        target={baseTarget}
        workflow={baseWorkflow}
        status="error"
      />,
    );
    const statusEl = screen.getByText("出错");
    expect(statusEl).toBeDefined();
    expect(statusEl.className).toContain("text-red-400");
  });
});
