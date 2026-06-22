"use client";
import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { useStockSearch } from "@/hooks/useStockSearch.js";
import type { SearchResult } from "@/lib/data/types.js";

interface StockSearchInputProps {
  value: string;
  onChange: (code: string) => void;
}

export function StockSearchInput({ value, onChange }: StockSearchInputProps) {
  const { results, loading, open, setOpen } = useStockSearch(value);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSelectedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, setOpen]);

  function handleSelect(result: SearchResult) {
    onChange(result.symbol);
    setOpen(false);
    setSelectedIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setSelectedIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="space-y-2 relative">
      <label className="text-sm font-medium text-zinc-400">股票代码</label>
      <div className="relative">
        <Input
          placeholder="输入股票代码，如 600519"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="bg-zinc-900 border-zinc-700 text-zinc-100 text-lg h-12 pr-10"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
            ⏳
          </span>
        )}
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute z-50 w-full bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
          {results.map((r, i) => (
            <button
              key={r.symbol}
              type="button"
              className={`w-full text-left px-4 py-3 hover:bg-zinc-800 transition-colors flex items-center gap-3 ${
                i === selectedIndex ? "bg-zinc-800" : ""
              }`}
              onClick={() => handleSelect(r)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className="text-emerald-400 font-mono text-sm font-medium whitespace-nowrap">
                {r.symbol}
              </span>
              <div className="min-w-0">
                <span className="text-sm text-zinc-200">{r.name}</span>
                {r.industry && (
                  <span className="text-xs text-zinc-500 ml-2">{r.industry}</span>
                )}
              </div>
              {r.marketCap !== undefined && (
                <span className="text-xs text-zinc-600 ml-auto whitespace-nowrap">
                  {r.marketCap >= 1e12
                    ? `${(r.marketCap / 1e12).toFixed(1)}万亿`
                    : r.marketCap >= 1e8
                      ? `${(r.marketCap / 1e8).toFixed(0)}亿`
                      : `${(r.marketCap / 1e4).toFixed(0)}万`}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {open && results.length === 0 && !loading && value.trim().length > 0 && (
        <div className="absolute z-50 w-full bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl px-4 py-3">
          <span className="text-sm text-zinc-500">未找到匹配股票</span>
        </div>
      )}
    </div>
  );
}
