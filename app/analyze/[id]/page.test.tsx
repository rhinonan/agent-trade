import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AnalysisPage from "./page";

// Mock the DB layer
const mockGetById = vi.fn();

vi.mock("@/lib/db/analysis-repo.js", () => ({
  AnalysisRepo: vi.fn().mockImplementation(() => ({
    getById: mockGetById,
  })),
}));

vi.mock("@/lib/db/client.js", () => ({
  getDb: vi.fn(() => ({})),
}));

// Mock the client component
vi.mock("./client", () => ({
  AnalysisLiveClient: vi.fn(({ sessionId }: { sessionId: string }) => (
    <div data-testid="live-client" data-session={sessionId}>
      Live Client Mock
    </div>
  )),
}));

function buildRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    targetType: "stock",
    targetCode: "600519",
    targetName: "贵州茅台",
    workflowName: "bull-bear",
    status: "running" as const,
    context: JSON.stringify({
      findings: [
        {
          agent: "Bull Agent",
          conclusion: "看好",
          sentiment: "bullish",
          confidence: 0.8,
          step: "analyze",
          timestamp: 1700000000000,
        },
      ],
    }),
    createdAt: 1700000000000,
    ...overrides,
  };
}

describe("AnalysisPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the not-found message when no record exists", async () => {
    mockGetById.mockReturnValue(undefined);
    const result = await AnalysisPage({
      params: Promise.resolve({ id: "nonexistent" }),
    });
    render(result);
    expect(screen.getByText("分析记录不存在")).toBeDefined();
  });

  it("renders the AnalysisHeader with target info", async () => {
    mockGetById.mockReturnValue(buildRecord());
    const result = await AnalysisPage({
      params: Promise.resolve({ id: "session-1" }),
    });
    render(result);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "贵州茅台",
    );
  });

  it("renders findings via LiveDebatePanel", async () => {
    mockGetById.mockReturnValue(buildRecord());
    const result = await AnalysisPage({
      params: Promise.resolve({ id: "session-1" }),
    });
    render(result);
    expect(screen.getByText("Bull Agent")).toBeDefined();
    expect(screen.getByText("看好")).toBeDefined();
  });

  it("renders ConclusionCard when a judge finding exists", async () => {
    mockGetById.mockReturnValue(
      buildRecord({
        context: JSON.stringify({
          findings: [
            {
              agent: "judge",
              conclusion: "Judge says hold",
              sentiment: "neutral",
              confidence: 0.6,
              step: "judge",
              timestamp: 1700000001000,
              analysis: {
                conclusion: "综合研判：持有",
                reasoning: ["理由1", "理由2"],
                sentiment: "neutral",
                confidence: 0.6,
              },
            },
          ],
        }),
      }),
    );
    const result = await AnalysisPage({
      params: Promise.resolve({ id: "session-1" }),
    });
    render(result);
    expect(screen.getByText("综合研判")).toBeDefined();
    expect(screen.getByText("综合研判：持有")).toBeDefined();
  });

  it("renders the live client when status is running", async () => {
    mockGetById.mockReturnValue(buildRecord({ status: "running" }));
    const result = await AnalysisPage({
      params: Promise.resolve({ id: "session-1" }),
    });
    render(result);
    expect(screen.getByTestId("live-client")).toBeDefined();
  });

  it("does not render the live client when status is complete", async () => {
    mockGetById.mockReturnValue(buildRecord({ status: "complete" }));
    const result = await AnalysisPage({
      params: Promise.resolve({ id: "session-1" }),
    });
    render(result);
    expect(screen.queryByTestId("live-client")).toBeNull();
  });

  it("renders within a main element", async () => {
    mockGetById.mockReturnValue(buildRecord());
    const result = await AnalysisPage({
      params: Promise.resolve({ id: "session-1" }),
    });
    render(result);
    const main = document.querySelector("main");
    expect(main).toBeInTheDocument();
  });
});
