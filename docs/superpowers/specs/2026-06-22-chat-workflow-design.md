# Chat-Integrated Multi-Layer Analysis Workflow

**Status**: Approved  
**Date**: 2026-06-22  
**Author**: rhinonan

---

## 1. Overview

Transform the current batch-style `/api/analyze` workflow into an **interactive chat-based multi-layer analysis system**. The user participates as a "散户 Agent" (retail investor agent) in a group chat alongside AI agents organized into four layers: Data Perception → Analysis → Decision → Execution & Risk Control.

### 1.1 Design Approach

**Approach C — Agent as Chat Participant**: All Agents (including the user) are equal participants in a chat room. A "Director" (编排者) orchestrates the workflow by @mentioning agents to trigger steps, waiting for replies, and advancing through the DAG. User interjections are the same primitive as any agent interaction — both are "@ someone → get a reply" flows.

### 1.2 Key Principles

- **Unified message model**: Every piece of content (agent analysis, user interjection, system notification, workflow step boundary) is a `ChatMessage`
- **Live streaming**: Agent outputs stream token-by-token via SSE, appearing in the chat like live commentary
- **Director as scheduler, not LLM agent**: The Director is pure logic — it translates a `WorkflowDAG` into @agent messages and state transitions
- **User as participant**: User can @ any agent for multi-turn private discussion at any time, pausing workflow progression
- **Full context visibility**: All interjection discussions are visible to subsequent layers

---

## 2. Data Model

### 2.1 ChatMessage

All content in the chat is a `ChatMessage`:

```ts
interface ChatMessage {
  id: string;
  sessionId: string;
  role: "agent" | "user" | "system";
  senderId: string;          // "technical-bull" | "user" | "director"
  senderName: string;        // Display name
  content: string;
  metadata?: {
    type: "analysis" | "critique" | "synthesis" | "interjection" | "step-boundary";
    stepId?: string;         // Which workflow step this belongs to
    layer?: string;          // 感知层 | 分析层 | 决策层 | 执行风控层
    analysis?: Analysis;     // Structured analysis result (for agent messages)
    mentionAgentIds?: string[];  // @mentioned agents
    isWorkflowStep?: boolean;    // Auto-triggered by Director
  };
  timestamp: number;
}
```

### 2.2 Three Participant Roles

| Role | senderId | Behavior |
|------|----------|----------|
| Director | `director` | Pure scheduler. Issues @agent to trigger steps, emits system messages for layer boundaries. Does NOT use LLM. |
| Agent | `technical-bull`, `risk-ctrl`, etc. | Responds when @mentioned. Generates analysis via LLM. |
| User (散户) | `user` | Can @ any agent for discussion. Can @director to resume workflow. |

### 2.3 Session State Machine

```
RUNNING  → Director is advancing steps, agents are speaking
PAUSED   → User interjected, Director stops triggering NEW steps (in-flight @agent still completes)
STOPPED  → Workflow completed or user terminated
```

Transitions:
- `RUNNING → PAUSED`: First user interjection message received
- `PAUSED → RUNNING`: User clicks "继续" or sends `@director 继续`
- Any → `STOPPED`: Workflow DAG exhausted, or user terminates session

---

## 3. Architecture

### 3.1 Component Diagram

```
┌──────────────────────────────────────────────────────┐
│                    Frontend (Chat UI)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ Message List │  │ Agent Picker │  │ Input Bar   │ │
│  │ (SSE stream) │  │ (@ selector) │  │ + Continue  │ │
│  └──────┬───────┘  └──────────────┘  └────────────┘ │
└─────────┼────────────────────────────────────────────┘
          │ SSE (messages) + HTTP (send) + WS (status)
┌─────────┼────────────────────────────────────────────┐
│         │           API Layer                          │
│  ┌──────┴──────┐  ┌──────────────┐  ┌─────────────┐ │
│  │ POST /msg   │  │ GET /msg SSE │  │ WS /analysis│ │
│  └──────┬──────┘  └──────────────┘  └─────────────┘ │
│         │                                              │
│  ┌──────┴──────────────────────────────────────────┐ │
│  │              Session Manager                     │ │
│  │  - Manages Director state per session            │ │
│  │  - Routes messages to Director or Agents         │ │
│  │  - Maintains ChatMessage store                   │ │
│  └──────┬───────────────────────────────────────────┘ │
│         │                                              │
│  ┌──────┴──────┐  ┌──────────────┐  ┌─────────────┐ │
│  │  Director   │  │ AgentRegistry│  │  LLM Layer   │ │
│  │ (scheduler) │  │ (7→N agents) │  │ (DeepSeek)   │ │
│  └─────────────┘  └──────────────┘  └─────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 3.2 Key Modules

#### Session Manager
- Creates sessions with a Director, AgentRegistry, and WorkflowDAG
- Persists all ChatMessages
- Manages Director state (RUNNING/PAUSED/STOPPED)
- On receiving a user message: checks for @mentions, routes accordingly

#### Director (Pure Scheduler)
- Holds a `WorkflowDAG` reference
- Maintains step cursor (which step is next)
- Step advance logic per primitive type:
  - `analyze`: emit `@agentId {prompt}` system instruction → agent replies → mark complete
  - `panel`: batch @ multiple agents → all reply → mark complete
  - `critique`: load target step findings → emit `@reviewer {context + prompt}`
  - `debate`: round-robin @ agents, each round carries opponent's last argument
  - `synthesize`: load all findings → emit `@agent {full context + prompt}`
  - `parallel` / `sequential`: recurse into children
- When PAUSED: completes current in-flight step before stopping. For `panel` (parallel agents), this means waiting for all agents in the panel to finish. For `debate`, completes the current round then pauses.
- When RESUMED: checks if current step completed, advances to next

#### Agent Registry (Extended)
- Same `AgentRegistry` class, but agents now also respond to direct @mentions
- Agent `analyze()` becomes `respond(context: ChatContext): Promise<string>`
- New agent types for four layers (see Section 5)

---

## 4. API Design

### 4.1 Session Lifecycle

```
POST /api/session
  Body: { code?, sector?, index?, workflow?, provider?, model? }
  → Creates session, initializes Director + Agents + DAG, director starts RUNNING
  ← { sessionId, agents: [{id, name, capabilities}], workflow: {...} }

DELETE /api/session/:id
  → Terminates session, sets STOPPED
```

### 4.2 Send Message (Unified Entry Point)

```
POST /api/session/:id/message
  Body: { content: string, mentionAgentIds?: string[] }

  Internal logic:
  1. Write ChatMessage(role: "user", ...)
  2. If @agentIds present → Director transitions to PAUSED
     → Each @mentioned agent generates reply → write ChatMessage(role: "agent")
  3. If @director → Director transitions to RUNNING → advance next step
  4. If no @mentions → pure user message, Director stays in current state
  5. Return { messages: ChatMessage[] } (new messages since this request)

  Agent replies may be streaming; see SSE below for live output.
```

### 4.3 Streaming Messages (SSE)

```
GET /api/session/:id/messages/stream
  Response: text/event-stream

  Events:
  - event: message-start  data: { messageId, senderId, senderName, metadata }
  - event: token          data: { messageId, token }
  - event: message-end    data: { messageId, fullContent, metadata: { analysis } }
  - event: director-event data: { type: "step-start"|"step-complete"|"layer-boundary", ... }
  - event: status-change  data: { status: "RUNNING"|"PAUSED"|"STOPPED" }

  The client opens one SSE connection per session and receives all live output.
```

### 4.4 History

```
GET /api/session/:id/messages?cursor=<msgId>&limit=50
  → Paginated message history for initial load / scrollback
```

### 4.5 WebSocket (Existing, Extended)

Existing Socket.IO `/analysis` namespace gains new events:
- `session:status` — RUNNING/PAUSED/STOPPED broadcast
- Keep existing `STEP_START`, `STEP_COMPLETE`, `ANALYSIS_COMPLETE`, `ANALYSIS_ERROR`

---

## 5. Agent Expansion for Four Layers

### 5.1 Current Agents (Retained)

| ID | Name | Capabilities | Layer |
|----|------|-------------|-------|
| `technical-bull` | 牛方技术分析师 | technical, bullish | 分析层 |
| `technical-bear` | 熊方技术分析师 | technical, bearish | 分析层 |
| `technical-neutral` | 中性技术分析师 | technical, neutral | 分析层 |
| `financial-bull` | 牛方财报分析师 | fundamental, bullish | 分析层 |
| `financial-bear` | 熊方财报分析师 | fundamental, bearish | 分析层 |
| `financial-neutral` | 中性财报分析师 | fundamental, neutral | 分析层 |
| `judge` | 裁判/研判Agent | judge | 决策层 |

### 5.2 New Agents to Add

**数据感知层 (Data Perception Layer)**

| ID | Name | Capabilities |
|----|------|-------------|
| `market-data` | 行情数据Agent | market-data, data-perception |
| `news-sentiment` | 舆情分析Agent | sentiment, data-perception |
| `macro-data` | 宏观数据Agent | macro, data-perception |
| `capital-flow` | 资金流向Agent | capital-flow, data-perception |

**决策层 (Decision Layer)**

| ID | Name | Capabilities |
|----|------|-------------|
| `portfolio-mgr` | 组合管理Agent | portfolio, decision |
| `quant-analyst` | 量化分析Agent | quantitative, decision |

**执行与风控层 (Execution & Risk Control Layer)**

| ID | Name | Capabilities |
|----|------|-------------|
| `execution` | 执行Agent | execution |
| `risk-ctrl` | 风控Agent | risk-control |
| `compliance` | 合规Agent | compliance |

### 5.3 Agent Interface Extension

```ts
interface BaseAgent {
  id: string;
  name: string;
  capabilities: string[];
  layer: "perception" | "analysis" | "decision" | "execution";
  personality: AgentPersona;
  tools: StructuredTool[];

  // New: respond to direct @mention (replaces analyze for chat mode)
  respond(context: AgentContext): Promise<string>;

  // Streaming variant
  respondStream(context: AgentContext): AsyncGenerator<string>;
}

interface AgentContext {
  sessionId: string;
  target: AnalysisTarget;
  prompt: string;                  // The @mention content
  history: ChatMessage[];          // Recent messages (including interjections)
  findings: Finding[];             // Prior step findings
  mentionedBy: string;             // Who @mentioned this agent
}
```

---

## 6. Frontend Chat UI

### 6.1 Layout

```
┌─────────────────────────────────────────────────┐
│  Header                                          │
│  [RUNNING] 分析层 · 牛方正在发言...               │
│  [PAUSED]  等待你的输入    [▶ 继续分析]           │
├─────────────────────────────────────────────────┤
│                                                  │
│  🎬 系统 │ 进入「数据感知层」                     │
│                                                  │
│  🤖 行情数据Agent                                │
│  ┌─────────────────────────────────────────┐    │
│  │ 沪深300今日开盘价3950，涨幅0.8%...       │    │
│  │ 😊 bullish  conf ████████░░ 85%         │    │
│  │ ▶ reasoning: [量能放大] [北向流入]       │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  🧑 散户 @technical-bull                        │
│  ┌──────────────────────────────┐               │
│  │ 你说的MACD金叉，周期参数是多少？│               │
│  └──────────────────────────────┘               │
│                                                  │
│  🤖 牛方技术分析师 (回复 @散户)                   │
│  ┌─────────────────────────────────────────┐    │
│  │ 我用的是标准(12,26,9)参数，日线级别...   │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
├─────────────────────────────────────────────────┤
│  [@ 选择Agent ▼]  [输入框..................] [发送] │
└─────────────────────────────────────────────────┘
```

### 6.2 Message Bubble Styles

| Role | Alignment | Features |
|------|-----------|----------|
| System (`director`) | Center, muted | Icon + collapsible; animated layer transitions |
| Agent | Left, card | Avatar + name + structured analysis panel (sentiment badge, confidence bar, reasoning accordion) |
| User | Right, bubble | Traditional chat style |
| Agent (replying to user) | Left, card | "回复 @散户" tag |

### 6.3 Interactions

- **Live typing effect**: Agent messages grow token-by-token via SSE (typewriter effect)
- **@ mention**: Type `@` in input → agent selector popup → select → shown as tag chip. No @ = pure spectator message
- **Continue button**: Prominent button in header when PAUSED. Also supports `@director 继续` text command
- **Layer transitions**: System message with animated divider, visually separating workflow stages
- **Agent switching during pause**: @ any agent anytime; multi-turn with one agent, switch freely

---

## 7. Default Four-Layer Workflow

The default workflow shipped with this feature:

```
Layer 1: 数据感知层 (Data Perception)
  ┌─ market-data: 采集行情数据
  ├─ news-sentiment: 采集舆情信号
  ├─ macro-data: 采集宏观指标
  └─ capital-flow: 采集资金流向
      ↓
Layer 2: 分析层 (Analysis)  
  ┌─ panel: 牛方 agents (technical-bull, financial-bull) — 看多分析
  ├─ panel: 熊方 agents (technical-bear, financial-bear) — 看空分析
  ├─ critique: 牛方审阅熊方
  └─ critique: 熊方审阅牛方
      ↓
Layer 3: 决策层 (Decision)
  ┌─ judge: 综合研判
  ├─ portfolio-mgr: 仓位建议
  └─ quant-analyst: 量化评估
      ↓
Layer 4: 执行与风控层 (Execution & Risk Control)
  ┌─ execution: 执行计划
  ├─ risk-ctrl: 风控参数
  └─ debate(execution vs risk-ctrl): 仓位+止损讨论
      ↓
Final Synthesis: judge 综合四层，给出最终投资方案
```

### 7.1 Existing Workflow Compatibility

Existing `bull-bear` and `quick-scan` workflows continue to work in the new chat model — they are simply DAGs with fewer layers. The Director handles them identically.

---

## 8. Data Flow (Example)

### Happy Path (No Interjection)

```
1. Frontend POST /api/session { code: "000001", workflow: "layered" }
2. Backend creates session, Director starts RUNNING
3. Director emits system message "进入「数据感知层」" (SSE → chat)
4. Director emits @market-data prompt, agent streams reply (SSE tokens → chat)
5. Director emits @news-sentiment prompt, agent streams reply
6. ... (parallel in panel)
7. Director emits system message "进入「分析层」"
8. Director emits @technical-bull, @technical-bear (panel, parallel)
9. ... continues through decision → execution → final
10. Director emits system message "分析完成", transitions to STOPPED
```

### Interjection Path

```
1-6. Same as above
7. User sends "@technical-bull 你说的MACD金叉参数是多少？"
8. Director transitions to PAUSED
9. technical-bull sees @mention, streams reply
10. User sends "@technical-bear 你怎么回应牛方？" (switching agents)
11. technical-bear streams reply
12. User clicks [继续分析] → @director 继续 sent
13. Director transitions to RUNNING
14. Director advances to next step (all prior context + interjection messages visible)
15. ... continues to completion
```

---

## 9. Scope, Risks, Migration

### 9.1 In Scope
- New API routes: `/api/session`, `/api/session/:id/message`, `/api/session/:id/messages/stream`
- Director state machine
- ChatMessage store (SQLite via existing better-sqlite3)
- SSE streaming for agent output
- Frontend chat UI component (`ChatPanel`)
- 10 new Agent types (4 perception + 2 decision + 3 execution + user placeholder)
- One new default workflow: `layered`
- Existing `bull-bear` and `quick-scan` adapted to chat mode

### 9.2 Out of Scope (V1)
- Agent tools integration (market data API calls, news search) — agents use LLM built-in knowledge
- Per-layer model selection — all layers share the same `provider`/`model` config
- File/image upload in chat
- Persistent chat history beyond SQLite (no Redis/Postgres migration)
- Multi-user sessions (one user per session)

### 9.3 Migration Path
- Old `/api/analyze` route preserved for backward compatibility
- New chat endpoints are additive; existing workflows unchanged
- Existing `WorkflowDAG`, `AgentRegistry`, `WorkflowScheduler` types remain; Director wraps Scheduler

### 9.4 Risks
- SSE connection management (reconnection, multiple tabs)
- Prompt context window growth (all findings + interjections accumulate) — mitigate with summarization in later layers
- DeepSeek API rate limits with many concurrent agent calls
