"use client";
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

  return (
    <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-14">
        {/* Brand + Tabs */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-blue-400 hover:text-blue-300 transition-colors shrink-0"
          >
            AgentTrade
          </Link>

          <div className="flex items-center gap-1">
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
        </div>

        {/* Login placeholder */}
        <button className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors px-3 py-1.5 rounded-md hover:bg-zinc-800/50">
          登录
        </button>
      </div>
    </nav>
  );
}
