# 财报多空对决 — 设计文档

## 概述

将现有的"牛熊辩论"（bull-bear-debate）升级为"财报多空对决"，以基本面分析替代技术面分析，实现深度财报驱动的多空自由辩论。

**核心变化：**

| 维度 | 旧（牛熊辩论） | 新（财报多空对决） |
|------|-------------|----------------|
| 分析视角 | 技术面（MACD/均线/K线） | 基本面（财报/估值/商业模式） |
| 辩论 agent | tech-analyst × 2 | earnings-bull + earnings-bear |
| 数据来源 | kline/macd/rsi | web_search + financial_data |
| 首发方 | 固定多方先发 | 财报超预期→多方先发，低于→空方先发 |
| 结论 agent | judge（裁判研判+操作建议） | narrator（旁白总结+开放式问题+风险提示） |
| 轮次上限 | 10 | 50 |
| 名称 | 牛熊辩论 | 财报多空对决 |

**目标品质参考**：项目根目录下的 `澜起科技多空辩论完整对话记录.md` 和 `兆易创新多空辩论完整对话记录.md`。

---

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                earnings-debate workflow                  │
├──────────────┬──────────────────┬───────────────────────┤
│   Phase 1    │     Phase 2      │       Phase 3         │
│  财报数据收集  │   多空自由辩论     │      旁白总结          │
│              │                  │                       │
│ earnings-    │ earnings-bull    │                       │
│ researcher   │   ↕ max 50轮     │    narrator           │
│   agent      │ earnings-bear    │     agent             │
│              │                  │                       │
│ tools:       │ tools:           │  tools: none          │
│ web_search   │ web_search       │  (纯文本加工)          │
│ financial_   │ financial_data   │                       │
│   data       │ get-news         │                       │
│ get-news     │                  │                       │
│ get-announce │                  │                       │
│   ment       │                  │                       │
│              │                  │                       │
│ 产出 → ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘                      │
│ earnings_brief                                           │
│ meets_expectations (→决定首发方)                           │
│ key_metrics                                              │
└─────────────────────────────────────────────────────────┘
```

**数据流：**
1. Phase 1 → 产出结构化财报简报 + `meets_expectations` 布尔值
2. Phase 2 → 读取 `meets_expectations` 动态分配首发方，展开自由辩论
3. Phase 3 → 读取完整辩论记录，产出口语化总结

---

## Agent 设计

### 1. `earnings-researcher` — 财报研究员

**文件：** `roles/agents/earnings-researcher.yaml`

**职责：** 搜集最新财报数据、机构一致预期、行业背景，判断是否超预期。

**工具：**
- `web_search` — 火山引擎联网搜索（雪球/头条/东财/公告原文）
- `financial_data` — 利润表、资产负债表
- `get-news` — 东财个股新闻
- `get-announcement` — 巨潮公告

**System Prompt 核心框架：**
1. 搜索目标公司最新季度/年度财报核心数据
2. 搜索机构一致预期（各券商预测均值）
3. 对比实际 vs 预期 → 输出 `meets_expectations`
4. 整理结构化简报

**输出 Schema：**
```yaml
earnings_brief: string       # 财报核心数据摘要
meets_expectations: boolean  # true=符合或超预期, false=低于预期
key_metrics: object          # { revenue, net_profit, gross_margin, yoy_revenue, yoy_profit, ... }
```

**max_tool_steps:** 8（需要多轮搜索才能收集完整）

---

### 2. `earnings-bull` — 财报多方

**文件：** `roles/agents/earnings-bull.yaml`

**职责：** 从财报数据出发，构建看多逻辑。寻找积极信号并在辩论中坚定输出。

**工具：**
- `web_search` — 搜索正面解读、行业利好
- `financial_data` — 补充财务数据
- `get-news` — 搜索正面新闻

**System Prompt 核心要素：**
- 角色定位：资深买方基金经理，15年A股投资经验，擅长在财报中挖掘被市场低估的积极信号
- 分析维度：营收质量、利润增速可持续性、毛利率提升动因、现金流质量、行业景气上行、竞争壁垒、新产品放量、管理层的积极信号
- 辩论策略：引用具体数字而非泛泛而谈，当对方数据错误时精准指出，当对方论据确实有力时需诚实面对
- 风格：信息密度高，每次发言300-500字，像投委会上的基金经理

**输出 Schema：**
```yaml
argument: string       # 本轮论点
counter_to: string     # 反驳对方哪一点
confidence: number     # 0-1 对本轮论点的信心
yield: boolean         # 是否认输
```

---

### 3. `earnings-bear` — 财报空方

**文件：** `roles/agents/earnings-bear.yaml`

**职责：** 从财报数据出发，构建看空逻辑。挖掘风险信号并用数据支撑。

**工具：**
- `web_search` — 搜索负面解读、行业风险
- `financial_data` — 补充财务数据
- `get-news` — 搜索负面新闻

**System Prompt 核心要素：**
- 角色定位：资深卖方分析师转独立研究，以"排雷"著称，曾在浑水、香橼等机构任职
- 分析维度：毛利率可持续性质疑、库存异常、应收账款风险、现金流质量、一次性收益/非经常性损益、客户集中度、关联交易、行业周期位置、估值透支
- 辩论策略：用冷冰冰的数据而非情绪化表述，将多方描绘的美好图景拉回现实，当多方论证确实站得住脚时需诚实面对
- 风格：犀利但不失理性，每次发言300-500字

**输出 Schema：** 同 earnings-bull

---

### 4. `narrator` — 旁白

**文件：** `roles/agents/narrator.yaml`

**职责：** 读取完整辩论记录，提炼核心分歧，以口语化风格做开放式总结。

**工具：** 无（纯文本加工，不调用外部服务）

**System Prompt 核心要素：**
- 角色定位：财经纪录片旁白，类似《激荡三十年》或《华尔街》纪录片的叙事风格
- 任务：总结双方核心分歧 → 提炼3-5个对投资者最关键的思考问题 → 开放式问题结尾 → 风险提示
- 风格：通俗但不失专业，有叙事节奏感

**输出 Schema：**
```yaml
summary: string        # 核心分歧总结
key_questions: array   # 3-5个关键思考问题
closing: string        # 开放式结尾
disclaimer: string     # 风险提示
```

---

## Workflow 设计

**文件：** `roles/workflows/earnings-debate.yaml`（替换 `bull-bear-debate.yaml`）

```yaml
name: earnings-debate
description: 财报多空对决 — 自动搜集财报数据，超预期多方先发/低于预期空方先发，深度自由辩论，旁白总结
version: "1.0"

nodes:
  - id: research
    agent: earnings-researcher
    prompt: |
      请搜索 {{target}} 的最新财报数据，完成以下任务：

      1. 搜索最新季度/年度财报核心数据：营收、净利润、扣非净利润、
         毛利率、净利率、ROE、经营现金流、资产负债率、存货周转
      2. 搜索机构一致预期（各券商对营收/利润的预测均值）
      3. 对比实际业绩 vs 机构预期，判断是否超预期
      4. 搜索行业背景和近期重大事件
      5. 整理成一份财报简报

  - id: debate
    type: debate
    depends_on: [research]
    participants:
      - agent: earnings-bull
        role: 多方
      - agent: earnings-bear
        role: 空方
    max_rounds: 50
    stop_when:
      field: yield
      condition: any
    prompt_template: |
      你是{{role}}分析师。当前是第{{round}}轮辩论。

      ## 财报数据基础
      {{state.research}}

      ## 对方上一轮观点
      {{opponent.last_argument}}

      ## 你的任务
      1. 针对对方论点进行精准反驳（如果对方数据有误，直接指出正确数据）
      2. 引用具体的财务数据支撑你的立场
      3. 从新的角度展开论述（业务模式、竞争格局、估值逻辑、行业周期等）
      4. 如果对方论据更有说服力，可以认输（yield: true）

      ## 要求
      - 每次发言300-500字，信息密度要高
      - 必须引用具体数字，不能泛泛而谈
      - 风格：像两位资深基金经理在投委会上辩论

  - id: narrator
    agent: narrator
    depends_on: [debate]
    prompt: |
      辩论已结束。结束原因：{{debate.stop_reason}}，共{{debate.total_rounds}}轮。

      完整辩论记录：
      {{debate.messages}}

      请完成以下任务：
      1. 用通俗易懂的口语总结双方核心分歧点
      2. 提炼出对投资者最有价值的3-5个关键问题
      3. 以开放式问题结尾
      4. 附加风险提示："以上仅为商业逻辑拆解，不构成任何投资建议，投资有风险，决策需谨慎。"
```

### 首发方动态分配

`debate.ts` 需修改以支持从 state 动态读取首发方：

```
当前行为：participants[].first: true → 硬编码首发方
新行为：  读取 state.findings.research.meets_expectations
         true  → 多方首发
         false → 空方首发
```

**实现方式：** 在 `buildDebateSubgraph` 中增加对 state 的检查逻辑，在构建 p1/p2 时根据 `meets_expectations` 动态排序。

### 新增模板变量

| 变量 | 解析位置 | 用途 |
|------|---------|------|
| `{{debate.stop_reason}}` | nodes.ts → resolveStateVariables | narrator 获知辩论为何结束 |
| `{{debate.total_rounds}}` | nodes.ts → resolveStateVariables | narrator 获知辩论总轮数 |
| `{{debate.messages}}` | nodes.ts → resolveStateVariables | narrator 读取完整对话记录 |
| `{{opponent.last_argument}}` | debate.ts → resolveDebateTemplate | 已存在，debate speaker 专用 |

---

## 工具：火山引擎联网搜索

**文件：** `lib/tools/web-search.ts`（新建）

### API 规范

| 项目 | 值 |
|------|-----|
| Endpoint | `https://api.volcengine.com/web_search/v1/query` |
| Method | POST |
| Auth | `Authorization: Bearer <WEB_SEARCH_API_KEY>` |
| Content-Type | application/json |

### 请求体

```json
{
  "query": "搜索关键词",
  "stream": false,
  "count": 10
}
```

### 响应体（预期结构）

```json
{
  "results": [
    {
      "title": "结果标题",
      "url": "https://...",
      "snippet": "内容摘要",
      "source": "来源",
      "published_at": "发布时间"
    }
  ]
}
```

### ToolDefinition 封装

```typescript
// lib/tools/web-search.ts
export const webSearchTool: ToolDefinition = {
  name: "web-search",
  description: "联网搜索最新信息，覆盖雪球/头条/东方财富等中文财经来源。用于获取财报数据、市场解读、行业动态等时效性信息。",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "搜索关键词" }
    },
    required: ["query"]
  },
  async execute(params, ctx) {
    const apiKey = process.env.WEB_SEARCH_API_KEY;
    if (!apiKey) return JSON.stringify({ error: "WEB_SEARCH_API_KEY not configured" });

    const response = await fetch("https://api.volcengine.com/web_search/v1/query", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        query: params.query,
        stream: false,
        count: 10
      })
    });

    const data = await response.json();
    return JSON.stringify(data);
  }
};
```

### 环境变量

`.env` 中新增：
```
WEB_SEARCH_API_KEY=your_volcengine_api_key
```

---

## 工程改动清单

### 新建文件

| 文件 | 说明 |
|------|------|
| `roles/agents/earnings-researcher.yaml` | 财报研究员 agent |
| `roles/agents/earnings-bull.yaml` | 财报多方 agent |
| `roles/agents/earnings-bear.yaml` | 财报空方 agent |
| `roles/agents/narrator.yaml` | 旁白 agent |
| `roles/workflows/earnings-debate.yaml` | 财报多空对决 workflow |
| `lib/tools/web-search.ts` | 火山引擎联网搜索工具 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `lib/tools/index.ts` | 注册 `web-search` 工具到 `toolsByName` |
| `lib/langgraph/debate.ts` | 支持从 state 动态读取首发方；新增 `{{debate.messages}}` 等变量 |
| `lib/langgraph/nodes.ts` | 新增 `{{debate.stop_reason}}`、`{{debate.total_rounds}}`、`{{debate.messages}}` 模板变量解析 |
| `lib/langgraph/state.ts` | 新增 `total_rounds: number` 字段 |
| `.env.example` | 新增 `WEB_SEARCH_API_KEY` |

### 删除文件

| 文件 | 原因 |
|------|------|
| `roles/workflows/bull-bear-debate.yaml` | 被 earnings-debate 替换 |
| `roles/workflows/bull-bear.yaml` | 旧牛熊分析，财报多空对决替代其功能 |

**注意：** 不删除 `tech-analyst`、`judge` 等 agent（其他 workflow 可能还在使用）。

### Web UI 改动

- Workflow 选择器中"牛熊辩论"的展示名称改为"财报多空对决"
- workflow 选择逻辑中 `bull-bear-debate` → `earnings-debate`
- 不需要新增 UI 组件

---

## 测试策略

### 单元测试

| 测试对象 | 内容 |
|---------|------|
| `web-search` tool | Token 解析、请求构造、错误处理 |
| `debate.ts` 首发方动态分配 | mock state，验证 meets_expectations=true/false 时首发方正确 |
| 模板变量解析 | 验证 `{{debate.stop_reason}}` 等新变量正确插值 |
| Agent YAML schema 校验 | 4 个新 agent + 1 个新 workflow 通过 Zod 校验 |

### 集成测试

| 场景 | 验证点 |
|------|--------|
| 正常辩论 | research → debate → narrator 全流程跑通 |
| 超预期首发 | meets_expectations=true → 多方先发言 |
| 低预期首发 | meets_expectations=false → 空方先发言 |
| 辩论认输 | 一方 yield=true → 辩论终止 → narrator 正常输出 |
| 满轮结束 | 50 轮无人认输 → 正常终止 → narrator 正常输出 |

---

## 兼容性与回滚

- 旧 `bull-bear-debate.yaml` 和 `bull-bear.yaml` 删除后，如果有历史数据引用了这些 workflow 名称，分析结果页面仍可正常加载（workflow name 仅用于展示，不参与数据查询）
- 如需回滚，可以从 git 历史恢复旧 YAML 文件即可
- 新 agent YAML 与旧 agent 互不影响，共存无冲突
