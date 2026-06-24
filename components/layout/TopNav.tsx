"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "个股分析", href: "/analyze" },
  { label: "行业拆解", href: "/industry" },
  { label: "策略回溯", href: "/backtest" },
  { label: "许愿池", href: "/wishpool" },
  { label: "角色管理", href: "/roles" },
] as const;

export function TopNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Close on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-14">
        {/* Brand */}
        <Link
          href="/"
          className="text-lg font-bold tracking-tight text-blue-400 hover:text-blue-300 transition-colors shrink-0"
        >
          AgentTrade
        </Link>

        {/* Desktop nav items */}
        <div className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  isActive
                    ? "bg-blue-500/10 text-blue-400 font-medium"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Hamburger (mobile only) */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
            aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
          >
            {menuOpen ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M3 5h12M3 9h12M3 13h12" />
              </svg>
            )}
          </button>

          {/* Login (always visible) */}
          <button className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded-md hover:bg-zinc-800/50">
            登录
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div ref={menuRef} className="md:hidden border-b border-zinc-800 bg-zinc-950/95 backdrop-blur-md">
          <div className="px-2 py-2 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-4 py-3 text-sm rounded-lg transition-colors ${
                    isActive
                      ? "bg-blue-500/10 text-blue-400 font-medium"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
