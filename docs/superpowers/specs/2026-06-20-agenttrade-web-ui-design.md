# AgentTrade Web UI — 设计规格

> 日期: 2026-06-20 | 状态: 已确认

## 目标

为 AgentTrade 新增 Web 前端界面。用户在网页上输入股票代码/板块名称，选择工作流和模型，点击执行分析；界面上实时展示工作流整体运行流程，完成后展示分析报告。

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 SPA | Vue 3 + Vite |
| 后端 API | Node.js + Express + ws (新增 `packages/server`) |
| 实时通信 | WebSocket (ws 库) |
| 状态管理 | Pinia |
| 核心引擎 | 复用 `@agenttrade/core` + `@agenttrade/agents` + `@agenttrade/data-client` |

## 架构

```
packages/
├── web/             @agenttrade/web     — Vue 3 SPA 前端
│   └── src/
│       ├── App.vue
│       ├── main.ts
│       ├── stores/          — Pinia stores
│       ├── components/      — Vue 组件
│       └── composables/     — useWebSocket 等
├── server/          @agenttrade/server   — Node.js WebSocket 后端
│   └── src/
│       ├── index.ts         — Express + WS 入口
│       ├── ws-manager.ts    — WebSocket 连接管理
│       └── analyze-handler.ts — 分析执行处理
├── core/            (已有)
├── agents/          (已有)
├── data-client/     (已有)
└── cli/             (已有)
```

## 数据流

```
用户输入 → POST /api/analyze → Server 创建 ExecutionContext
  → WorkflowScheduler.execute() 绑定事件回调
  → 每步通过 WebSocket 推送事件 → 前端实时更新
  → 完成后 WS 推送完整结果 → 前端渲染报告
```

## WebSocket 事件协议

```typescript
type WSEvent =
  | { type: "connected"; payload: { sessionId: string } }
  | { type: "analysis:start"; payload: { target: { type: string; code: string; name?: string }; workflow: string } }
  | { type: "step:start"; payload: { stepId: string; type: string; agentIds: string[] } }
  | { type: "step:complete"; payload: { stepId: string; findings: { agent: string; conclusion: string; sentiment: "bullish"|"bearish"|"neutral"; confidence: number }[] } }
  | { type: "analysis:complete"; payload: { context: ExecutionContext } }
  | { type: "analysis:error"; payload: { stepId?: string; message: string } };
```

## 页面布局

```
┌─────────────────────────────────────────────────┐
│  AgentTrade · 多Agent对抗行情分析                  │
├──────────────┬──────────────────────────────────┤
│  输入面板     │     流程可视化                     │
│  (320px)     │  Step1→Step2→Step3→Step4         │
│  股票代码    │   ✅    🔄     ⏳     ⏳          │
│  板块名称    │  ┌─实时日志───────────────────┐    │
│  工作流选择  │  │ [牛方] 看多理由...          │    │
│  模型选择    │  │ [熊方] 看空理由...          │    │
│              │  │ [裁判] 综合研判中...         │    │
│  [开始分析]  │  └────────────────────────────┘    │
│              ├──────────────────────────────────┤
│              │     分析报告                       │
│              │  多空分布 | 各方观点 | 综合研判     │
└──────────────┴──────────────────────────────────┘
```

## 组件树

```
App.vue
├── AppHeader.vue           — 顶部标题栏
├── InputPanel.vue          — 左侧输入面板 (320px fixed)
│   ├── StockInput.vue      —  股票代码输入
│   ├── SectorInput.vue     —  板块名称输入
│   ├── WorkflowSelect.vue  —  工作流下拉
│   └── ModelSelect.vue     —  Provider + Model 选择
├── FlowView.vue            — 右侧: 流程 + 实时日志
│   ├── StepProgress.vue    —  DAG 步骤进度条
│   └── LiveLog.vue         —  滚动实时日志
└── ReportView.vue          — 底部: 分析报告
    ├── SentimentChart.vue  —  多空分布柱状图
    ├── FindingList.vue     —  各方观点列表
    └── ConclusionCard.vue  —  综合研判卡片
```

## 状态管理 (Pinia)

```typescript
// analysisStore
{
  status: "idle" | "running" | "complete" | "error",
  target: { type, code, name } | null,
  workflow: string | null,
  steps: StepState[],          // { id, type, status, agentIds, summary? }
  logs: { time: number; agent: string; message: string; sentiment?: string }[],
  report: {
    findings: Finding[],
    sentiments: { bullish: number; bearish: number; neutral: number },
    conclusion?: string,
  } | null,
  error: string | null,
}
```

## 流程可视化

每个步骤显示为卡片节点，箭头连接：

- ✅ 绿色 — 已完成，hover 看摘要
- 🔄 蓝色脉冲动画 — 当前运行中
- ⏳ 灰色虚线 — 等待中
- ❌ 红色 — 出错

步骤间通过 CSS 伪元素或 SVG 画箭头连线。

## 错误处理

| 场景 | 前端行为 |
|------|---------|
| 数据服务连接失败 | 输入面板顶部黄色 warning banner |
| 分析执行异常 | 步骤节点变红，日志输出错误信息 |
| WebSocket 断开 | 自动重连（3次），显示 "重连中..." 状态 |
| API Key 未配置 | 顶部红色 error banner，提示配置 .env |

## 路由

单页应用，无需 vue-router。所有功能在一个页面完成。

## 测试策略

- **packages/server**: vitest + supertest 测 HTTP API，mock WebSocket
- **packages/web**: vitest + @vue/test-utils 测组件逻辑
- 不使用 e2e 测试 — MVP 阶段手工验证

## 不与 CLI 耦合

Server 和 CLI 独立运行，各自直接调用 `@agenttrade/core`。两者不互相依赖。
