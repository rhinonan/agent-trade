import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IndicatorList } from "../IndicatorList";

const MOCK_INDICATORS = {
  ma: {
    "5": 1678.5,
    "10": 1672.3,
    "20": 1665.8,
    "60": 1640.2,
  },
  macd: { dif: 3.21, dea: 2.87, histogram: 0.68 },
  rsi: 75.3,
};

describe("IndicatorList", () => {
  it("renders all MA values", () => {
    render(<IndicatorList indicators={MOCK_INDICATORS} />);
    expect(screen.getByText("1678.50")).toBeDefined();
    expect(screen.getByText("75.30")).toBeDefined();
  });

  it("shows RSI interpretation", () => {
    render(<IndicatorList indicators={MOCK_INDICATORS} />);
    expect(screen.getByText(/接近超买/)).toBeDefined();
  });

  it("shows empty state when no indicators", () => {
    render(<IndicatorList indicators={null} />);
    expect(screen.getByText(/暂无指标数据/)).toBeDefined();
  });
});
