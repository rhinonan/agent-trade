import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Use vi.hoisted so mocks are available in the hoisted vi.mock factory
const { mockSocket, mockIo } = vi.hoisted(() => {
  const on = vi.fn();
  const emit = vi.fn();
  const disconnect = vi.fn();
  const socket = { on, emit, disconnect };
  const io = vi.fn(() => socket);
  return { mockSocket: socket, mockIo: io };
});

vi.mock("socket.io-client", () => ({
  io: mockIo,
}));

import { useAnalysisSocket } from "./useAnalysisSocket";

// Helper: extract handler registered for a given event name
function getHandler(eventName: string): (...args: any[]) => void {
  for (const call of mockSocket.on.mock.calls) {
    if (call[0] === eventName) return call[1];
  }
  throw new Error(`No handler for event "${eventName}"`);
}

describe("useAnalysisSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.on.mockReturnValue(mockSocket); // chainable
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // --- Initial state ---

  it("returns initial disconnected state with empty findings and steps", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    expect(result.current.connected).toBe(false);
    expect(result.current.findings).toEqual([]);
    expect(result.current.steps).toEqual([]);
    expect(result.current.status).toBe("running");
  });

  // --- Connection ---

  it("connects to the /analysis namespace with sessionId", () => {
    renderHook(() => useAnalysisSocket("sess-1"));

    expect(mockIo).toHaveBeenCalledTimes(1);
    const [url, opts] = mockIo.mock.calls[0] as unknown as [string, { transports: string[]; forceNew: boolean }];
    expect(url).toContain("/analysis");
    expect(opts.transports).toContain("websocket");
    expect(opts.forceNew).toBe(true);
  });

  it("sets connected=true and subscribes on connect event", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    act(() => {
      getHandler("connect")();
    });

    expect(result.current.connected).toBe(true);
    expect(mockSocket.emit).toHaveBeenCalledWith("subscribe", {
      sessionId: "sess-1",
    });
  });

  it("sets connected=false on disconnect event", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    act(() => {
      getHandler("connect")();
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      getHandler("disconnect")();
    });
    expect(result.current.connected).toBe(false);
  });

  it("sets connected=false on connect_error event", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    act(() => {
      getHandler("connect_error")();
    });
    expect(result.current.connected).toBe(false);
  });

  // --- analysis:start ---

  it("sets steps for bull-bear workflow on analysis:start", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    act(() => {
      getHandler("analysis:start")({ workflow: "bull-bear" });
    });

    expect(result.current.steps).toEqual([
      { stepId: "bull-analysis", type: "bull-analysis", agentIds: [], status: "pending" },
      { stepId: "bear-analysis", type: "bear-analysis", agentIds: [], status: "pending" },
      { stepId: "cross-critique", type: "cross-critique", agentIds: [], status: "pending" },
      { stepId: "final", type: "final", agentIds: [], status: "pending" },
    ]);
  });

  it("sets steps for quick-scan workflow on analysis:start", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    act(() => {
      getHandler("analysis:start")({ workflow: "quick-scan" });
    });

    expect(result.current.steps).toEqual([
      { stepId: "tech", type: "tech", agentIds: [], status: "pending" },
      { stepId: "fundamental", type: "fundamental", agentIds: [], status: "pending" },
      { stepId: "final", type: "final", agentIds: [], status: "pending" },
    ]);
  });

  it("sets empty steps for unknown workflow on analysis:start", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    act(() => {
      getHandler("analysis:start")({ workflow: "unknown" });
    });

    expect(result.current.steps).toEqual([]);
  });

  // --- step:start ---

  it("updates step status to running on step:start", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    // First set up steps via analysis:start
    act(() => {
      getHandler("analysis:start")({ workflow: "bull-bear" });
    });

    act(() => {
      getHandler("step:start")({
        stepId: "bull-analysis",
        agentIds: ["bull-001"],
      });
    });

    const step = result.current.steps.find((s) => s.stepId === "bull-analysis");
    expect(step?.status).toBe("running");
    expect(step?.agentIds).toEqual(["bull-001"]);
  });

  // --- step:complete ---

  it("updates step status to complete on step:complete", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    act(() => {
      getHandler("analysis:start")({ workflow: "bull-bear" });
    });

    act(() => {
      getHandler("step:complete")({ stepId: "bull-analysis" });
    });

    const step = result.current.steps.find((s) => s.stepId === "bull-analysis");
    expect(step?.status).toBe("complete");
  });

  it("appends findings from step:complete payload", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    act(() => {
      getHandler("step:complete")({
        stepId: "bull-analysis",
        findings: [
          {
            agent: "bull",
            conclusion: "Strong uptrend",
            sentiment: "bullish",
            confidence: 0.85,
          },
        ],
      });
    });

    expect(result.current.findings).toHaveLength(1);
    expect(result.current.findings[0]).toMatchObject({
      step: "bull-analysis",
      agent: "bull",
      conclusion: "Strong uptrend",
      sentiment: "bullish",
      confidence: 0.85,
    });
    expect(result.current.findings[0].timestamp).toBeGreaterThan(0);
  });

  it("batches multiple findings from a single step:complete", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    act(() => {
      getHandler("step:complete")({
        stepId: "cross-critique",
        findings: [
          { agent: "bull", conclusion: "a", sentiment: "bullish", confidence: 0.8 },
          { agent: "bear", conclusion: "b", sentiment: "bearish", confidence: 0.7 },
        ],
      });
    });

    expect(result.current.findings).toHaveLength(2);
  });

  // --- analysis:complete ---

  it("sets status to complete on analysis:complete", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    act(() => {
      getHandler("analysis:complete")({ context: {} });
    });

    expect(result.current.status).toBe("complete");
  });

  it("replaces findings from analysis:complete context", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    const finalFindings = [
      { agent: "judge", conclusion: "Neutral", sentiment: "neutral", confidence: 0.5 },
    ];

    act(() => {
      getHandler("analysis:complete")({ context: { findings: finalFindings } });
    });

    expect(result.current.findings).toEqual(finalFindings);
  });

  it("does not replace findings when context.findings absent on complete", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    // First add a finding via step:complete
    act(() => {
      getHandler("step:complete")({
        stepId: "step-1",
        findings: [
          { agent: "bull", conclusion: "Uptrend", sentiment: "bullish", confidence: 0.8 },
        ],
      });
    });

    // Then complete without context.findings
    act(() => {
      getHandler("analysis:complete")({ context: {} });
    });

    expect(result.current.findings).toHaveLength(1);
    expect(result.current.status).toBe("complete");
  });

  // --- analysis:error ---

  it("sets status to error on analysis:error", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    act(() => {
      getHandler("analysis:error")();
    });

    expect(result.current.status).toBe("error");
  });

  // --- step:error (no-op) ---

  it("does not crash on step:error", () => {
    const { result } = renderHook(() => useAnalysisSocket("sess-1"));

    expect(() => {
      act(() => {
        getHandler("step:error")({ stepId: "step-1", error: "Something broke" });
      });
    }).not.toThrow();

    // State unchanged
    expect(result.current.status).toBe("running");
  });

  // --- Unmount cleanup ---

  it("disconnects socket on unmount", () => {
    const { unmount } = renderHook(() => useAnalysisSocket("sess-1"));

    unmount();

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  // --- Re-render with same sessionId does not reconnect ---

  it("does not create a new socket on re-render with same sessionId", () => {
    const { rerender } = renderHook(
      ({ sessionId }) => useAnalysisSocket(sessionId),
      { initialProps: { sessionId: "sess-1" } },
    );

    expect(mockIo).toHaveBeenCalledTimes(1);

    rerender({ sessionId: "sess-1" });

    // connect() is memoized, so no extra io() call
    expect(mockIo).toHaveBeenCalledTimes(1);
  });
});
