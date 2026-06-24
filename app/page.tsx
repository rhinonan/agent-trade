import Link from "next/link";

const FEATURES = [
  {
    icon: "🐂🐻",
    title: "多 Agent 对抗",
    desc: "Bull / Bear / Advisor 三方独立分析辩论，减少单模型偏见，输出更客观的研判结论",
  },
  {
    icon: "⚡",
    title: "多工作流模式",
    desc: "快速扫描 / 牛熊对抗 / 四层深度分析，根据场景灵活选择分析深度",
  },
  {
    icon: "📊",
    title: "实时流式可见",
    desc: "Agent 思考过程通过 SSE 实时推送，每一步推理都清晰可见，不是黑盒输出",
  },
];

const TECH_TAGS = ["LangChain", "SSE", "Next.js", "SQLite", "Multi-Agent"];

export default function HomePage() {
  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      {/* ── Hero ── */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 pt-24 pb-12">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-blue-400 text-glow">
          AgentTrade
        </h1>
        <p className="mt-4 text-lg sm:text-xl text-zinc-300 font-medium">
          多 Agent 对抗行情分析
        </p>
        <p className="mt-3 text-zinc-500 max-w-sm sm:max-w-md text-center leading-relaxed">
          基于 LLM 多智能体协作的 A 股深度分析平台，
          让多个 AI 分析师从不同视角审视每一笔交易机会
        </p>
        <Link
          href="/analyze"
          className="mt-8 inline-flex items-center gap-2 px-6 py-3 sm:px-8 sm:py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-lg transition-colors shadow-lg shadow-blue-600/20"
        >
          开始分析
          <span className="text-blue-200">→</span>
        </Link>
      </section>

      {/* ── Feature Cards ── */}
      <section className="max-w-5xl mx-auto w-full px-4 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="glow-hover bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 flex flex-col gap-3"
            >
              <span className="text-3xl">{f.icon}</span>
              <h3 className="text-lg font-semibold text-zinc-100">{f.title}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tech Tags ── */}
      <footer className="pb-8 text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {TECH_TAGS.map((tag) => (
            <span
              key={tag}
              className="px-3 py-1 text-xs rounded-full bg-zinc-900/70 border border-zinc-800 text-zinc-500"
            >
              {tag}
            </span>
          ))}
        </div>
      </footer>
    </div>
  );
}
