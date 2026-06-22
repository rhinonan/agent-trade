# AgentTrade

多 Agent 对抗行情分析框架 —— 基于 Next.js 的全栈 Web 应用，支持自定义分析 Agent、结构化对抗流程、A 股特色分析。

## 设计理念

传统量化分析是单人决策，AgentTrade 是**多人辩论**。

```
不是: 一个模型 → 一个结论
而是: [牛方Agent] ⇄ [熊方Agent] → [裁判Agent] → 综合研判
```

每个 Agent 有独立的立场（persona）、能力（capabilities）和工具（tools），在结构化对抗流程中互相审阅、反驳、辩论，最终由裁判 Agent 综合产出结论。

## 架构

```
┌──────────────────────────────────────────────┐
│               Next.js 全栈应用                 │
│                                              │
│  app/              页面 (App Router)           │
│  ├── page.tsx      首页 — 输入股票 + 选择工作流  │
│  ├── analyze/[id]  分析页 — SSR + WebSocket    │
│  └── api/          REST API                   │
│                                              │
│  components/       React 组件 (shadcn/ui)      │
│  hooks/            WebSocket 实时 Hook         │
│                                              │
│  lib/                                        │
│  ├── engine/       工作流引擎 + Agent 注册中心   │
│  ├── agents/       内置 Agent (技术面/财报/裁判) │
│  ├── workflows/    工作流定义 (Bull-Bear 等)     │
│  ├── data/         Python 数据服务客户端         │
│  ├── llm/          LLM 抽象层                  │
│  ├── socket/       Socket.IO 服务端            │
│  └── db/           SQLite 持久化               │
│                                              │
│  server.mjs        Custom Server + Socket.IO   │
└──────────────┬───────────────────────────────┘
               │ HTTP REST
               ▼
┌──────────────────────────────────────────────┐
│   d2-data (独立仓库 — Python FastAPI)          │
│                                              │
│   纯数据层，无 Agent 逻辑                       │
│   FastAPI + akshare → 行情 / 财报 / 板块       │
└──────────────────────────────────────────────┘
```

## 快速开始

### 1. 安装

```bash
cd nextjs-app
pnpm install
```

### 2. 配置

```bash
cp .env.example .env
# 编辑 .env 填入 API Key
```

支持的 LLM Provider：

| Provider | 环境变量 | 说明 |
|----------|---------|------|
| **deepseek** (默认) | `OPENAI_API_KEY` | baseURL `https://api.deepseek.com/v1` |
| **openai** | `OPENAI_API_KEY` | 默认模型 `gpt-4o` |
| **anthropic** | `ANTHROPIC_API_KEY` | 默认模型 `claude-sonnet-4-6` |

### 3. 启动数据服务

Python 数据服务已独立为单独仓库 `d2-data`，先启动它：

```bash
cd d2-data
pip install -r requirements.txt
python main.py
# → http://localhost:9500
```

### 4. 启动 Web 应用

```bash
cd nextjs-app
pnpm dev
# → http://localhost:3000
```

### 5. 运行分析

在浏览器中打开 `http://localhost:3000`，输入股票代码，选择工作流，点击"开始分析"即可。

## 工作流

### bull-bear — 多空对抗

```
Step 1: [牛方技术面Agent] → 看多理由
Step 2: [熊方技术面Agent] → 看空理由
Step 3: 交叉审阅 (互相挑刺)
Step 4: [裁判Agent] → 综合研判 + 操作建议
```

### quick-scan — 快速扫描

```
Step 1: [技术面Agent] → 关键信号
Step 2: [基本面Agent] → 估值指标
Step 3: [裁判Agent] → 简要研判
```

## 自定义

### 写一个新 Agent

```typescript
import type { BaseAgent, AgentPersona, Analysis, ExecutionContext } from "@/lib/engine";

class MyAgent implements BaseAgent {
  id = "my-custom-agent";
  name = "我的分析Agent";
  capabilities = ["custom", "sentiment"];
  personality: AgentPersona = { stance: "neutral" };
  tools = [];
  canCritique = true;

  async analyze(context: ExecutionContext): Promise<Analysis> {
    return {
      conclusion: "...",
      confidence: 0.8,
      sentiment: "bullish",
      reasoning: ["理由1", "理由2"],
    };
  }
}
```

注册到 `lib/agents/index.ts` 的 `registerBuiltinAgents()` 中即可使用。

### 写一个新工作流

```typescript
import { defineWorkflow, analyze, debate, synthesize } from "@/lib/engine";

export const myWorkflow = defineWorkflow({ name: "my-flow" })
  .step("bull", analyze({ agent: { capability: "bullish" }, prompt: "..." }))
  .step("bear", analyze({ agent: { capability: "bearish" }, prompt: "..." }))
  .step("debate", debate({ agents: [{ id: "bull" }, { id: "bear" }], maxRounds: 2 }))
  .step("final", synthesize({ agent: "judge", prompt: "..." }))
  .build();
```

注册到 `lib/workflows/index.ts` 的 `WORKFLOWS` 中，API 会自动发现。

## 项目结构

```
agenttrade/
├── nextjs-app/
│   ├── app/                     Next.js App Router
│   │   ├── layout.tsx           根布局
│   │   ├── page.tsx             首页 (搜索 + 选择工作流)
│   │   ├── analyze/[id]/        分析页面 (SSR + WebSocket)
│   │   └── api/                 REST API
│   │       ├── analyze/         启动分析 / 获取结果
│   │       └── workflows/       工作流列表
│   ├── components/
│   │   ├── ui/                  shadcn/ui 基础组件
│   │   ├── landing/             首页组件
│   │   └── analysis/            分析页组件
│   ├── hooks/                   React Hooks (WebSocket)
│   ├── lib/
│   │   ├── engine/              工作流引擎 (类型/注册/调度/原语/DSL)
│   │   ├── agents/              内置 Agent 实现
│   │   ├── workflows/           工作流定义
│   │   ├── data/                Python 服务 HTTP 客户端
│   │   ├── llm/                 LLM 抽象层
│   │   ├── socket/              Socket.IO 服务端
│   │   └── db/                  SQLite 持久化
│   ├── server.mjs               Custom Server
│   ├── package.json
│   └── tsconfig.json
├── docs/
│   └── superpowers/
│       ├── specs/               设计文档
│       └── plans/               实施计划
├── .env.example
└── LICENSE
```

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 15 (App Router) |
| 前端 | React 18 + shadcn/ui + Tailwind CSS 4 |
| 实时通信 | Socket.IO |
| LLM 抽象 | LangChain.js |
| 数据库 | SQLite (better-sqlite3) |
| 测试 | Vitest + @testing-library/react |
| 数据服务 | Python FastAPI + akshare (独立仓库) |

## 开源协议

本项目采用 **GNU Affero General Public License v3.0 (AGPL-3.0)** 协议。

这意味着：
- 你可以自由使用、修改和分发代码
- **如果你将修改后的代码作为网络服务提供给他人使用（SaaS），你必须公开你的修改**
- 这保护了开源生态——社区贡献回馈社区，同时商业使用需要单独授权

想闭源商业化部署？联系我们获取商业许可。

## License

[GNU AGPL 3.0](LICENSE)
