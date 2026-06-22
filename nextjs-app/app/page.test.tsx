import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import HomePage from "./page";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock fetch for workflows and analyze
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const mockWorkflows = [
  { name: "bull-bear", description: "牛熊对抗" },
  { name: "quick-scan", description: "快速扫描" },
];

function renderPage() {
  const result = render(<HomePage />);
  return result;
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockImplementation(async (url: string) => {
      if (url === "/api/workflows") {
        return {
          ok: true,
          json: async () => mockWorkflows,
        } as Response;
      }
      if (url === "/api/analyze") {
        return {
          ok: true,
          json: async () => ({ sessionId: "test-session-123" }),
        } as Response;
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });
  });

  it("renders the AgentTrade heading", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "AgentTrade",
      );
    });
  });

  it("renders the subtitle", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("多 Agent 对抗行情分析")).toBeDefined();
    });
  });

  it("renders a stock code input", async () => {
    renderPage();
    await waitFor(() => {
      const input = screen.getByPlaceholderText(/输入股票代码/);
      expect(input).toBeDefined();
    });
  });

  it("updates stock code value on user input", async () => {
    renderPage();
    const input = await screen.findByPlaceholderText(/输入股票代码/);
    fireEvent.change(input, { target: { value: "600519" } });
    expect(input).toHaveValue("600519");
  });

  it("fetches and displays workflow options", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("牛熊对抗")).toBeDefined();
    });

    expect(screen.getByText("快速扫描")).toBeDefined();
    expect(screen.getByText("四层深度分析")).toBeDefined();
  });

  it("highlights the selected workflow", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("牛熊对抗")).toBeDefined();
    });

    // Click on quick-scan to select it
    const quickScanButton = screen.getByText("快速扫描").closest("button");
    expect(quickScanButton).toBeDefined();
    fireEvent.click(quickScanButton!);

    // After clicking, quick-scan should have the selected border class
    await waitFor(() => {
      expect(quickScanButton!.className).toContain("border-emerald-500");
    });
  });

  it("renders a start analysis button", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("开始分析")).toBeDefined();
    });
  });

  it("disables start button when stock code is empty", async () => {
    renderPage();
    await waitFor(() => {
      const button = screen.getByText("开始分析");
      expect(button).toBeDisabled();
    });
  });

  it("enables start button when stock code is entered", async () => {
    renderPage();
    const input = await screen.findByPlaceholderText(/输入股票代码/);
    fireEvent.change(input, { target: { value: "600519" } });

    await waitFor(() => {
      const button = screen.getByText("开始分析");
      expect(button).not.toBeDisabled();
    });
  });

  it("calls POST /api/analyze and redirects on start", async () => {
    renderPage();

    // Enter stock code
    const input = await screen.findByPlaceholderText(/输入股票代码/);
    fireEvent.change(input, { target: { value: "600519" } });

    // Wait for workflows to load
    await waitFor(() => {
      expect(screen.getByText("牛熊对抗")).toBeDefined();
    });

    // Click start
    const startButton = screen.getByText("开始分析");
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "600519", workflow: "layered" }),
      });
      expect(mockPush).toHaveBeenCalledWith("/session/test-session-123");
    });
  });

  it("renders within a main element", async () => {
    renderPage();
    await waitFor(() => {
      const main = document.querySelector("main");
      expect(main).toBeInTheDocument();
    });
  });
});
