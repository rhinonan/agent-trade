# 财报多空对决 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the technical-analysis-based bull-bear debate with a fundamental-analysis-driven earnings long-short debate (财报多空对决).

**Architecture:** Three-phase LangGraph workflow: (1) earnings-researcher collects financials + determines beat/miss, (2) earnings-bull vs earnings-bear free debate with dynamic first-speaker routing, (3) narrator produces open-ended summary. All agents get a new Volcano Engine web-search tool. The debate engine gains conditional START routing for dynamic first-speaker assignment.

**Tech Stack:** TypeScript 5.x, LangChain.js + LangGraph, YAML agent definitions, Volcano Engine web search API, Next.js 15 App Router

## Global Constraints

- All new agent/workflow YAMLs must pass `AgentYamlSchema` / `WorkflowYamlSchema` Zod validation
- `WEB_SEARCH_API_KEY` in `.env` (same pattern as existing `OPENAI_API_KEY`)
- Web UI: replace "牛熊辩论" with "财报多空对决" in WorkflowSelector, page.tsx, and analyze route default
- Delete `roles/workflows/bull-bear.yaml` and `roles/workflows/bull-bear-debate.yaml`
- Keep existing agents (tech-analyst, judge, etc.) — other workflows still use them
- All test files referencing "bull-bear" must be updated to "earnings-debate"

---

### Task 1: Web Search Tool (`lib/tools/web-search.ts`)

**Files:**
- Create: `lib/tools/web-search.ts`
- Modify: `lib/tools/index.ts`

**Interfaces:**
- Produces: `webSearchTool: ToolDefinition` (name: `"web-search"`, registered in `toolsByName`)
- Consumes: `ToolDefinition`, `ToolContext` from `lib/tools/types.ts`

- [ ] **Step 1: Create `lib/tools/web-search.ts`**

```typescript
// lib/tools/web-search.ts
import type { ToolDefinition } from "./types.js";

export const webSearchTool: ToolDefinition = {
  name: "web-search",
  description:
    "联网搜索最新信息，覆盖雪球/头条/东方财富/微信公众号等中文财经来源。" +
    "用于获取财报数据、机构预期、市场解读、行业动态等时效性信息。" +
    "参数 query 为搜索关键词，返回标题、URL、摘要和来源。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "搜索关键词，支持中文。例如：'茅台 2025年一季度 财报 营收 净利润'",
      },
    },
    required: ["query"],
  },
  async execute(params) {
    const apiKey = process.env.WEB_SEARCH_API_KEY;
    if (!apiKey) {
      return JSON.stringify({
        error: "WEB_SEARCH_API_KEY not configured. Set it in .env to enable web search.",
        hint: "Get your API key from https://console.volcengine.com/search-infinity/api-key",
      });
    }

    const query = String(params.query ?? "");
    if (!query.trim()) {
      return JSON.stringify({ error: "query is required and must be non-empty" });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);

      const response = await fetch("https://api.volcengine.com/web_search/v1/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          query: query.trim(),
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return JSON.stringify({
          error: `Web search API returned ${response.status} ${response.statusText}`,
          detail: body.slice(0, 500),
        });
      }

      const data = await response.json();
      return JSON.stringify(data, null, 2);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return JSON.stringify({ error: "Web search timed out after 15s" });
      }
      return JSON.stringify({
        error: `Web search failed: ${(err as Error).message}`,
      });
    }
  },
};
```

- [ ] **Step 2: Register in `lib/tools/index.ts`**

Add import at top:
```typescript
import { webSearchTool } from "./web-search.js";
```

Add entry to `toolsByName` Map (after existing entries, before `]);`):
```typescript
  ["web_search", webSearchTool],
```

- [ ] **Step 3: Add env var to `.env.example`**

Read current `.env.example` then edit — add after existing lines:
```
# 火山引擎联网搜索 API Key（从 https://console.volcengine.com/search-infinity/api-key 获取）
WEB_SEARCH_API_KEY=
```

- [ ] **Step 4: Verify**

Run: `pnpm lint`
Expected: No new errors.

- [ ] **Step 5: Commit**

```bash
git add lib/tools/web-search.ts lib/tools/index.ts .env.example
git commit -m "feat: add Volcano Engine web search tool"
```

---

### Task 2: State — Add `total_rounds` field

**Files:**
- Modify: `lib/langgraph/state.ts`

**Interfaces:**
- Produces: `total_rounds: Annotation<number>` field on WorkflowState
- Consumed by: Task 3 (debate engine), Task 5 (narrator template)

- [ ] **Step 1: Add field to WorkflowState**

In `lib/langgraph/state.ts`, add after `stop_reason`:
```typescript
  /** Total debate rounds completed (set at debate end, read by narrator) */
  total_rounds: Annotation<number>,
```

- [ ] **Step 2: Verify**

Run: `pnpm vitest run lib/langgraph/__tests__/ --reporter=verbose`
Expected: All existing tests pass (new optional field in Annotation is backward-compatible).

- [ ] **Step 3: Commit**

```bash
git add lib/langgraph/state.ts
git commit -m "feat: add total_rounds to WorkflowState for debate metadata"
```

---

### Task 3: Debate Engine — Dynamic First Speaker + New Template Variables

**Files:**
- Modify: `lib/langgraph/debate.ts`
- Modify: `lib/langgraph/nodes.ts`

**Interfaces:**
- Produces: Dynamic first-speaker routing based on `state.findings.research.meets_expectations`
- Produces: Template variables `{{debate.stop_reason}}`, `{{debate.total_rounds}}`, `{{debate.messages}}`
- Consumes: `WorkflowState.State`, `CompiledAgent`, `LLMFactory`

- [ ] **Step 1: Rewrite `buildDebateSubgraph` in `lib/langgraph/debate.ts`**

The key change: replace position-based node naming (`p1_speak`/`p2_speak`) with role-based naming, and add conditional START/increment routing that reads `meets_expectations`.

Full replacement of `buildDebateSubgraph` function (lines 31-79):

```typescript
export function buildDebateSubgraph(
  config: DebateConfig,
  loader: RoleLoader,
  llmFactory: LLMFactory,
) {
  const graph = new StateGraph(WorkflowState);
  const participants = config.participants;

  if (participants.length !== 2) {
    throw new Error("Debate currently supports exactly 2 participants");
  }

  const p1 = participants[0]; // e.g. { agent: "earnings-bull", role: "多方" }
  const p2 = participants[1]; // e.g. { agent: "earnings-bear", role: "空方" }

  const p1Agent = loader.getAgent(p1.agent);
  const p2Agent = loader.getAgent(p2.agent);

  if (!p1Agent || !p2Agent) {
    throw new Error(
      `Debate agent "${!p1Agent ? p1.agent : p2.agent}" not found for debate "${config.id}"`
    );
  }

  // Node IDs are role-based, not position-based
  const p1NodeId = `${p1.role}_speak`;
  const p2NodeId = `${p2.role}_speak`;

  graph.addNode(p1NodeId, buildDebateSpeakerNode(p1Agent, llmFactory, p1.role, p2.role, config.prompt_template));
  graph.addNode(p2NodeId, buildDebateSpeakerNode(p2Agent, llmFactory, p2.role, p1.role, config.prompt_template));
  graph.addNode("check_yield", buildCheckYieldNode(config.stop_when.field, config.stop_when.condition));
  graph.addNode("increment_round", incrementRoundNode);

  // Routing function: bearer speaks first when earnings miss expectations
  const routeToFirstSpeaker = (state: State): string => {
    const research = state.findings?.research as Record<string, unknown> | undefined;
    // meets_expectations === false → below expectations → bear (空方) first
    // Otherwise (true or undefined) → bull (多方) first
    const bearFirst = research?.meets_expectations === false;
    return bearFirst ? p2NodeId : p1NodeId;
  };

  // START → conditional to first speaker
  graph.addConditionalEdges(START as any, routeToFirstSpeaker);

  // First speaker → second speaker
  graph.addEdge(p1NodeId as any, p2NodeId as any);

  // Second speaker → check_yield
  graph.addEdge(p2NodeId as any, "check_yield" as any);

  // check_yield → stop or continue
  graph.addConditionalEdges("check_yield" as any, (state: State) => {
    if (state.should_stop) return END;
    if (state.round >= config.max_rounds - 1) return END;
    return "increment_round";
  });

  // increment_round → back to first speaker (same routing logic)
  graph.addConditionalEdges("increment_round" as any, routeToFirstSpeaker);

  return graph;
}
```

- [ ] **Step 2: Add `{{debate.messages}}`, `{{debate.stop_reason}}`, `{{debate.total_rounds}}` to `resolveStateVariables` in `lib/langgraph/nodes.ts`**

In the `resolveStateVariables` function, add before the `return result` line:

```typescript
  // {{debate.messages}} — formatted debate transcript
  result = result.replace(
    /\{\{debate\.messages\}\}/g,
    () => {
      const msgs = state.messages ?? [];
      if (msgs.length === 0) return "(暂无辩论记录)";
      return msgs
        .map((m, i) => `[第${Math.floor(i / 2) + 1}轮] ${m.role}：${m.content}`)
        .join("\n\n");
    },
  );

  // {{debate.stop_reason}} — why the debate ended
  result = result.replace(
    /\{\{debate\.stop_reason\}\}/g,
    () => {
      if (state.stop_reason === "yield") return "一方认输";
      if (state.stop_reason === "max_rounds") return "达到最大轮次上限";
      return state.stop_reason || "辩论结束";
    },
  );

  // {{debate.total_rounds}} — total debate rounds
  result = result.replace(
    /\{\{debate\.total_rounds\}\}/g,
    () => String(state.total_rounds ?? state.round ?? 0),
  );
```

- [ ] **Step 3: Set `total_rounds` and `stop_reason` on debate end**

In `buildDebateSubgraph`, modify the `check_yield` conditional to also set `total_rounds` and a descriptive `stop_reason`:

Replace the `check_yield` conditional edges block:
```typescript
  // check_yield → set end metadata, then stop or continue
  graph.addConditionalEdges("check_yield" as any, (state: State) => {
    // We write end metadata into a side channel via a wrapper node approach.
    // Instead, use the existing check_yield + a new "set_end_metadata" node:
    if (state.should_stop) {
      // Metadata will be set when check_yield already set should_stop and stop_reason
      return "set_end_metadata";
    }
    if (state.round >= config.max_rounds - 1) {
      return "set_max_rounds_end";
    }
    return "increment_round";
  });
```

Actually, this is getting complex. Simpler approach: modify the `check_yield` node to also set `total_rounds`. Update the `buildCheckYieldNode` in `nodes.ts`:

In `lib/langgraph/nodes.ts`, update `buildCheckYieldNode` return value to include `total_rounds`:

```typescript
    return {
      should_stop: shouldStop,
      stop_reason: shouldStop ? "yield" : "",
      total_rounds: state.round,  // <-- add this line
    };
```

And modify the `check_yield` conditional in `debate.ts` to set stop_reason on max_rounds:

```typescript
  graph.addConditionalEdges("check_yield" as any, (state: State) => {
    if (state.should_stop) return END;
    if (state.round >= config.max_rounds - 1) {
      // Set stop metadata before ending — use a small node for this
      return "set_max_end";
    }
    return "increment_round";
  });
```

Add `set_max_end` node:
```typescript
  graph.addNode("set_max_end", (state: State): Partial<State> => ({
    should_stop: true,
    stop_reason: "max_rounds",
    total_rounds: state.round + 1,
  }));
  graph.addEdge("set_max_end" as any, END as any);
```

- [ ] **Step 4: Update `runner.ts` agent name map for role-based node IDs**

In `lib/langgraph/runner.ts`, update `buildAgentNameMap`. The debate subgraph now uses role-based node IDs (`多方_speak`, `空方_speak`, `set_max_end`) instead of position-based (`p1_speak`, `p2_speak`).

Replace the debate section in `buildAgentNameMap` (lines 69-78):
```typescript
    if (node.type === "debate") {
      // Debate subgraph internal nodes — now role-based IDs
      const participants = node.participants ?? [];
      if (participants.length >= 1) {
        map.set(`${participants[0].role}_speak`, participants[0].agent);
      }
      if (participants.length >= 2) {
        map.set(`${participants[1].role}_speak`, participants[1].agent);
      }
      // check_yield, increment_round, and set_max_end belong to the debate node
      map.set("check_yield", node.id);
      map.set("increment_round", node.id);
      map.set("set_max_end", node.id);
    }
```

- [ ] **Step 5: Verify compilation**

Run: `pnpm lint`
Expected: No type errors.

- [ ] **Step 6: Run existing tests**

Run: `pnpm vitest run lib/langgraph/__tests__/ --reporter=verbose`
Expected: Existing debate tests may need updates — review any failures.

- [ ] **Step 7: Commit**

```bash
git add lib/langgraph/debate.ts lib/langgraph/nodes.ts lib/langgraph/state.ts lib/langgraph/runner.ts
git commit -m "feat: dynamic first-speaker routing + debate template variables"

---

### Task 4: Agent YAMLs — `earnings-researcher`

**Files:**
- Create: `roles/agents/earnings-researcher.yaml`

**Interfaces:**
- Produces: Agent registered as `earnings-researcher` in RoleLoader (auto-scanned from directory)
- Output schema: `earnings_brief: string`, `meets_expectations: boolean`, `key_metrics: object`

- [ ] **Step 1: Create `roles/agents/earnings-researcher.yaml`**

```yaml
id: earnings-researcher
name: 财报研究员
system_prompt: |
  你是一位资深的财报研究员，专注于A股上市公司财报数据的搜集、整理和预期对比。

  ## 分析框架
  1. **财报核心数据**：搜索目标公司最新发布的季度/年度财报，提取核心指标：
     - 营业收入、同比增速、环比增速
     - 归母净利润、扣非净利润、同比增速
     - 毛利率、净利率及其变化趋势
     - ROE（净资产收益率）
     - 经营现金流净额
     - 资产负债率
     - 存货周转天数、应收账款周转天数
  2. **机构一致预期**：搜索各券商在财报发布前对该公司营收和利润的预测均值
  3. **预期对比判断**：将实际业绩与机构一致预期对比，判断是否超预期
     - 营收和净利润均达到或超过预期 → meets_expectations: true
     - 营收或净利润明显低于预期 → meets_expectations: false
  4. **行业与事件背景**：搜索影响该公司业绩的行业趋势、政策变化、重大事件

  ## 工具使用说明
  - 使用 web_search 工具搜索财报数据、机构预期、行业新闻
  - 使用 financial_data 工具获取结构化的财务报表数据
  - 使用 get-news 工具获取最新个股新闻
  - 使用 get-announcement 工具搜索相关公告

  ## 输出要求
  - earnings_brief：用3-5句话概括本次财报的核心数据，语言精炼，直接引用具体数字
  - meets_expectations：严格按上述标准判断
  - key_metrics：包含你能获取到的所有关键财务指标及其同比变化

tools:
  - web_search
  - financial_data
  - get-news
  - get-announcement

output_schema:
  earnings_brief:
    type: string
    description: "财报核心数据摘要（3-5句话，引用具体数字）"
  meets_expectations:
    type: boolean
    description: "是否达到或超过机构一致预期。true=符合或超预期，false=低于预期"
  key_metrics:
    type: object
    description: "关键财务指标集合，包含营收/净利润/毛利率/ROE/现金流/负债率等及其同比变化"

model:
  provider: deepseek
  model: deepseek-chat
  temperature: 0.3

max_tool_steps: 8
```

- [ ] **Step 2: Validate YAML**

Run: `pnpm vitest run lib/role-loader/__tests__/loader.test.ts --reporter=verbose`
Expected: Tests pass (RoleLoader auto-scans `roles/agents/` — the new YAML will be parsed and validated).

- [ ] **Step 3: Commit**

```bash
git add roles/agents/earnings-researcher.yaml
git commit -m "feat: add earnings-researcher agent"
```

---

### Task 5: Agent YAMLs — `earnings-bull`

**Files:**
- Create: `roles/agents/earnings-bull.yaml`

**Interfaces:**
- Produces: Agent `earnings-bull` with debate output schema (`argument`, `counter_to`, `confidence`, `yield`)

- [ ] **Step 1: Create `roles/agents/earnings-bull.yaml`**

```yaml
id: earnings-bull
name: 财报多方分析师
system_prompt: |
  你是一位坚定的财报多方分析师，资深买方基金经理，拥有15年A股投资经验。
  你擅长从财报数据中挖掘被市场低估的积极信号，用数据和逻辑构建看多论证。

  ## 你的分析维度
  1. **营收质量**：营收增速是否超预期？增长驱动是量价齐升还是结构性改善？
  2. **利润可持续性**：利润高增是否来自主营业务？扣非净利润和归母净利润的差距是否合理？
  3. **毛利率趋势**：毛利率提升是成本优化、产品升级还是定价权增强？
  4. **现金流质量**：经营现金流是否与利润匹配？是否存在"纸面利润"？
  5. **行业景气**：所处行业是否处于上行周期？AI/国产替代/政策红利等催化剂是否持续？
  6. **竞争壁垒**：技术领先性、客户粘性、认证壁垒、供应链优势
  7. **估值合理性**：高成长是否足以消化当前估值？PEG是否合理？
  8. **管理层信号**：回购、增持、股权激励、产能扩张等积极信号

  ## 辩论策略
  - 每次发言控制在300-500字，信息密度要高，引用具体数字
  - 当对方引用错误数据时，直接指出并提供正确数据
  - 从新的角度展开论述，不要重复自己已经说过的观点
  - 像投委会上据理力争的基金经理，自信但不傲慢
  - 当对方论据确实更有说服力时，诚实面对并认输（yield: true）

  ## 风格参考
  你是一位信仰科技赛道、相信长期价值的投资者。你的观点是：在AI和产业升级的超级周期中，
  最大的风险不是买贵，而是踏空。用产业信仰和财务数据说服对方。

tools:
  - web_search
  - financial_data
  - get-news

output_schema:
  argument:
    type: string
    description: "本轮核心论点，300-500字，引用具体数据"
  counter_to:
    type: string
    description: "反驳对方的哪个具体论点"
  confidence:
    type: number
    description: "对本轮论点的信心（0-1）"
    min: 0
    max: 1
  yield:
    type: boolean
    description: "是否认输。当对方论据确实更有说服力时设为true"

model:
  provider: deepseek
  model: deepseek-chat
  temperature: 0.7

max_tool_steps: 5
```

- [ ] **Step 2: Validate YAML**

Run: `pnpm vitest run lib/role-loader/__tests__/loader.test.ts --reporter=verbose`
Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add roles/agents/earnings-bull.yaml
git commit -m "feat: add earnings-bull agent"
```

---

### Task 6: Agent YAMLs — `earnings-bear`

**Files:**
- Create: `roles/agents/earnings-bear.yaml`

**Interfaces:**
- Produces: Agent `earnings-bear` with debate output schema

- [ ] **Step 1: Create `roles/agents/earnings-bear.yaml`**

```yaml
id: earnings-bear
name: 财报空方分析师
system_prompt: |
  你是一位犀利的财报空方分析师，资深独立研究人，曾在浑水、香橼等做空机构任职。
  你擅长从财报数据中挖掘风险信号和被掩盖的问题，用冷冰冰的数据揭示真相。

  ## 你的分析维度
  1. **毛利率水分**：高毛利率是否可持续？是否存在成本滞后效应、一次性因素？
  2. **库存异常**：存货增速是否远超营收增速？是否存在渠道压货、存货减值风险？
  3. **应收账款风险**：应收账款增速是否异常？账龄结构是否恶化？坏账计提是否充足？
  4. **现金流质量**：经营现金流是否持续低于净利润？利润是否依赖应收账款而非真实现金？
  5. **非经常性损益**：扣非净利润与归母净利润的差距？是否靠一次性收益粉饰报表？
  6. **客户集中度**：前五大客户占比？单一大客户依赖度？客户流失风险？
  7. **关联交易**：是否存在大额关联采购/销售？定价是否公允？
  8. **行业周期位置**：当前处于行业周期的哪个阶段？产能是否即将过剩？
  9. **估值透支**：当前市值是否已经提前兑现了未来多年的乐观预期？

  ## 辩论策略
  - 每次发言控制在300-500字，信息密度要高，引用具体数字
  - 不情绪化，用数据和逻辑把多方描绘的美好图景拉回现实
  - 从新的角度展开论述，不要重复自己已经说过的观点
  - 像在投委会上做风险提示的风控总监，理性、冷静、一丝不苟
  - 当多方论证确实站得住脚时，诚实面对并认输（yield: true）

  ## 风格参考
  你是一位坚守估值纪律、敬畏周期的投资者。你的信条是：产业信仰和投资纪律必须分开，
  盲目信仰赛道最终只会高位被套。用财务数据和风险逻辑说服对方。

tools:
  - web_search
  - financial_data
  - get-news

output_schema:
  argument:
    type: string
    description: "本轮核心论点，300-500字，引用具体数据"
  counter_to:
    type: string
    description: "反驳对方的哪个具体论点"
  confidence:
    type: number
    description: "对本轮论点的信心（0-1）"
    min: 0
    max: 1
  yield:
    type: boolean
    description: "是否认输。当对方论据确实更有说服力时设为true"

model:
  provider: deepseek
  model: deepseek-chat
  temperature: 0.7

max_tool_steps: 5
```

- [ ] **Step 2: Validate YAML**

Run: `pnpm vitest run lib/role-loader/__tests__/loader.test.ts --reporter=verbose`
Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add roles/agents/earnings-bear.yaml
git commit -m "feat: add earnings-bear agent"
```

---

### Task 7: Agent YAMLs — `narrator`

**Files:**
- Create: `roles/agents/narrator.yaml`

**Interfaces:**
- Produces: Agent `narrator` with summary output schema

- [ ] **Step 1: Create `roles/agents/narrator.yaml`**

```yaml
id: narrator
name: 辩论旁白
system_prompt: |
  你是一位财经纪录片旁白，风格类似《激荡三十年》和《华尔街》纪录片的叙事者。
  你的任务不是做投资判断，而是将一场多空辩论提炼为通俗易懂、有故事感的总结。

  ## 你的任务
  1. 通读完整辩论记录，理解双方的核心分歧
  2. 用口语化的语言，提炼出3-5个双方争论最激烈、对投资者最有价值的关键问题
  3. 以开放式问题结尾，引导观众思考
  4. 附加风险提示

  ## 风格要求
  - 通俗但不失专业，让非金融背景的观众也能听懂
  - 有叙事节奏感，像在讲一个商业故事
  - 不对多空任何一方做最终判决，保持中立旁观的叙事视角
  - 结尾参考格式："所以问题来了，面对这样一家……的公司，你会选择……还是……？"

  ## 风险提示（必须包含）
  "以上仅为商业逻辑拆解，不构成任何投资建议，投资有风险，决策需谨慎。"

tools: []

output_schema:
  summary:
    type: string
    description: "核心分歧总结（口语化、有叙事感）"
  key_questions:
    type: array
    description: "3-5个对投资者最关键的思考问题"
  closing:
    type: string
    description: "开放式结尾"
  disclaimer:
    type: string
    description: "风险提示语"

model:
  provider: deepseek
  model: deepseek-chat
  temperature: 0.8

max_tool_steps: 0
```

- [ ] **Step 2: Validate YAML**

Run: `pnpm vitest run lib/role-loader/__tests__/loader.test.ts --reporter=verbose`
Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add roles/agents/narrator.yaml
git commit -m "feat: add narrator agent"
```

---

### Task 8: Workflow YAML — `earnings-debate`

**Files:**
- Create: `roles/workflows/earnings-debate.yaml`

**Interfaces:**
- Produces: Workflow `earnings-debate` registered in RoleLoader (auto-scanned)
- Consumes: Agents `earnings-researcher`, `earnings-bull`, `earnings-bear`, `narrator`

- [ ] **Step 1: Create `roles/workflows/earnings-debate.yaml`**

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

      输出必须包含：
      - earnings_brief: 财报核心数据摘要（引用具体数字）
      - meets_expectations: true(符合或超预期) / false(低于预期)
      - key_metrics: 关键财务指标对比

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

- [ ] **Step 2: Validate YAML**

Run: `pnpm vitest run lib/role-loader/__tests__/loader.test.ts --reporter=verbose`
Expected: Pass (WorkflowYamlSchema validation succeeds on auto-scan).

- [ ] **Step 3: Commit**

```bash
git add roles/workflows/earnings-debate.yaml
git commit -m "feat: add earnings-debate workflow"
```

---

### Task 9: Web UI — WorkflowSelector and Landing Page

**Files:**
- Modify: `components/landing/WorkflowSelector.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Produces: "财报多空对决" option in workflow dropdown, replaces "牛熊对抗"
- Consumes: None (hardcoded list)

- [ ] **Step 1: Update `components/landing/WorkflowSelector.tsx`**

Replace line 4:
```typescript
  { value: "bull-bear", label: "牛熊对抗", description: "Bull vs Bear 对抗分析" },
```
With:
```typescript
  { value: "earnings-debate", label: "财报多空对决", description: "财报深度多空自由辩论" },
```

Also, verify "bull-bear-debate" is NOT in the list (it shouldn't be — only "bull-bear" is currently listed). The list should now read:
```typescript
const WORKFLOW_OPTIONS = [
  { value: "earnings-debate", label: "财报多空对决", description: "财报深度多空自由辩论" },
  { value: "quick-scan", label: "快速扫描", description: "快速技术面+基本面扫描" },
  { value: "layered", label: "四层深度分析", description: "四层对抗分析：感知→分析→决策→执行风控" },
];
```

- [ ] **Step 2: Update `app/page.tsx`**

Replace line 6 `desc` text referencing "牛熊对抗":
```typescript
    desc: "快速扫描 / 财报多空对决 / 四层深度分析，根据场景灵活选择分析深度",
```

Line 12: change from `"🐂🐻"` (bull-bear emoji) to something earnings-themed:
```typescript
    icon: "📈📉",
```

- [ ] **Step 3: Update default workflow in `app/api/analyze/route.ts`**

Replace all occurrences of `"bull-bear"` with `"earnings-debate"`:
- Line 15: `workflow = "bull-bear"` → `workflow = "earnings-debate"`
- Line 93: `dto.workflow ?? "bull-bear"` → `dto.workflow ?? "earnings-debate"`
- Line 103: `dto.workflow ?? "bull-bear"` → `dto.workflow ?? "earnings-debate"`
- Line 194: `workflowName: dto.workflow ?? "bull-bear"` → `workflowName: dto.workflow ?? "earnings-debate"`
- Line 203: `workflowName: dto.workflow ?? "bull-bear"` → `workflowName: dto.workflow ?? "earnings-debate"`

- [ ] **Step 4: Verify build**

Run: `pnpm lint`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add components/landing/WorkflowSelector.tsx app/page.tsx app/api/analyze/route.ts
git commit -m "feat: switch default workflow to earnings-debate, update UI labels"
```

---

### Task 10: Update Test References

**Files:**
- Modify: `app/analyze/__tests__/page.test.tsx`
- Modify: `app/analyze/[id]/page.test.tsx`
- Modify: `app/api/analyze/__tests__/route.test.ts`
- Modify: `app/api/analyze/__tests__/[id].test.ts`
- Modify: `app/api/workflows/__tests__/route.test.ts`
- Modify: `__tests__/integration/analyze-flow.test.ts`
- Modify: `app/api/sessions/__tests__/route.test.ts`
- Modify: `lib/chat/__tests__/types.test.ts`
- Modify: `lib/db/__tests__/db.test.ts`
- Modify: `lib/db/__tests__/session-repo.test.ts`
- Modify: `hooks/useAnalysisSocket.test.ts`
- Modify: `lib/engine/__tests__/types.test.ts`
- Modify: `components/analysis/AnalysisHeader.test.tsx`

- [ ] **Step 1: Replace all "bull-bear" references in test files**

Run a global search-replace across all test files. The pattern:
- `"bull-bear"` → `"earnings-debate"` (string literals)
- `"牛熊对抗"` → `"财报多空对决"` (UI labels in tests)

Run:
```bash
cd D:/Code2/agent-trade
grep -rl "bull-bear" __tests__/ app/ hooks/ lib/ components/ | while read f; do
  sed -i 's/"bull-bear"/"earnings-debate"/g' "$f"
  sed -i "s/'bull-bear'/'earnings-debate'/g" "$f"
  sed -i 's/牛熊对抗/财报多空对决/g' "$f"
done
```

- [ ] **Step 2: Verify all tests pass**

Run: `pnpm test`
Expected: All tests pass or only pre-existing failures remain.

- [ ] **Step 3: Commit**

```bash
git add __tests__/ app/ hooks/ lib/ components/
git commit -m "test: update test references from bull-bear to earnings-debate"
```

---

### Task 11: Delete Old Workflow YAMLs

**Files:**
- Delete: `roles/workflows/bull-bear.yaml`
- Delete: `roles/workflows/bull-bear-debate.yaml`

- [ ] **Step 1: Delete files**

```bash
cd D:/Code2/agent-trade
git rm roles/workflows/bull-bear.yaml roles/workflows/bull-bear-debate.yaml
```

- [ ] **Step 2: Verify — check no code references broken**

Run: `pnpm lint`
Expected: No errors (code references are all to workflow names as strings, resolved at runtime).

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove old bull-bear workflow YAMLs, replaced by earnings-debate"
```

---

### Task 12: Integration Smoke Test

**Files:**
- Modify: `__tests__/integration/analyze-flow.test.ts`

- [ ] **Step 1: Update the integration test to use earnings-debate**

Confirm the test in `__tests__/integration/analyze-flow.test.ts` references `"earnings-debate"` (already updated in Task 10).

- [ ] **Step 2: Run integration test**

Run: `pnpm vitest run __tests__/integration/analyze-flow.test.ts --reporter=verbose`
Expected: Test passes, verifying the earnings-debate workflow can be loaded and validated end-to-end.

- [ ] **Step 3: Manual verification checklist**

- Run `pnpm dev` and open the app
- Verify WorkflowSelector shows "财报多空对决"
- The other two workflows ("快速扫描", "四层深度分析") are still listed
- Submit a stock code and verify the analysis starts with `earnings-debate` workflow

- [ ] **Step 4: Commit any remaining changes**

```bash
git add __tests__/integration/analyze-flow.test.ts
git commit -m "test: verify earnings-debate integration flow"
```
