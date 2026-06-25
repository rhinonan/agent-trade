"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
  ColorType,
} from "lightweight-charts";
import type { KlineBar } from "@/lib/data-sdk/types.js";
import { calcMA } from "@/lib/data-sdk/indicators.js";

type Period = "daily" | "weekly" | "monthly";

interface KlineChartProps {
  bars: KlineBar[];
  period: Period;
}

/** A股涨跌颜色 */
const RED = "#ef4444";
const GREEN = "#22c55e";
const BLUE = "#3b82f6";

/** MA 线配置: 周期 → 颜色 */
const MA_CONFIG: { period: number; color: string }[] = [
  { period: 5, color: "#f59e0b" },   // amber
  { period: 10, color: "#06b6d4" },  // cyan
  { period: 20, color: "#a855f7" },  // purple
  { period: 60, color: "#f97316" },  // orange
];

/** 将 "2026-06-20" 转为 lightweight-charts Time (YYYY-MM-DD) */
function toTime(dateStr: string): Time {
  // lightweight-charts 接受 "YYYY-MM-DD" 作为 BusinessDay 字符串
  return dateStr as Time;
}

export function KlineChart({ bars, period }: KlineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const initChart = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    // 计算可用高度：K线区占 65%，量能区占 35%
    const totalHeight = 380;
    const klineHeight = Math.floor(totalHeight * 0.65);
    const volumeHeight = totalHeight - klineHeight;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#a1a1aa", // zinc-400
      },
      grid: {
        vertLines: { color: "rgba(63,63,70,0.3)" },  // zinc-700/30
        horzLines: { color: "rgba(63,63,70,0.3)" },
      },
      crosshair: {
        mode: 0, // normal
        vertLine: { color: "#71717a", style: 2, width: 1, labelVisible: true },
        horzLine: { color: "#71717a", style: 2, width: 1, labelVisible: true },
      },
      rightPriceScale: {
        borderColor: "rgba(63,63,70,0.5)",
        scaleMargins: { top: 0.1, bottom: 0.3 },
      },
      timeScale: {
        borderColor: "rgba(63,63,70,0.5)",
        timeVisible: true,
        secondsVisible: false,
      },
      width: container.clientWidth,
      height: totalHeight,
    });

    // ── K线 (candlestick) ──
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: RED,
      downColor: GREEN,
      borderDownColor: GREEN,
      borderUpColor: RED,
      wickDownColor: GREEN,
      wickUpColor: RED,
      priceScaleId: "right",
    });

    // ── 量能柱 (histogram) ──
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "", // 独立 scale
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    // ── MA 线 (line) ──
    const maSeriesArr: ISeriesApi<"Line">[] = [];
    for (const cfg of MA_CONFIG) {
      const lineSeries = chart.addSeries(LineSeries, {
        color: cfg.color,
        lineWidth: 1,
        priceScaleId: "right",
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      maSeriesArr.push(lineSeries);
    }

    chartRef.current = chart;

    // 保存 series 引用到 chart 对象上以便更新数据时使用
    (chart as any)._candleSeries = candleSeries;
    (chart as any)._volumeSeries = volumeSeries;
    (chart as any)._maSeriesArr = maSeriesArr;

    // ResizeObserver: 响应容器宽度变化
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.resize(entry.contentRect.width, totalHeight);
      }
    });
    observer.observe(container);

    // 保存 observer 以便清理
    (chart as any)._observer = observer;
  }, []);

  // 首次挂载初始化
  useEffect(() => {
    initChart();
    return () => {
      const chart = chartRef.current;
      if (chart) {
        const observer = (chart as any)._observer as ResizeObserver | undefined;
        observer?.disconnect();
        chart.remove();
        chartRef.current = null;
      }
    };
  }, [initChart]);

  // 数据或 period 变化时更新
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !bars.length) return;

    const candleSeries = (chart as any)._candleSeries as ISeriesApi<"Candlestick">;
    const volumeSeries = (chart as any)._volumeSeries as ISeriesApi<"Histogram">;
    const maSeriesArr = (chart as any)._maSeriesArr as ISeriesApi<"Line">[];

    // ── K线数据 ──
    const candleData: CandlestickData[] = bars.map((bar) => ({
      time: toTime(bar.date),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));
    candleSeries.setData(candleData);

    // ── 量能数据 ──
    const volumeData: HistogramData[] = bars.map((bar, i) => ({
      time: toTime(bar.date),
      value: bar.volume,
      color: i > 0 && bar.close >= bars[i - 1].close ? RED + "66" : GREEN + "66",
    }));
    volumeSeries.setData(volumeData);

    // ── MA 线 ──
    const closes = bars.map((b) => b.close);
    for (let i = 0; i < MA_CONFIG.length; i++) {
      const { period: maPeriod } = MA_CONFIG[i];
      const lineSeries = maSeriesArr[i];
      const maValues = calcMA(closes, [maPeriod]);
      const maData: LineData[] = bars
        .map((bar, j) => {
          const val = maValues[String(maPeriod)][j];
          return val != null ? { time: toTime(bar.date), value: val } : null;
        })
        .filter((d): d is LineData => d !== null);
      lineSeries.setData(maData);
    }

    // fit content
    chart.timeScale().fitContent();
  }, [bars, period]);

  if (!bars.length) {
    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 h-[380px] flex items-center justify-center">
        <p className="text-xs text-zinc-600">暂无K线数据</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden">
      <div
        ref={containerRef}
        className="w-full"
        style={{ height: 380 }}
      />
    </div>
  );
}
