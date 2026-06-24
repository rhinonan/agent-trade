# AgentTrade

多 Agent 对抗行情分析框架 —— 基于 Next.js 的全栈 Web 应用，支持自定义分析 Agent、结构化对抗流程、A 股特色分析。

## 设计理念

传统量化分析是单人决策，AgentTrade 是**多人辩论**。

```
不是: 一个模型 → 一个结论
而是: [牛方Agent] ⇄ [熊方Agent] → [裁判Agent] → 综合研判
```

每个 Agent 由 YAML 定义身份和分析框架。Workflow 通过提示词注入角色立场——Agent 本身是中性工具，立场完全取决于调用方给它分配的任务。用户可以通过 Web 界面上传自定义 Agent 和 Workflow。

**引擎由 LangChain/LangGraph 驱动：**
- YAML 定义 → `ChatPromptTemplate` + `StructuredOutputParser` + `createToolCallingAgent`
- Workflow → LangGraph `StateGraph`（支持并行节点、条件边、自由辩论子图）
- Streaming → LangGraph `.stream()` → Socket.IO → 前端渲染

## 架构

```
┌──────────────────────────────────────────────┐
│               Next.js 全栈应用                 │
│                                              │
│  app/              页面 (App Router)           │
│  ├── page.tsx      首页 — 输入股票 + 选择工作流  │
│  ├── analyze/[id]  分析页 — SSR + WebSocket    │
│  ├── roles/        角色管理页 — 上传 YAML       │
│  └── api/          REST API                   │
│                                              │
│  components/       React 组件 (shadcn/ui)      │
│  hooks/            WebSocket 实时 Hook         │
│                                              │
│  lib/                                        │
│  ├── role-loader/  YAML → LangChain 编译       │
│  ├── langgraph/    StateGraph + 辩论子图        │
│  ├── tools/        工具注册 (K线/指标/资金…)     │
│  ├── data/         Python 数据服务客户端         │
│  ├── llm/          LLM Provider Factory       │
│  ├── socket/       Socket.IO 服务端            │
│  └── db/           SQLite 持久化               │
│                                              │
│  server.mjs        Custom Server + Socket.IO   │
└──────────────┬───────────────────────────────┘
               │ HTTP REST
               ▼
┌──────────────────────────────────────────────┐
│   roles/ (YAML 角色定义)                       │
│                                              │
│   ├── agents/     20 内置 Agent YAML          │
│   └── workflows/  4 内置 Workflow YAML        │
└──────────────┬───────────────────────────────┘
               │
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
Step 1: [牛方技术面Agent] → 看多理由 (并行)
Step 2: [熊方技术面Agent] → 看空理由 (并行)
Step 3: [裁判Agent] → 综合研判 + 操作建议
```

### bull-bear-debate — 自由辩论

```
Step 1: [牛方Agent] → 初始论据 (并行)
Step 2: [熊方Agent] → 初始论据 (并行)
Step 3: 自由辩论 (最多10轮，任一方认输即停)
        牛方发言 → 熊方发言 → 检查是否有人认输 → 继续/退出
Step 4: [裁判Agent] → 综合研判 + 操作建议
```

### quick-scan — 快速扫描

```
Step 1: [行情数据Agent] → 价格+成交量 (并行)
Step 2: [舆情Agent] → 市场情绪 (并行)
Step 3: [裁判Agent] → 简要研判
```

### layered — 分层深度分析

```
感知层: [行情] [宏观] [资金] → 并行
分析层: [技术面] [基本面] [估值] [形态] → 依赖感知层
决策层: [量化] [风控] [择时] → 依赖分析层
执行层: [裁判] → 综合研判 + 仓位建议 + 风险提示
```

## 自定义

### 方式一：Web 界面（推荐）

在应用内访问 `/roles` 页面，上传 YAML 文件即可创建自定义 Agent 或 Workflow。上传的角色与用户绑定，即时生效。

### 方式二：文件系统

将 YAML 文件放入对应目录：
- Agent → `roles/agents/my-agent.yaml`
- Workflow → `roles/workflows/my-workflow.yaml`

重启应用后自动加载。

### Agent YAML 示例

```yaml
# roles/agents/my-agent.yaml
id: my-agent
name: 我的分析师
system_prompt: |
  你是一位专业的A股分析师。分析目标：{{target}}。
  请按以下步骤分析：
  1. 关键信号识别
  2. 多空力量对比
  3. 综合判断

tools:
  - kline
  - macd

output_schema:
  conclusion: { type: string, description: "分析结论" }
  confidence: { type: number, min: 0, max: 1 }
  sentiment: { type: string, enum: [bullish, bearish, neutral] }
  reasoning: { type: array, items: string }

model:
  provider: deepseek
  model: deepseek-chat
  temperature: 0.7

max_tool_steps: 5
```

### Workflow YAML 示例

```yaml
# roles/workflows/my-workflow.yaml
name: my-workflow
description: 我的分析流程

nodes:
  # 并行节点（无 depends_on）
  - id: check_tech
    agent: tech-analyst
    prompt: 从技术面分析 {{target}}

  - id: check_fin
    agent: financial-analyst
    prompt: 从基本面分析 {{target}}

  # 汇聚节点（依赖所有并行节点）
  - id: final
    agent: judge
    depends_on: [check_tech, check_fin]
    prompt: |
      综合以下分析，对 {{target}} 做出研判：
      技术面：{{state.check_tech}}
      基本面：{{state.check_fin}}
```

### 辩论型 Workflow

```yaml
nodes:
  - id: bull_init
    agent: tech-analyst
    prompt: 从技术面看多 {{target}}

  - id: bear_init
    agent: tech-analyst
    prompt: 从技术面看空 {{target}}

  - id: debate
    type: debate
    depends_on: [bull_init, bear_init]
    participants:
      - agent: tech-analyst
        role: bull
        first: true
      - agent: tech-analyst
        role: bear
    max_rounds: 10
    stop_when:
      field: yield
      condition: any          # 任一方认输即停
    prompt_template: |
      你是{{role}}方，第{{round}}轮辩论。
      请回应对方观点：{{opponent.last_argument}}
      如果认为对方更有道理，请认输（yield: true）

  - id: judge
    agent: judge
    depends_on: [debate]
    prompt: 综合辩论结果做出最终研判
```

### 变量参考

| 变量 | 可用范围 | 说明 |
|------|----------|------|
| `{{target}}` | 所有 prompt | 分析目标（股票代码） |
| `{{state.<node_id>}}` | 有 depends_on 的节点 | 引用前置节点完整输出 |
| `{{state.<node_id>.<field>}}` | 同上 | 引用输出中的特定字段 |
| `{{role}}` | debate 内部 | 当前发言角色 |
| `{{round}}` | debate 内部 | 当前辩论轮次 |
| `{{opponent.last_argument}}` | debate 内部 | 对方上一轮论点 |

## 项目结构

```
agenttrade/
├── nextjs-app/
│   ├── app/                     Next.js App Router
│   │   ├── layout.tsx           根布局
│   │   ├── page.tsx             首页 (搜索 + 选择工作流)
│   │   ├── analyze/[id]/        分析页面 (SSR + WebSocket)
│   │   ├── roles/               角色管理页
│   │   └── api/                 REST API
│   │       ├── analyze/         分析 API
│   │       ├── roles/           角色管理 API
│   │       └── workflows/       工作流列表
│   ├── components/
│   │   ├── ui/                  shadcn/ui 基础组件
│   │   ├── landing/             首页组件
│   │   └── analysis/            分析页组件
│   ├── hooks/                   React Hooks (WebSocket)
│   ├── lib/
│   │   ├── role-loader/         YAML → LangChain 编译 (schema/loader/repo)
│   │   ├── langgraph/           LanGraph 引擎 (state/nodes/builder/debate/compiler/runner)
│   │   ├── tools/               工具注册 (类型/实现)
│   │   ├── data/                Python 服务 HTTP 客户端
│   │   ├── llm/                 LLM Provider Factory
│   │   ├── chat/                会话管理 (类型/SSE)
│   │   ├── socket/              Socket.IO 服务端
│   │   └── db/                  SQLite 持久化 + 迁移
│   ├── server.mjs               Custom Server
│   ├── package.json
│   └── tsconfig.json
├── roles/                       YAML 角色定义
│   ├── agents/                  20 内置 Agent
│   └── workflows/               4 内置 Workflow
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
| LLM 框架 | LangChain.js + @langchain/langgraph |
| DAG 编排 | LangGraph StateGraph (并行节点、条件边、辩论子图) |
| Agent | YAML 定义 → createToolCallingAgent + AgentExecutor |
| Prompt | ChatPromptTemplate (Jinja2 `{{var}}` 语法) |
| 输出解析 | StructuredOutputParser + Zod schema |
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
