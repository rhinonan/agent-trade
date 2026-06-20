# AgentTrade

多 Agent 对抗行情分析框架 —— 可自由扩展的分析 Agent、可自定义的对抗流程、内置 A 股特色分析能力。

## 设计理念

传统量化分析是单人决策，AgentTrade 是**多人辩论**。

```
不是: 一个模型 → 一个结论
而是: [牛方Agent] ⇄ [熊方Agent] → [裁判Agent] → 综合研判
```

每个 Agent 有独立的立场（persona）、能力（capabilities）和工具（tools），在结构化对抗流程中互相审阅、反驳、辩论，最终由裁判 Agent 综合产出结论。

## 架构

```
┌──────────────────────────────────────────┐
│              CLI (analyze 命令)            │
├──────────────────────────────────────────┤
│         工作流引擎 (对抗原语 + 状态机)        │
│   analyze / critique / debate / vote /    │
│   panel / synthesize / parallel           │
├──────────────────────────────────────────┤
│       Agent 注册中心 (可扩展插件)            │
│   技术面 / 财报 / 裁判 / ... (自定义)        │
├──────────────────┬───────────────────────┤
│  LangChain.js    │  Python 数据微服务      │
│  (LLM 抽象)      │  (akshare, :9500)     │
└──────────────────┴───────────────────────┘
```

## 快速开始

### 1. 安装

```bash
pnpm install
pnpm build
```

### 2. 配置

```bash
cp .env.example .env
# 编辑 .env 填入 API Key
```

支持的 LLM Provider:
- **deepseek** (默认) — 设置 `OPENAI_API_KEY`
- **openai** — 设置 `OPENAI_API_KEY`
- **anthropic** — 设置 `ANTHROPIC_API_KEY`

### 3. 启动数据服务

```bash
cd d2-data
pip install -r requirements.txt
python main.py
# → http://localhost:9500
```

### 4. 运行分析

```bash
# 个股多空对抗
pnpm analyze --code 600519 --workflow bull-bear

# 板块快速扫描
pnpm analyze --sector CPO --workflow quick-scan

# 切换模型
pnpm analyze --code 600519 --provider openai --model gpt-4o
```

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
import type { BaseAgent, AgentPersona, Analysis, ExecutionContext } from "@agenttrade/core";

class MyAgent implements BaseAgent {
  id = "my-custom-agent";
  name = "我的分析Agent";
  capabilities = ["custom", "sentiment"];
  personality: AgentPersona = { stance: "neutral" };
  tools = [/* LangChain tools */];
  canCritique = true;

  async analyze(context: ExecutionContext): Promise<Analysis> {
    // 你的分析逻辑
    return {
      conclusion: "...",
      confidence: 0.8,
      sentiment: "bullish",
      reasoning: ["理由1", "理由2"],
    };
  }
}
```

注册到 `packages/agents/src/` 下，在 CLI 中实例化即可使用。

### 写一个新工作流

```typescript
import { defineWorkflow, analyze, debate, synthesize } from "@agenttrade/core";

export const myWorkflow = defineWorkflow({ name: "my-flow" })
  .step("bull", analyze({ agent: { capability: "bullish" }, prompt: "..." }))
  .step("bear", analyze({ agent: { capability: "bearish" }, prompt: "..." }))
  .step("debate", debate({ agents: [{ id: "bull" }, { id: "bear" }], maxRounds: 2 }))
  .step("final", synthesize({ agent: "judge", prompt: "..." }))
  .build();
```

## 项目结构

```
agenttrade/
├── packages/
│   ├── core/            # Agent 框架 + 工作流引擎
│   ├── agents/           # 内置 Agent（技术面、财报、裁判）
│   ├── data-client/      # Python 数据服务客户端（独立 npm 包）
│   └── cli/              # CLI 入口 + 工作流定义
├── d2-data/              # Python 数据微服务
├── docs/superpowers/     # 设计文档 + 实施计划
└── .env.example
```

## 开源协议

核心框架（`packages/core`, `packages/agents`, `packages/data-client`, `packages/cli`）采用 Apache 2.0 协议。

高级功能、专有 Agent 和云端服务为商业许可。

## 参考项目

- [ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) — 投资大师思想提炼成 Agent
- [Vibe-Trading](https://github.com/langchain-ai/vibe-trading) — 多 Agent 对抗流程

## License

[Apache 2.0](LICENSE)
