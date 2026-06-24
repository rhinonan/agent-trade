"use client";
import { useEffect, useState, useRef } from "react";

interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  timestamp: number;
}

interface QuoteCardProps {
  code: string;
  name?: string | null;
}

export function QuoteCard({ code, name }: QuoteCardProps) {
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [error, setError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchQuote() {
      try {
        const res = await fetch(`/api/quote/${encodeURIComponent(code)}`);
        if (!res.ok) throw new Error("fetch failed");
        const data: QuoteData = await res.json();
        if (!cancelled) {
          setQuote(data);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    fetchQuote();
    timerRef.current = setInterval(fetchQuote, 5000);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [code]);

  const isUp = quote && quote.change >= 0;
  const changeColor = isUp ? "text-red-400" : "text-blue-400";

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium text-blue-400">
            {code}
          </span>
          {name && (
            <span className="text-sm text-zinc-300">{name}</span>
          )}
        </div>
        {error && !quote && (
          <span className="text-xs text-zinc-500">行情数据暂不可用</span>
        )}
      </div>

      {/* Loading */}
      {!quote && !error && (
        <div className="space-y-2 animate-pulse">
          <div className="flex items-center gap-2">
            <div className="h-8 w-32 bg-zinc-800 rounded" />
            <span className="text-xs text-zinc-500">加载中</span>
          </div>
          <div className="h-4 w-20 bg-zinc-800 rounded" />
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-4 bg-zinc-800 rounded" />
            ))}
          </div>
        </div>
      )}

      {/* Data */}
      {quote && (
        <>
          <div>
            <span className="text-2xl font-bold text-zinc-100 tabular-nums">
              {quote.price.toFixed(2)}
            </span>
            <span className={`ml-2 text-sm font-medium tabular-nums ${changeColor}`}>
              {isUp ? "+" : ""}{quote.change.toFixed(2)}
            </span>
            <span className={`ml-1 text-sm tabular-nums ${changeColor}`}>
              ({isUp ? "+" : ""}{quote.changePercent.toFixed(2)}%)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">开盘</span>
              <span className="text-zinc-300 tabular-nums">{quote.open.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">最高</span>
              <span className="text-zinc-300 tabular-nums">{quote.high.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">最低</span>
              <span className="text-zinc-300 tabular-nums">{quote.low.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">成交量</span>
              <span className="text-zinc-300 tabular-nums">
                {quote.volume >= 1e8
                  ? `${(quote.volume / 1e8).toFixed(1)}亿`
                  : `${(quote.volume / 1e4).toFixed(0)}万`}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
