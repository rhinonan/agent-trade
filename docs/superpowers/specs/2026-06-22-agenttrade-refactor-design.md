# AgentTrade 架构重构设计

**日期:** 2026-06-22  
**状态:** 已确认

## 概述

将 AgentTrade 从多包 pnpm monorepo（6 个 TS 包 + 1 个 Python 服务）重构为两个独立仓库：一个 Next.js 全栈应用 + 一个 Python 数据微服务。

## 核心决策

| 决策 | 选择 |
|------|------|
| SSR 框架 | Next.js (App Router) |
| TS 包合并 | 全部合并到 Next.js `lib/` 下，零内部包边界 |
| 前端组件 | shadcn/ui + Tailwind CSS |
| 实时通信 | Socket.IO（挂在 Next.js Custom Server） |
| 分析入口 | 纯 Web 界面，去掉 CLI |
| 数据持久化 | SQLite (better-sqlite3) |
| Python 服务 | 独立仓库，HTTP REST 通信 |

## 仓库划分

```
仓库 1: agenttrade (Next.js 全栈应用)
仓库 2: d2-data (Python FastAPI 数据微服务，独立维护)
```

## 目标目录结构

```
agenttrade/
├── app/                          Next.js App Router
│   ├── layout.tsx                RootLayout (Header + 全局样式)
│   ├── page.tsx                  LandingPage (搜索股票 + 选择工作流)
│   ├── analyze/[id]/page.tsx     AnalysisPage (SSR + WebSocket 实时)
│   ├── api/analyze/
│   │   ├── route.ts              POST — 启动分析
│   │   └── [id]/route.ts         GET — 获取分析结果/状态
│   └── globals.css
│
├── components/                   React 组件
│   ├── ui/                       shadcn/ui 基础组件
│   ├── landing/
│   │   ├── StockSearchInput.tsx  股票代码搜索 + 自动补全
│   │   └── WorkflowSelector.tsx  工作流选择器
│   └── analysis/
│       ├── AnalysisHeader.tsx    股票名/代码 + 工作流 + 状态
│       ├── StepProgress.tsx      步骤进度条 (WebSocket 驱动)
│       ├── LiveDebatePanel.tsx   Agent 辩论实时流
│       ├── AgentBubble.tsx       单条 Agent 消息气泡
│       ├── DebateRound.tsx       一轮辩论 (牛→熊→审阅)
│       └── ConclusionCard.tsx    裁判综合研判 + 操作建议
│
├── hooks/
│   ├── useAnalysisSocket.ts     Socket.IO 客户端 hook
│   └── useAnalysis.ts           分析状态管理 hook
│
├── lib/
│   ├── engine/                   工作流引擎 (原 @agenttrade/core)
│   │   ├── types.ts             核心类型定义
│   │   ├── registry.ts          AgentRegistry
│   │   ├── scheduler.ts         工作流调度器 (DAG 拓扑)
│   │   ├── builder.ts           工作流 DSL
│   │   ├── context.ts           ExecutionContext (不可变)
│   │   ├── primitives/          工作流原语
│   │   │   ├── analyze.ts
│   │   │   ├── critique.ts
│   │   │   ├── debate.ts
│   │   │   ├── panel.ts
│   │   │   ├── synthesize.ts
│   │   │   └── parallel.ts
│   │   └── index.ts
│   ├── agents/                  内置 Agent 实现 (原 @agenttrade/agents)
│   │   ├── base.ts              Agent 接口 + 基础类
│   │   ├── technical.ts         技术面
│   │   ├── fundamental.ts       基本面
│   │   ├── judge.ts             裁判
│   │   └── index.ts             注册入口
│   ├── workflows/               工作流定义 (原 CLI workflows)
│   │   ├── bull-bear.ts
│   │   └── quick-scan.ts
│   ├── data/                    Python 服务 HTTP 客户端
│   │   ├── client.ts            基础 HTTP 客户端
│   │   └── types.ts             响应类型定义
│   ├── llm/                     LLM 抽象层
│   │   ├── create-llm.ts        工厂函数
│   │   ├── providers.ts         deepseek/openai/anthropic
│   │   └── parse.ts             parseLLMJson()
│   ├── socket/                  Socket.IO 层
│   │   ├── server.ts            服务端初始化
│   │   └── events.ts            事件名常量 + 类型
│   └── db/                      数据持久化
│       ├── client.ts            SQLite 连接
│       └── analysis-repo.ts     CRUD 操作
│
├── server.ts                     Next.js Custom Server + Socket.IO
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── vitest.config.ts
```

## 组件树 & 数据流

```
app/layout.tsx                    ← RootLayout
├── app/page.tsx                  ← LandingPage
│   ├── StockSearchInput
│   ├── WorkflowSelector
│   └── StartButton → POST /api/analyze → redirect /analyze/:id
│
└── app/analyze/[id]/page.tsx     ← AnalysisPage
    ├── AnalysisHeader
    ├── StepProgress              ← WebSocket: step:start / step:complete
    ├── LiveDebatePanel           ← WebSocket: debate:round
    │   ├── AgentBubble
    │   └── DebateRound
    └── ConclusionCard            ← WebSocket: complete / SSR 读 DB
```

**数据流：**
1. 用户输入 → `POST /api/analyze` → 创建 `analysisId` → `lib/engine/scheduler` 启动
2. 调度器按 DAG 步骤执行，每步完成通过 Socket.IO emit 事件
3. 客户端 `useAnalysisSocket(analysisId)` 接收事件 → 更新 React state → 驱动 UI 更新
4. 完成后结果写入 SQLite，页面刷新时 SSR 直接从 DB 读取渲染

## SSR 策略

- `/` 首页：纯静态 SSR，无数据依赖，秒开
- `/analyze/:id`：首屏 SSR 从 SQLite 读取已有数据渲染；客户端 hydration 后 WebSocket 接管实时增量更新
- 分析完成后状态持久化，完整分析结果可被搜索引擎索引

## 关键设计原则

1. **ExecutionContext 不可变** — `addFinding()` 等返回新对象，保证并行安全
2. **Agent 注册在启动时完成** — `server.ts` 中 `registerBuiltinAgents(registry)`，不走文件发现
3. **LLM 调用统一通过 `createLLM()`** — 不直接调厂商 SDK
4. **Python 服务是纯数据层** — 无 Agent 逻辑，通过 HTTP REST 调用
5. **零内部包边界** — 所有代码在 `lib/` 下，TypeScript path alias `@/lib/*`

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js (App Router) |
| 语言 | TypeScript 5.x, strict mode |
| UI | React 18 + shadcn/ui + Tailwind CSS 4 |
| 实时 | Socket.IO |
| LLM | LangChain.js (抽象层) |
| 数据库 | SQLite (better-sqlite3) |
| 测试 | Vitest + @testing-library/react |
| 包管理 | pnpm |

## 迁移范围

| 源 | 目标 |
|----|------|
| `packages/core/src/**` | `lib/engine/` |
| `packages/agents/src/**` | `lib/agents/` |
| `packages/data-client/src/**` | `lib/data/` |
| `packages/server/src/workflows/**` | `lib/workflows/` |
| `packages/cli/src/workflows/**` | `lib/workflows/` |
| `packages/web/src/components/**` | React 重写 (Vue → React) |
| `packages/server/src/analyze/**` | `app/api/analyze/` + `lib/socket/` |
| `d2-data/**` | 独立仓库（不迁移，抽取） |

## 不保留的

- `packages/cli/` — CLI 入口，去掉
- `packages/server/` — NestJS，替换为 Next.js API Route
- `packages/web/` — Vue SPA，重写为 React + SSR
- pnpm workspaces — 单应用，不需要 workspace 编排
