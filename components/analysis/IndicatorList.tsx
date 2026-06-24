"use client";
import { useState } from "react";

interface IndicatorData {
  ma: Record<string, number>;
  macd: { dif: number; dea: number; histogram: number };
  rsi: number;
}

interface IndicatorListProps {
  indicators: IndicatorData | null;
}

function rsiLabel(rsi: number): string {
  if (rsi >= 80) return "超买";
  if (rsi >= 70) return "接近超买";
  if (rsi >= 50) return "偏强";
  if (rsi >= 30) return "偏弱";
  if (rsi >= 20) return "接近超卖";
  return "超卖";
}

function rsiColor(rsi: number): string {
  if (rsi >= 70) return "text-red-400";
  if (rsi <= 30) return "text-blue-400";
  return "text-zinc-300";
}

export function IndicatorList({ indicators }: IndicatorListProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (!indicators) {
    return (
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-zinc-400">技术指标</h3>
        </div>
        <p className="text-xs text-zinc-600">暂无指标数据</p>
      </div>
    );
  }

  const maEntries = Object.entries(indicators.ma).sort(
    ([a], [b]) => Number(a) - Number(b)
  );

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h3 className="text-sm font-medium text-zinc-400">技术指标</h3>
        <span className="text-xs text-zinc-600">
          {collapsed ? "展开" : "收起"}
        </span>
      </div>

      {!collapsed && (
        <>
          {/* MA */}
          <div className="space-y-1">
            <span className="text-xs text-zinc-500">移动平均线 (MA)</span>
            <div className="grid grid-cols-4 gap-1">
              {maEntries.map(([period, value]) => (
                <div key={period} className="text-center">
                  <div className="text-xs text-zinc-500">MA{period}</div>
                  <div className="text-sm text-zinc-200 tabular-nums font-mono">
                    {value.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-zinc-600 mt-1">
              {indicators.ma["5"] > indicators.ma["20"] ? "多头排列" : "空头排列"}
            </div>
          </div>

          {/* MACD */}
          <div className="space-y-1 border-t border-zinc-800 pt-3">
            <span className="text-xs text-zinc-500">MACD</span>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div>
                <div className="text-xs text-zinc-500">DIF</div>
                <div className="text-sm text-zinc-200 tabular-nums font-mono">
                  {indicators.macd.dif.toFixed(4)}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">DEA</div>
                <div className="text-sm text-zinc-200 tabular-nums font-mono">
                  {indicators.macd.dea.toFixed(4)}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">柱</div>
                <div
                  className={`text-sm tabular-nums font-mono ${
                    indicators.macd.histogram >= 0
                      ? "text-red-400"
                      : "text-blue-400"
                  }`}
                >
                  {indicators.macd.histogram.toFixed(4)}
                </div>
              </div>
            </div>
            <div className="text-xs text-zinc-600">
              {indicators.macd.dif > indicators.macd.dea ? "DIF 上穿 DEA" : "DIF 下穿 DEA"}
            </div>
          </div>

          {/* RSI */}
          <div className="space-y-1 border-t border-zinc-800 pt-3">
            <span className="text-xs text-zinc-500">RSI (14)</span>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold tabular-nums font-mono ${rsiColor(indicators.rsi)}`}>
                {indicators.rsi.toFixed(2)}
              </span>
              <span className={`text-xs ${rsiColor(indicators.rsi)}`}>
                {rsiLabel(indicators.rsi)}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
