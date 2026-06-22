import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import HomePage from "./page";

describe("HomePage", () => {
  it("renders the AgentTrade heading", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "AgentTrade",
    );
  });

  it("renders within a main element", () => {
    render(<HomePage />);
    const main = document.querySelector("main");
    expect(main).toBeInTheDocument();
  });
});
