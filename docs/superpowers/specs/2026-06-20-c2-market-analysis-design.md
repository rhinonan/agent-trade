# AgentTrade — 多Agent对抗行情分析系统 设计文档

**日期**: 2026-06-20
**状态**: 已确认

---

## 1. 产品定位

半开源 + 商业：核心框架（Agent 引擎、工作流引擎、对抗原语）开源，高级功能/高级 Agent/云端服务商业化。MVP 阶段代码框架先行，CLI 跑通完整分析链，先不对外开放。

### 参考项目
- **Vibe-Trading**：多 Agent 对抗流程
- **ai-hedge-fund**：投资大师思想提炼成 Agent

### 核心差异化
- Agent 自由扩展（实现接口即插件）
- 对抗流程可自定义（原语组合 + 可视化编排）
- 内置 A 股特色 Agent（财报分析、技术面分析等）
- 未来支持社交媒体情绪 Agent（抖音博主观点蒸馏）

---

## 2. 技术栈

| 层 | 技术 | 说明 |
|----|------|------|
| Agent 框架 + 工作流引擎 | TypeScript (Node.js) | 自研核心，基于 LangChain.js |
| LLM 抽象 | LangChain.js | ChatModel 统一接口、Tool 定义、Function Calling、Prompt Template |
| CLI 入口 | TypeScript / Node.js | Commander.js 或等效 |
| Web UI | React（后期） | 可视化工作流编排 + 分析仪表盘 |
| 数据微服务 | Python FastAPI + akshare/baostock | 只做数据抓取和指标计算，不碰 Agent 逻辑 |
| 数据客户端 | @agenttrade/data-client（独立 npm 包） | TypeScript，封装 Python 服务的 HTTP 调用 |
| Monorepo | pnpm workspaces | 多包统一管理 |
| 语言/运行 | TypeScript 5.x / Node.js 20+ | |

### LangChain.js 负责的范围
- ChatModel 统一接口（Anthropic / OpenAI / 国产模型）
- Tool 定义与 Function Calling
- Prompt Template
- AgentExecutor（单个 Agent 的工具调用循环）
- Callbacks / Tracing

### 自研的范围（LangChain 做不了的）
- BaseAgent 接口与注册中心
- 对抗原语（analyze / critique / debate / synthesize / panel / vote）
- 工作流 Builder DSL → JSON DAG
- 状态机调度器
- Agent 间隔离的共享上下文
- HumanAgent 暂停/恢复机制
- 可视化编排编辑器（后期）

---

## 3. 系统架构

```
┌──────────────────────────────────────────────────────────┐
│                    入口层 (CLI / Web UI)                   │
│   analyze 600519 --workflow bull-bear  (个股)              │
│   analyze --sector CPO --workflow roundtable  (板块)       │
├──────────────────────────────────────────────────────────┤
│                    对抗工作流引擎 (自研)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  对抗原语库    │  │  调度器       │  │  辩论上下文     │  │
│  │  analyze     │  │  (状态机)     │  │  (共享内存)    │  │
│  │  critique    │  │              │  │               │  │
│  │  debate      │  │              │  │               │  │
│  │  synthesize  │  │              │  │               │  │
│  │  panel       │  │              │  │               │  │
│  │  vote        │  │              │  │               │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
├──────────────────────────────────────────────────────────┤
│                     Agent 注册中心 (自研)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  BaseAgent   │  │  能力系统     │  │  插件加载器     │  │
│  │  Interface   │  │  capabilities │  │  (动态发现)    │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
├──────────────────────────────────────────────────────────┤
│                 LangChain.js (LLM 抽象层)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  ChatModel   │  │  Tool/       │  │  Callbacks    │  │
│  │  (多Provider) │  │  AgentExecutor│  │  Tracing      │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
├──────────────────────┬───────────────────────────────────┤
│  @agenttrade/data-client     │  Python 数据微服务 (FastAPI)        │
│  (独立 npm 包)       │  akshare / baostock / tulipy       │
│                      │  :9500                             │
└──────────────────────┴───────────────────────────────────┘
```

所有 Agent 运行在同一个 Node 进程内，不搞微服务（除 Python 数据层）。Agent 之间的"对抗"通过共享上下文 + 工作流调度完成。

---

## 4. Agent 模型

### 4.1 BaseAgent 接口

```typescript
// 同一个 Agent 类，通过 persona 产生不同立场的实例
// 例如 TechnicalAnalystAgent 可以实例化为牛方或熊方
interface AgentPersona {
  stance: "bullish" | "bearish" | "neutral";  // 分析立场
  style?: "aggressive" | "balanced" | "conservative";
  description?: string;
}

interface BaseAgent {
  id: string;                          // "technical-analyst"
  name: string;                        // "技术面分析Agent"
  capabilities: Capability[];          // ["technical", "trend", "volume"]
  personality: AgentPersona;           // 分析风格、立场偏好
  tools: StructuredTool[];             // LangChain Tool 定义（Agent 可自主调用）
  
  // 核心方法
  analyze(context: DebateContext): Promise<Analysis>;
  
  // 可选能力标记
  canCritique?: boolean;
  canDebate?: boolean;
}

// Agent 的分析产出
interface Analysis {
  conclusion: string;                    // 结论摘要
  confidence: number;                    // 置信度 0-1
  sentiment: "bullish" | "bearish" | "neutral";
  reasoning: string[];                   // 核心理由
  rawOutput?: string;                    // LLM 原始输出（可选保留）
}
```

### 4.2 Agent 类型

| 类型 | 数据获取方式 | 例子 |
|------|-------------|------|
| **实时型** | 运行时通过 LangChain Tool 自主调用获取 | 技术面（getKline）、财报（getFinancialSummary） |
| **预蒸馏型** | 读取离线已处理好的结构化数据 | 抖音博主情绪（离线管线提前蒸馏，运行时只查摘要） |

### 4.3 Agent 扩展机制

一个新 Agent = 一个目录，放在 `packages/agents/src/` 下：

```
agents/src/
  technical-analyst/
    agent.ts         ← 默认导出 Agent 类
    tools.ts         ← 该 Agent 专用的 LangChain Tool 定义
    prompts.ts       ← System prompt
  financial-analyst/
    agent.ts
    tools.ts
    prompts.ts
  judge/
    agent.ts
    prompts.ts
```

插件加载器自动扫描目录，找到所有实现 `BaseAgent` 的类并注册。社区贡献的 Agent 同样方式加入。未来可支持 npm 包形式分发。

**同一 Agent 类的多实例变体**：通过 persona 参数区分，不需要为牛方/熊方分别写两个 Agent 类。例如 `TechnicalAnalystAgent` 同时注册两个实例：

```typescript
registry.register(new TechnicalAnalystAgent({
  id: "technical-bull",
  personality: { stance: "bullish", style: "optimistic" }
}));
registry.register(new TechnicalAnalystAgent({
  id: "technical-bear",
  personality: { stance: "bearish", style: "skeptical" }
}));
```

工作流匹配时按 `id` 精确匹配，或按 `capabilities` + `personality.stance` 组合匹配。

### 4.4 Agent 匹配模式

工作流定义中支持三种 Agent 匹配模式：

```typescript
// A: 精确匹配（固定 Agent ID）
agents: [{ id: "bullish-technical" }, { id: "bearish-technical" }]

// B: 能力匹配 + 数量约束（圆桌辩论 2~6 个）
match: { capability: "analyst", not: ["judge"] }
count: { min: 2, max: 6 }

// C: 全量匹配（所有注册的 Agent 都上）
match: { capability: "analyst" }
count: "all"
```

CLI 运行时可通过 `--count N` 覆盖数量。

### 4.5 HumanAgent（用户作为散户参与）

系统内置 `HumanAgent`，运行时触发暂停交互：

```typescript
class HumanAgent implements BaseAgent {
  id = "retail-investor";
  name = "散户（用户）";
  capabilities = ["retail", "human", "sentiment"];

  async analyze(context): Promise<Analysis> {
    // 引擎暂停，等待用户输入
    return pauseAndWaitForHuman({
      prompt: "请基于以上Agent的分析，给出你的判断",
      inputFields: ["观点", "置信度 (0-1)", "理由"],
      timeout: null,
    });
  }
}
```

CLI 模式通过终端问答交互，Web 模式通过表单提交。工作流中和其他 Agent 一样使用。

---

## 5. 对抗工作流引擎

### 5.1 对抗原语（6 个内置）+ 2 个组合机制

| 名称 | 类型 | 功能 | 关键参数 |
|------|------|------|----------|
| `analyze` | 原语 | 单个 Agent 独立分析某个命题 | agent, prompt |
| `panel` | 原语 | 多 Agent 并行分析，各自产出 | match, count |
| `critique` | 原语 | Agent A 审阅 Agent B 的结论，找出漏洞 | reviewer, targetStep |
| `debate` | 原语 | 结构化多轮辩论（A→B→A回→B回...） | agents, maxRounds |
| `vote` | 原语 | 多 Agent 投票，给出判断+置信度+理由 | match, count |
| `synthesize` | 原语 | 裁判综合所有分析，产出最终结论 | agent |
| `parallel` | 组合 | 将多个 step 并行执行，等全部完成后继续 | children: Step[] |
| `sequential` | 组合 | 将多个 step 串行执行（默认编排方式） | children: Step[] |

### 5.2 工作流定义（Builder DSL）

```typescript
const bullBearWorkflow = defineWorkflow({
  name: "bull-bear",
  description: "标准牛熊对抗分析"
})
.step("bull-analysis", analyze, {
  agent: { capability: "bullish", topic: "technical" },
  prompt: "从技术面看多 {target}，给出3条核心理由"
})
.step("bear-analysis", analyze, {
  agent: { capability: "bearish", topic: "technical" },
  prompt: "从技术面看空 {target}，给出3条核心理由"
})
.step("cross-critique", parallel, [
  critique({ reviewer: "牛方Agent", targetStep: "bear-analysis" }),
  critique({ reviewer: "熊方Agent", targetStep: "bull-analysis" }),
])
.step("final", synthesize, {
  agent: "judge",
  prompt: "综合双方观点和互驳记录，给出最终研判"
})
.build();
```

Builder `.build()` 产出一个 JSON DAG——可视化编排编辑器和手写 Builder 共享同一 JSON 格式：

```json
{
  "name": "bull-bear",
  "version": "1",
  "steps": [
    { "id": "bull-analysis", "type": "analyze", "agent": {...}, "next": ["cross-critique"] },
    { "id": "bear-analysis", "type": "analyze", "agent": {...}, "next": ["cross-critique"] },
    { "id": "cross-critique", "type": "parallel", "children": [
      { "id": "crit-bull", "type": "critique", ... },
      { "id": "crit-bear", "type": "critique", ... }
    ], "next": ["final"] },
    { "id": "final", "type": "synthesize", ... }
  ]
}
```

### 5.3 分析目标（Target）

系统不限于个股，支持三层分析粒度，统一用 `target` 表达：

```typescript
type TargetType = "stock" | "sector" | "index";

interface AnalysisTarget {
  type: TargetType;
  code: string;             // stock: "600519", sector: "CPO", index: "000001"
  name?: string;            // "贵州茅台" / "光电共封装" / "上证指数"
  market?: "sh" | "sz" | "bj";
}
```

### 5.4 共享上下文（DebateContext）

Agent 只能读不能改别人的原始输出，保证信息链可追溯：

```
ExecutionContext {
  target: { type: "stock", code: "600519", name: "贵州茅台" },
  task: "短期走势研判",
  marketData: { kline, indicators, ... },     // Agent tools 填充
  
  findings: [                                   // 每一步的分析产出
    { step: "bull-analysis", agent: "牛方",
      conclusion: "...", confidence: 0.7, reasoning: [...] },
    ...
  ],
  
  debateRounds: [...]   // debate 原语的对话历史
}
```

### 5.4 工作流扩展

`workflows/` 目录下放自定义工作流，CLI 自动发现：

```
workflows/
  bull-bear.ts         ← 内置
  quick-scan.ts        ← 内置
  my-custom.ts         ← 用户自定义
```

---

## 6. 数据层

### 6.1 Python 数据微服务

```
d2-data/
  main.py                         # FastAPI 入口 :9500
  routers/
    kline.py                      # K线 + 技术指标
    financial.py                  # 财报数据
    market.py                     # 行情快照、北向资金（后期）
    reference.py                  # 股票基本信息、行业分类
    sector.py                     # 板块列表、成分股、资金流向
  services/
    akshare_adapter.py            # akshare 封装（MVP）
    indicator_calc.py             # TA 指标计算
  requirements.txt
  Dockerfile
```

#### MVP API

| 端点 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `GET /kline/{symbol}?period=daily&count=120&adjust=qfq` | K线数据 |
| `GET /kline/{symbol}/indicators?names=MACD,RSI,BOLL,MA` | 技术指标 |
| `GET /financial/{symbol}/summary` | 财报关键指标 |
| `GET /financial/{symbol}/valuation` | 估值指标 (PE/PB/PS/ROE) |
| `GET /reference/{symbol}` | 公司基本信息 |
| `GET /reference/search?keyword=茅台` | 股票搜索 |
| `GET /sector/list` | 板块列表 |
| `GET /sector/{name}/constituents` | 板块成分股 |
| `GET /sector/{name}/flow` | 板块资金流向（后期） |

### 6.2 @agenttrade/data-client（独立 npm 包）

```typescript
// packages/data-client/src/client.ts
import { DataClient } from '@agenttrade/data-client';

const client = new DataClient({ baseUrl: "http://localhost:9500" });

// K线
const klines = await client.kline.get({ symbol: "600519", period: "daily", count: 120 });

// 技术指标
const inds = await client.kline.indicators({ symbol: "600519", names: ["MACD", "RSI"] });

// 财报
const summary = await client.financial.summary("600519");
const valuation = await client.financial.valuation("600519");

// 搜索
const results = await client.reference.search("茅台");

// 板块
const sectors = await client.sector.list();
const constituents = await client.sector.constituents("CPO");
// → [{ symbol: "300394", name: "天孚通信", weight: 0.12 }, ...]
```

独立发布，社区开发者可通过 `npm install @agenttrade/data-client` 在自己的 Agent 开发中使用。

---

## 7. 项目结构（Monorepo）

```
agenttrade/
├── packages/
│   ├── core/                       # @agenttrade/core — Agent框架 + 工作流引擎
│   │   ├── src/
│   │   │   ├── agent/
│   │   │   │   ├── base-agent.ts
│   │   │   │   ├── registry.ts
│   │   │   │   ├── loader.ts
│   │   │   │   └── human-agent.ts
│   │   │   ├── workflow/
│   │   │   │   ├── primitives/
│   │   │   │   │   ├── analyze.ts
│   │   │   │   │   ├── panel.ts
│   │   │   │   │   ├── critique.ts
│   │   │   │   │   ├── debate.ts
│   │   │   │   │   ├── vote.ts
│   │   │   │   │   └── synthesize.ts
│   │   │   │   ├── builder.ts
│   │   │   │   ├── scheduler.ts
│   │   │   │   ├── context.ts
│   │   │   │   └── types.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── agents/                     # @agenttrade/agents — 内置Agent集合
│   │   ├── src/
│   │   │   ├── technical-analyst/
│   │   │   │   ├── agent.ts
│   │   │   │   ├── tools.ts
│   │   │   │   └── prompts.ts
│   │   │   ├── financial-analyst/
│   │   │   │   ├── agent.ts
│   │   │   │   ├── tools.ts
│   │   │   │   └── prompts.ts
│   │   │   ├── judge/
│   │   │   │   ├── agent.ts
│   │   │   │   └── prompts.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── data-client/                # @agenttrade/data-client — Python 服务客户端
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   ├── modules/
│   │   │   │   ├── kline.ts
│   │   │   │   ├── financial.ts
│   │   │   │   ├── market.ts
│   │   │   │   ├── reference.ts
│   │   │   │   └── sector.ts
│   │   │   ├── types.ts
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── cli/                        # @agenttrade/cli — CLI 入口
│       ├── src/
│       │   ├── commands/
│       │   │   ├── analyze.ts
│       │   │   └── workflow.ts
│       │   ├── reporter.ts
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── workflows/                      # 工作流定义（可扩展）
│   ├── bull-bear.ts
│   └── quick-scan.ts
│
├── d2-data/                        # Python 数据微服务
│   ├── main.py
│   ├── routers/
│   ├── services/
│   ├── requirements.txt
│   └── Dockerfile
│
├── docs/superpowers/specs/
├── package.json
├── tsconfig.base.json
└── pnpm-workspace.yaml
```

---

## 8. MVP 范围

### 包含

| 模块 | 内容 |
|------|------|
| **Agent 框架** | BaseAgent 接口、工具系统（LangChain）、插件加载器、HumanAgent |
| **工作流引擎** | 6 个原语、Builder DSL、JSON DAG、状态机、共享上下文 |
| **内置 Agent（3个）** | 技术面分析、财报分析、裁判 |
| **内置工作流（2个）** | bull-bear（多空对抗）、quick-scan（快速扫描） |
| **数据微服务** | K线、技术指标、财报摘要、股票基本信息、板块成分股 |
| **CLI** | `analyze` 命令（个股/板块），终端输出 Markdown 报告 |
| **LLM 支持** | Anthropic + OpenAI（通过 LangChain.js） |

### 不包含（后续迭代）

| 模块 | 说明 |
|------|------|
| 抖音情绪 Agent | 预蒸馏管线 + 离线处理 |
| 资金面/宏观 Agent | 后续增加 |
| 可视化编辑器 | React Flow 拖拽编排 |
| Web UI 仪表盘 | 分析报告可视化 |
| 国产模型支持 | 通义千问/DeepSeek（LangChain 社区集成后自然支持） |
| 实时行情 | 当前 MVP 只用日线 |
| 圆桌辩论工作流 | 3+ Agent 多轮 |
| 回测/评估框架 | Agent 分析准确度评估 |

---

## 9. MVP 终端输出示意

```bash
$ npm run analyze 600519 --workflow bull-bear

🔍 正在分析 600519（贵州茅台）...
   工作流: bull-bear [多空对抗]

📊 Step 1/4: 牛方技术面分析
   匹配 Agent: technical-analyst (bullish)
   ✅ 产出: 看多，置信度 0.72

📉 Step 2/4: 熊方技术面分析
   匹配 Agent: technical-analyst (bearish)
   ✅ 产出: 看空，置信度 0.65

⚔️  Step 3/4: 交叉审阅
   ✅ 牛方审熊方: 指出MACD参数选取可能过于敏感...
   ✅ 熊方审牛方: 质疑上涨量能不足的解读...

📋 Step 4/4: 综合研判
   ✅ 裁判裁决完成

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 分析报告 — 600519 贵州茅台

【综合结论】短期偏多，建议关注

【多空分布】
  看多: 1 (72%)  |  看空: 1 (65%)

【关键论点】
  🟢 牛方：MACD金叉、站上60日均线、量价配合良好
  🔴 熊方：布林带收窄、上方200日均线压制、量能萎缩

【交叉审阅】
  牛方对熊方的回应：260日均线压制确实存在，但...
  熊方对牛方的回应：量能不足难以支撑持续反弹

【裁判建议】维持看多，建议在日线回踩60日均线时介入
                止损设在布林带下轨下方3%

⏱️  耗时: 14.2s  |  LLM调用: 4次  |  花费: ¥0.32
```

板块分析同样流程，输入板块名即可：

```bash
$ npm run analyze --sector CPO --workflow panel

🔍 正在分析 CPO 板块（光电共封装）...
   成分股: 天孚通信、中际旭创、新易盛...

📊 技术面面板 (3 Agent)
   ✅ technical-analyst: 板块整体放量突破...
   ✅ financial-analyst: 成分股Q1业绩普遍超预期...
   ✅ sentiment-analyst: 北向资金连续3日净流入...

📋 综合: CPO短期看多，龙头天孚通信弹性最大
```

```

---

## 10. 后续路线图

| 阶段 | 内容 |
|------|------|
| **Phase 1 (MVP)** | 核心框架 + 3 Agent + 2 工作流 + CLI |
| **Phase 2** | 更多 Agent（资金面、情绪面、宏观）+ 更多工作流模式 |
| **Phase 3** | Web 仪表盘 + 可视化工作流编排编辑器 |
| **Phase 4** | 抖音博主情绪 Agent + 预蒸馏离线管线 |
| **Phase 5** | 商业化：订阅、后台管理、云端服务 |
