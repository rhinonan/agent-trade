import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/layout/TopNav.js";

export const metadata: Metadata = {
  title: "AgentTrade",
  description: "多Agent对抗行情分析",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <TopNav />
        {children}
      </body>
    </html>
  );
}
