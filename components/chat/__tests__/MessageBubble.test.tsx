import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MessageBubble } from "../MessageBubble.js";

const baseProps = {
  role: "agent" as const,
  senderName: "技术面分析师",
  content: "long text ".repeat(50),
  metadata: {
    type: "analysis" as const,
    analysis: {
      conclusion: "短期均线多头排列，MACD 金叉信号明显，成交量温和放大，技术形态偏向多头。建议关注上方压力位突破情况。短期均线多头排列，MACD 金叉信号明显，成交量温和放大，技术形态偏向多头。建议关注上方压力位突破情况。短期均线多头排列，MACD 金叉信号明显。",
      reasoning: ["均线系统呈多头排列，MA5上穿MA20", "MACD 零轴上方金叉，动能转强", "近5日成交量 > 20日均量"],
      sentiment: "bullish" as const,
      confidence: 0.85,
    },
  },
  timestamp: Date.now(),
};

describe("MessageBubble", () => {
  it("shows truncated content in collapsed state", () => {
    render(<MessageBubble {...baseProps} />);
    const text = screen.getByText(/短期均线多头排列/);
    expect(text.textContent).toBeDefined();
    // Content > 120 chars should be truncated
    expect(screen.getByText(/点击展开/)).toBeDefined();
  });

  it("expands to show full content on click", () => {
    render(<MessageBubble {...baseProps} />);
    fireEvent.click(screen.getByText(/点击展开/));
    expect(screen.getByText(/推理过程/)).toBeDefined();
    expect(screen.getByText(/均线系统呈多头排列/)).toBeDefined();
  });

  it("shows full content without toggle when content is short", () => {
    const shortContent = JSON.stringify({
      conclusion: "短期看多。",
      confidence: 0.8,
      sentiment: "bullish",
      reasoning: ["理由1"],
    });
    render(
      <MessageBubble
        role="agent"
        senderName="Agent"
        content={shortContent}
        metadata={{
          type: "analysis",
          analysis: {
            conclusion: "短期看多。",
            reasoning: ["理由1"],
            sentiment: "bullish" as const,
            confidence: 0.8,
          },
        }}
        timestamp={Date.now()}
      />
    );
    // Short content — no expand toggle
    expect(screen.queryByText(/点击展开/)).toBeNull();
  });

  it("user messages are never truncated", () => {
    const longUserContent = "user text ".repeat(100);
    render(
      <MessageBubble
        role="user"
        senderName="散户"
        content={longUserContent}
        timestamp={Date.now()}
      />
    );
    const el = screen.getByText(new RegExp(longUserContent.slice(0, 50)));
    expect(el.textContent!.length).toBeGreaterThan(100);
    expect(screen.queryByText(/点击展开/)).toBeNull();
  });
});
