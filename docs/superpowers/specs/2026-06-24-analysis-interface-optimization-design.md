# 分析界面深度优化设计

**日期**: 2026-06-24
**状态**: 已确认

---

## 目标

优化 AgentTrade 的分析界面，让 Agent 分析过程更加透明、可信、有沉浸感。

三个核心目标：
1. Agent 结果带动画逐个展示，而非一次性全部出现
2. 展示完整的分析过程（工具调用），让结论更可信
3. 悬停查看工具调用完整返回数据

---

## 架构设计

### 新增 Socket.IO 事件（后端 → 前端）

在 `lib/socket/events.ts` 中新增 4 个事件类型：

| 事件 | Payload | 用途 |
|------|---------|------|
| `agent:thinking` | `{ nodeId, agentName }` | Agent 开始思考阶段 |
| `agent:token` | `{ nodeId, agentName, token, field }` | 逐 token 推送，field 为 `"reasoning"` 或 `"conclusion"` |
| `agent:tool_call` | `{ nodeId, agentName, tool, args, ts }` | 工具调用开始 |
| `agent:tool_result` | `{ nodeId, agentName, tool, result, ts }` | 工具调用完成 |

### 后端改动

**`lib/langgraph/nodes.ts`**：
- AgentExecutor 开启 `returnIntermediateSteps: true`
- 每次工具调用/返回时通过回调 emit 对应事件

**`app/api/analyze/route.ts`**：
- `runAnalysis()` 中 `onNodeStart` / `onNodeEnd` 回调扩展，支持工具调用事件的转发
- Agent 完成后将 conclusion/reasoning 文本按 token（中文字/英文词）切分，通过 `agent:token` 事件推送

### 前端数据流

**`hooks/useAnalysisSocket.ts`** 新增状态：

```typescript
type StreamStatus = "thinking" | "calling_tool" | "analyzing" | "writing" | "done"

interface AgentStream {
  agentName: string
  status: StreamStatus
  messages: (ToolCallMsg | ToolResultMsg | TokenMsg)[]
  conclusion: string
  reasoning: string
  findings: Finding | null
}
```

新增监听事件：
- `agent:thinking` → 创建或更新 `agentStreams[nodeId]`，状态设为 `"thinking"`
- `agent:tool_call` → 追加 `ToolCallMsg` 到 messages
- `agent:tool_result` → 追加 `ToolResultMsg` 到 messages
- `agent:token` → 累积到 conclusion 或 reasoning 字段

---

## 组件设计

### 组件树

```
LiveDebatePanel
  └── AgentBubble × N              ← 改造：变成迷你对话窗口
        ├── ThinkingIndicator       ← 新增：三个跳动圆点（对话气泡风格）
        ├── ToolCallCard × N        ← 新增：可折叠的工具调用卡片
        │     ├── ToolCallHeader    ← 工具图标 + 名称 + 参数摘要 + 折叠箭头
        │     └── ToolCallResult    ← 返回结果摘要 + hover/点击展开完整 JSON
        └── TypewriterText          ← 新增：逐字输出的结论/推理
              └── BlinkingCursor    ← 闪烁光标
```

### 视图模式切换

AgentBubble 顶部加入切换条，用户可在"详细模式"（默认）和"简洁模式"之间切换：
- **详细模式**：展示工具调用列表 + 打字机输出的结论/推理
- **简洁模式**：仅展示打字机输出的结论/推理，隐藏工具调用

### 工具调用卡片（ToolCallCard）

- 默认展示：工具图标 + 工具名称 + 参数摘要（一行）+ 展开箭头
- 点击折叠箭头：展开/折叠工具返回结果摘要
- **悬停行为**：hover 时弹出 tooltip 展示完整 JSON 返回数据（格式化 + 语法高亮）

---

## 动画设计

### 单个 Agent 动画时间线

```
1. AgentBubble 入场      → slide-up + fade-in, 0.4s, ease-out
2. ThinkingIndicator     → 三个圆点依次弹跳（0.6s/cycle，循环播放）
3. ToolCallCard 入场     → slide-in-right + fade-in, 0.3s，交错 0.15s
4. TypewriterText 输出   → 30-50 字符/秒，标点处自然停顿
5. BlinkingCursor        → 1s 周期闪烁，输出完成后 0.5s 过渡消失
6. 完成后高亮            → 左侧色条从灰色过渡到观点颜色（蓝/红）
```

### 打字机效果实现

- 中文字符：30-50 字/秒，添加 ±15% 随机抖动模拟自然输出
- 标点停顿：逗号 ×1.5 延迟，句号/叹号/问号/换行 ×3 延迟
- 使用 `requestAnimationFrame` 批量更新 DOM（每 3-5 字更新一次 state，避免逐字符触发重渲染）

### 对话气泡风格

- Agent 思考时显示三个跳动圆点（与 ChatGPT/Claude 一致的 `.dot-typing` 动画）
- 文本逐字输出，颜色从浅灰变为纯白（"显现"效果）
- 闪烁光标跟随文本末尾，方块形（`█`）

---

## 视图切换

AgentBubble 顶部切换条：
```
┌──────────────────────────────────┐
│ 🧠 技术分析师    [展开过程 ▼]     │
├──────────────────────────────────┤
│ ▼ 工具调用 (3)                   │  详细模式（默认）
│   ├─ 📊 get-kline("600519","d")  │
│   ├─ 📈 calc-rsi(14)             │
│   └─ 💰 get-fund-flow("600519")  │
├──────────────────────────────────┤
│ 结论：该股短期内存在技术性...│█  │  打字机输出中
└──────────────────────────────────┘

                    ↕ 切换

┌──────────────────────────────────┐
│ 🧠 技术分析师    [隐藏过程 ▲]     │
├──────────────────────────────────┤
│ 结论：该股短期内存在技术性...     │  简洁模式
└──────────────────────────────────┘
```

---

## 边界情况

| 场景 | 处理方式 |
|------|----------|
| WebSocket 断连 | AgentBubble 顶部显示红色提示条，重连后从已有 messages 继续 |
| 多个 Agent 并行 | 每个 Agent 独立维护消息流，互不阻塞；StepProgress 中多个节点同时标记"运行中" |
| 工具调用失败 | ToolCallCard 显示红色状态 + 错误信息 |
| 长文本 | 推理文本 > 500 字默认折叠，用户点击"展开全部" |
| 页面切换 | useEffect cleanup 中 unsubscribe + disconnect |
| 空结论 | 展示警告卡片"该 Agent 未能形成有效结论" |
| 移动端 | 工具调用仅显示图标+名称一行，点击展开详情 |

---

## 性能考虑

- **打字机动画**：`requestAnimationFrame` + 每 3-5 字批量更新 state，避免逐字符重渲染
- **工具调用列表**：Agent 工具调用 < 20 个无需虚拟化，> 30 个时启用虚拟滚动
- **React.memo**：AgentBubble 包裹 `React.memo`，仅自身 `agentStream` 更新时重渲染
- **Socket.IO 回调**：`useCallback` 稳定引用，避免不必要的重订阅

---

## 关键技术决策

1. **打字机效果在前端模拟**：不依赖 LLM token streaming，后端将完成文本按 token 切分后推送，前端逐字渲染
2. **工具调用真实实时推送**：后端开启 `returnIntermediateSteps`，工具调用通过 Socket.IO 实时推送
3. **纯 CSS + JS 动画**：不引入 Framer Motion 等第三方库，使用 Tailwind 动画 + `requestAnimationFrame`
4. **向后兼容**：新增事件不影响现有 `node:start` / `node:end` / `step:start` / `step:complete` 事件

---

## 涉及文件

| 文件 | 改造内容 |
|------|----------|
| `lib/socket/events.ts` | 新增 4 个事件常量 + payload 接口 |
| `app/api/analyze/route.ts` | `runAnalysis()` 扩展：emit 工具调用/结果/思考事件 |
| `lib/langgraph/nodes.ts` | AgentExecutor `returnIntermediateSteps: true` |
| `hooks/useAnalysisSocket.ts` | 新增 agentStreams 状态 + 4 个事件监听 |
| `components/analysis/AgentBubble.tsx` | 重构为对话气泡风格 + 打字机 + 工具调用卡片 |
| `components/analysis/ThinkingIndicator.tsx` | 新建：跳动圆点组件 |
| `components/analysis/ToolCallCard.tsx` | 新建：工具调用卡片组件 |
| `components/analysis/TypewriterText.tsx` | 新建：打字机文本输出组件 |
| `components/analysis/LiveDebatePanel.tsx` | 适配新的 agentStreams 数据结构 |
