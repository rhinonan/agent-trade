# Analysis Event Persistence & Page Refresh Recovery — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 分析过程中每个 WebSocket 事件同步写入 `analysis_events` 表，页面刷新时从 DB 回放历史事件重建完整 UI 状态。

**Architecture:** Event Sourcing 模式 — 新增 `analysis_events` 表存储每条事件，新增 `EventRepo` 负责读写。服务端通过 `emitAndPersist` 封装同时写 WebSocket + DB。客户端通过 `dispatchEvent` 统一事件处理逻辑，回放和实时共用。

**Tech Stack:** TypeScript, better-sqlite3, Socket.IO, React (Next.js App Router), LangGraph 0.4.9

## Global Constraints

- `analysis_events` 表通过 migration 004 创建，遵循现有 `lib/db/migrations/` 编号规范
- `EventRepo` 遵循 `AnalysisRepo` 的接口风格（构造函数注入 `Database`）
- 客户端回放不改变现有 `LiveDebatePanel` / `AgentBubble` 组件的接口
- 已完成分析的静态渲染路径（`StaticFindingsPanel`）不做任何改动
- `runner.ts` 的 `streamEvents` 修复已在本计划开始前完成编辑，仅需提交

---

## 文件结构

```
lib/db/
├── client.ts                          # [修改] 注册 migration 004
├── event-repo.ts                      # [新建] EventRepo 类
└── migrations/
    └── 004-analysis-events.ts         # [新建] analysis_events 表

app/api/analyze/
└── route.ts                           # [修改] 新增 emitAndPersist，包装 14 个 emit 点

hooks/
└── useAnalysisSocket.ts               # [修改] 提取 dispatchEvent，新增 initialEvents 回放

app/analyze/[id]/
├── page.tsx                           # [修改] running 状态时读取 events 表
└── client.tsx                         # [修改] 接收 initialEvents 并透传
```

---

### Task 1: DB Migration — 创建 `analysis_events` 表

**Files:**
- Create: `lib/db/migrations/004-analysis-events.ts`
- Modify: `lib/db/client.ts:4-5,88-92`

**Interfaces:**
- Produces: `analysis_events` 表 — `id INTEGER PK`, `session_id TEXT`, `seq INTEGER`, `event_type TEXT`, `payload TEXT`, `created_at INTEGER`

- [ ] **Step 1: 创建 migration 文件**

`lib/db/migrations/004-analysis-events.ts`:

```typescript
import type Database from "better-sqlite3";

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS analysis_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT    NOT NULL,
      seq         INTEGER NOT NULL,
      event_type  TEXT    NOT NULL,
      payload     TEXT    NOT NULL,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES analyses(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_events_session
      ON analysis_events(session_id, seq);
  `);
}
```

- [ ] **Step 2: 在 client.ts 中注册 migration**

在 `lib/db/client.ts` 顶部 import 区增加：

```typescript
import { migrate as migrate004 } from "./migrations/004-analysis-events.js";
```

在 `runMigrations()` 函数末尾（`migrate003(db);` 之后）增加：

```typescript
  // Migration 004: analysis_events table
  migrate004(db);
```

- [ ] **Step 3: 验证 migration**

```bash
cd D:/Code2/agent-trade && npx tsx -e "
const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.pragma('journal_mode = WAL');
const { migrate } = require('./lib/db/migrations/004-analysis-events.js');
migrate(db);
const cols = db.prepare('PRAGMA table_info(analysis_events)').all();
console.log('Columns:', cols.map(c => c.name).join(', '));
db.close();
"
```

Expected: `Columns: id, session_id, seq, event_type, payload, created_at`

- [ ] **Step 4: Commit**

```bash
git add lib/db/migrations/004-analysis-events.ts lib/db/client.ts
git commit -m "feat: add analysis_events table (migration 004)"
```

---

### Task 2: EventRepo — 事件读写仓库

**Files:**
- Create: `lib/db/event-repo.ts`

**Interfaces:**
- Produces: `EventRepo` class — `insert(sessionId, seq, eventType, payload)`, `getBySession(sessionId) → AnalysisEvent[]`

- [ ] **Step 1: 创建 EventRepo**

`lib/db/event-repo.ts`:

```typescript
import type Database from "better-sqlite3";

export interface AnalysisEvent {
  id: number;
  sessionId: string;
  seq: number;
  eventType: string;
  payload: string; // JSON string
  createdAt: number;
}

export class EventRepo {
  constructor(private db: Database.Database) {}

  insert(
    sessionId: string,
    seq: number,
    eventType: string,
    payload: Record<string, unknown>,
  ): void {
    const stmt = this.db.prepare(
      `INSERT INTO analysis_events (session_id, seq, event_type, payload, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    stmt.run(sessionId, seq, eventType, JSON.stringify(payload), Date.now());
  }

  getBySession(sessionId: string): AnalysisEvent[] {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, seq, event_type, payload, created_at
         FROM analysis_events
         WHERE session_id = ?
         ORDER BY seq ASC`,
      )
      .all(sessionId) as any[];

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      seq: row.seq,
      eventType: row.event_type,
      payload: row.payload,
      createdAt: row.created_at,
    }));
  }
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd D:/Code2/agent-trade && npx tsc --noEmit --pretty 2>&1 | grep -v duckduckgo
```

Expected: No errors (excluding pre-existing duckduckgo-search warnings).

- [ ] **Step 3: Commit**

```bash
git add lib/db/event-repo.ts
git commit -m "feat: add EventRepo for analysis event persistence"
```

---

### Task 3: 服务端 — emitAndPersist 封装

**Files:**
- Modify: `app/api/analyze/route.ts:1-13,95-296`

**Interfaces:**
- Consumes: `EventRepo` from Task 2
- Produces: `emitAndPersist(eventType, payload)` — 内部函数，替代裸 `ns.to(sessionId).emit(...)`

- [ ] **Step 1: 添加 import 和 emitAndPersist 函数**

在 `route.ts` 顶部 import 区增加：

```typescript
import { EventRepo } from "@/lib/db/event-repo.js";
```

在 `runAnalysis()` 函数开头（`const ns = io.of("/analysis");` 之后、`try {` 之前）增加：

```typescript
  const eventRepo = new EventRepo(db);
  let seq = 0;

  function emitAndPersist(eventType: string, payload: Record<string, unknown>) {
    ns.to(sessionId).emit(eventType, payload);
    try {
      eventRepo.insert(sessionId, seq++, eventType, payload);
    } catch (e) {
      console.error(`[event-repo] Failed to persist event ${eventType} seq=${seq - 1}:`, e);
    }
  }
```

- [ ] **Step 2: 替换所有 ns.to(sessionId).emit(...) 为 emitAndPersist(...)**

`runAnalysis()` 函数内共有 14 处 `ns.to(sessionId).emit(...)` 调用。逐一替换：

| 位置 (大致行号) | 替换前 | 替换后 |
|---|---|---|
| ANALYSIS_START | `ns.to(sessionId).emit(WS_EVENTS.ANALYSIS_START, {...})` | `emitAndPersist(WS_EVENTS.ANALYSIS_START, {...})` |
| NODE_START (onNodeStart 内) | `ns.to(sessionId).emit(WS_EVENTS.NODE_START, {...})` | `emitAndPersist(WS_EVENTS.NODE_START, {...})` |
| STEP_START (onNodeStart 内) | `ns.to(sessionId).emit(WS_EVENTS.STEP_START, {...})` | `emitAndPersist(WS_EVENTS.STEP_START, {...})` |
| AGENT_THINKING (onNodeStart 内) | `ns.to(sessionId).emit(WS_EVENTS.AGENT_THINKING, {...})` | `emitAndPersist(WS_EVENTS.AGENT_THINKING, {...})` |
| NODE_END (onNodeEnd 内) | `ns.to(sessionId).emit(WS_EVENTS.NODE_END, {...})` | `emitAndPersist(WS_EVENTS.NODE_END, {...})` |
| STEP_COMPLETE (onNodeEnd 内) | `ns.to(sessionId).emit(WS_EVENTS.STEP_COMPLETE, {...})` | `emitAndPersist(WS_EVENTS.STEP_COMPLETE, {...})` |
| DEBATE_ROUND × N (onNodeEnd 内循环) | `ns.to(sessionId).emit(WS_EVENTS.DEBATE_ROUND, {...})` | `emitAndPersist(WS_EVENTS.DEBATE_ROUND, {...})` |
| DEBATE_YIELD (onNodeEnd 内) | `ns.to(sessionId).emit(WS_EVENTS.DEBATE_YIELD, {...})` | `emitAndPersist(WS_EVENTS.DEBATE_YIELD, {...})` |
| AGENT_THINKING (onAgentThinking 回调) | `ns.to(sessionId).emit(WS_EVENTS.AGENT_THINKING, {...})` | `emitAndPersist(WS_EVENTS.AGENT_THINKING, {...})` |
| AGENT_TOOL_CALL (onToolCall 回调) | `ns.to(sessionId).emit(WS_EVENTS.AGENT_TOOL_CALL, {...})` | `emitAndPersist(WS_EVENTS.AGENT_TOOL_CALL, {...})` |
| AGENT_TOOL_RESULT (onToolResult 回调) | `ns.to(sessionId).emit(WS_EVENTS.AGENT_TOOL_RESULT, {...})` | `emitAndPersist(WS_EVENTS.AGENT_TOOL_RESULT, {...})` |
| AGENT_WRITING (onAgentWriting 回调) | `ns.to(sessionId).emit(WS_EVENTS.AGENT_WRITING, {...})` | `emitAndPersist(WS_EVENTS.AGENT_WRITING, {...})` |
| ANALYSIS_COMPLETE | `ns.to(sessionId).emit(WS_EVENTS.ANALYSIS_COMPLETE, {...})` | `emitAndPersist(WS_EVENTS.ANALYSIS_COMPLETE, {...})` |
| ANALYSIS_ERROR (catch 块，共 2 处) | `ns.to(sessionId).emit(WS_EVENTS.ANALYSIS_ERROR, {...})` | `emitAndPersist(WS_EVENTS.ANALYSIS_ERROR, {...})` |

注意：`catch` 块中还有一处 `io.of("/analysis").to(sessionId).emit(...)`（在 `runAnalysis` 外层的 `.catch`），那处也需要改为 `emitAndPersist`。但由于 `emitAndPersist` 的作用域在 `runAnalysis()` 内部，外层 catch 需要单独处理——此处改用 `eventRepo.insert` 直接写库 + `io.of("/analysis").to(sessionId).emit` 广播。

- [ ] **Step 3: 处理外层 catch 的错误事件持久化**

找到 `runAnalysis()` 调用处的 `.catch(async (err) => {...})`，在其中 `io.of("/analysis").to(sessionId).emit(WS_EVENTS.ANALYSIS_ERROR, ...)` 之后增加 EventRepo 写入：

```typescript
  ).catch(async (err) => {
    console.error(`Analysis ${sessionId} failed:`, err);
    repo.update(sessionId, { status: "error", context: JSON.stringify({ error: err.message }) });
    const io = getSocketIO();
    const payload = { message: err.message };
    io.of("/analysis").to(sessionId).emit(WS_EVENTS.ANALYSIS_ERROR, payload);
    // Persist error event
    try {
      const eventRepo = new EventRepo(db);
      eventRepo.insert(sessionId, 0, WS_EVENTS.ANALYSIS_ERROR, payload);
    } catch (e) { console.error("Failed to persist error event:", e); }
  });
```

- [ ] **Step 4: 验证 TypeScript 编译**

```bash
cd D:/Code2/agent-trade && npx tsc --noEmit --pretty 2>&1 | grep -v duckduckgo
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/analyze/route.ts
git commit -m "feat: persist all ws events to analysis_events table via emitAndPersist"
```

---

### Task 4: useAnalysisSocket — 提取 dispatch + 回放逻辑

**Files:**
- Modify: `hooks/useAnalysisSocket.ts:96-455`

**Interfaces:**
- Consumes: `AnalysisEvent[]` from EventRepo (via page.tsx props)
- Produces: `useAnalysisSocket(sessionId, initialEvents?)` — 新增可选参数，回放完成后状态与实时连接等价

- [ ] **Step 1: 新增回放类型定义**

在文件顶部 import 区后、`useAnalysisSocket` 函数前增加：

```typescript
/** 从 DB 回放的事件记录（payload 是 JSON 字符串） */
export interface PersistedEvent {
  id: number;
  sessionId: string;
  seq: number;
  eventType: string;
  payload: string; // JSON string — 需要 JSON.parse
  createdAt: number;
}
```

- [ ] **Step 2: 修改函数签名，新增 initialEvents 参数**

将：

```typescript
export function useAnalysisSocket(sessionId: string) {
```

改为：

```typescript
export function useAnalysisSocket(sessionId: string, initialEvents?: PersistedEvent[]) {
```

- [ ] **Step 3: 提取事件处理为 dispatchEvent 函数**

在 `useAnalysisSocket` 内部，`connect` callback 之前，创建一个 `dispatchEvent` 函数。把每个 `socket.on(EVENT, handler)` 的 handler 逻辑提取到 dispatchEvent 的 switch 中。

关键：dispatchEvent 通过闭包访问所有 `setXxx` state setters，与 socket.on handler 共享同一份逻辑。

```typescript
const dispatchEvent = useCallback(
  (eventType: string, rawPayload: unknown) => {
    const payload = rawPayload as Record<string, any>;

    switch (eventType) {
      case WS_EVENTS.ANALYSIS_START: {
        const wfSteps =
          payload.workflow === "earnings-debate"
            ? ["research", "debate", "narrator"]
            : payload.workflow === "quick-scan"
              ? ["tech", "fundamental", "final"]
              : [];
        setSteps(
          wfSteps.map((id) => ({
            stepId: id, type: id, agentIds: [], status: "pending" as const,
          })),
        );
        setNodes(
          wfSteps.map((id) => ({
            nodeId: id, agentName: id, nodeType: "standard" as const, status: "pending" as const,
          })),
        );
        break;
      }

      case WS_EVENTS.ANALYSIS_COMPLETE: {
        setStatus("complete");
        if (payload.context?.findings) setFindings(payload.context.findings);
        break;
      }

      case WS_EVENTS.ANALYSIS_ERROR: {
        setStatus("error");
        break;
      }

      case WS_EVENTS.STEP_START: {
        setSteps((prev) =>
          prev.map((s) =>
            s.stepId === payload.stepId
              ? { ...s, status: "running" as const, agentIds: payload.agentIds }
              : s,
          ),
        );
        break;
      }

      case WS_EVENTS.STEP_COMPLETE: {
        setSteps((prev) =>
          prev.map((s) =>
            s.stepId === payload.stepId ? { ...s, status: "complete" as const } : s,
          ),
        );
        if (payload.findings) {
          setFindings((prev) => [
            ...prev,
            ...payload.findings.map((f: any) => ({
              step: payload.stepId, agent: f.agent, conclusion: f.conclusion,
              reasoning: f.reasoning, sentiment: f.sentiment,
              confidence: f.confidence, timestamp: Date.now(),
            })),
          ]);
        }
        break;
      }

      case WS_EVENTS.NODE_START: {
        setNodes((prev) => {
          const existing = prev.find((n) => n.nodeId === payload.nodeId);
          if (existing) {
            return prev.map((n) =>
              n.nodeId === payload.nodeId
                ? { ...n, agentName: payload.agentName, nodeType: payload.nodeType, status: "running" as const }
                : n,
            );
          }
          return [...prev, { nodeId: payload.nodeId, agentName: payload.agentName, nodeType: payload.nodeType, status: "running" as const }];
        });
        break;
      }

      case WS_EVENTS.NODE_END: {
        setNodes((prev) =>
          prev.map((n) =>
            n.nodeId === payload.nodeId ? { ...n, status: "complete" as const } : n,
          ),
        );
        setAgentStreams((prev) => {
          const next = new Map(prev);
          const existing = next.get(payload.nodeId);
          if (existing) {
            const finding = payload.findings?.[0];
            next.set(payload.nodeId, {
              ...existing, status: "done",
              finding: finding
                ? { step: payload.nodeId, agent: finding.agent, conclusion: finding.conclusion,
                    reasoning: finding.reasoning ? [finding.reasoning] : undefined,
                    sentiment: finding.sentiment, confidence: finding.confidence, timestamp: Date.now() }
                : null,
            });
          }
          return next;
        });
        if (payload.findings?.length) {
          setFindings((prev) => [
            ...prev,
            ...payload.findings.map((f: any) => ({
              step: payload.nodeId, agent: f.agent, conclusion: f.conclusion,
              reasoning: f.reasoning ? [f.reasoning] : undefined,
              sentiment: f.sentiment, confidence: f.confidence, timestamp: Date.now(),
            })),
          ]);
        }
        break;
      }

      case WS_EVENTS.NODE_ERROR: {
        setNodes((prev) =>
          prev.map((n) =>
            n.nodeId === payload.nodeId ? { ...n, status: "error" as const } : n,
          ),
        );
        break;
      }

      case WS_EVENTS.DEBATE_ROUND: {
        setDebateRounds((prev) => [...prev, payload]);
        break;
      }

      case WS_EVENTS.DEBATE_YIELD: {
        setYields((prev) => [...prev, payload]);
        break;
      }

      case WS_EVENTS.AGENT_THINKING: {
        setAgentStreams((prev) => {
          const next = new Map(prev);
          if (!next.has(payload.nodeId)) {
            next.set(payload.nodeId, {
              nodeId: payload.nodeId, agentName: payload.agentName, status: "thinking",
              toolCalls: [], toolResults: new Map(), conclusion: "", reasoning: "",
              finding: null, startedAt: Date.now(),
            });
          } else {
            const existing = next.get(payload.nodeId)!;
            next.set(payload.nodeId, { ...existing, agentName: payload.agentName, status: "thinking" });
          }
          return next;
        });
        break;
      }

      case WS_EVENTS.AGENT_TOOL_CALL: {
        setAgentStreams((prev) => {
          const next = new Map(prev);
          const existing = next.get(payload.nodeId);
          if (existing) {
            next.set(payload.nodeId, {
              ...existing, agentName: payload.agentName, status: "calling_tool",
              toolCalls: [...existing.toolCalls, { tool: payload.tool, args: payload.args, ts: payload.ts }],
            });
          }
          return next;
        });
        break;
      }

      case WS_EVENTS.AGENT_TOOL_RESULT: {
        setAgentStreams((prev) => {
          const next = new Map(prev);
          const existing = next.get(payload.nodeId);
          if (existing) {
            const newResults = new Map(existing.toolResults);
            const isError = payload.result?.startsWith?.("Error:") ?? false;
            newResults.set(`${payload.tool}-${payload.ts}`, {
              tool: payload.tool, result: payload.result, ts: payload.ts, isError,
            });
            next.set(payload.nodeId, { ...existing, toolResults: newResults });
          }
          return next;
        });
        break;
      }

      case WS_EVENTS.AGENT_WRITING: {
        setAgentStreams((prev) => {
          const next = new Map(prev);
          const existing = next.get(payload.nodeId);
          next.set(payload.nodeId, {
            nodeId: payload.nodeId,
            agentName: existing?.agentName ?? payload.agentName,
            status: "writing",
            toolCalls: existing?.toolCalls ?? [],
            toolResults: existing?.toolResults ?? new Map(),
            conclusion: payload.conclusion,
            reasoning: payload.reasoning,
            finding: existing?.finding ?? null,
            startedAt: existing?.startedAt ?? Date.now(),
            lastWritingTs: Date.now(),
          });
          return next;
        });
        break;
      }
    }
  },
  [], // 无依赖 — 所有 setState 是稳定的
);
```

- [ ] **Step 4: 改造 connect 回调，socket.on 委托给 dispatchEvent**

在 `connect` callback 中，将每个 `socket.on(WS_EVENTS.XXX, (payload) => { ... })` 替换为：

```typescript
socket.on(WS_EVENTS.ANALYSIS_START, (payload: any) => dispatchEvent(WS_EVENTS.ANALYSIS_START, payload));
socket.on(WS_EVENTS.ANALYSIS_COMPLETE, (payload: any) => dispatchEvent(WS_EVENTS.ANALYSIS_COMPLETE, payload));
socket.on(WS_EVENTS.ANALYSIS_ERROR, (payload: any) => dispatchEvent(WS_EVENTS.ANALYSIS_ERROR, payload));
socket.on(WS_EVENTS.STEP_START, (payload: any) => dispatchEvent(WS_EVENTS.STEP_START, payload));
socket.on(WS_EVENTS.STEP_COMPLETE, (payload: any) => dispatchEvent(WS_EVENTS.STEP_COMPLETE, payload));
socket.on(WS_EVENTS.STEP_ERROR, () => {});
socket.on(WS_EVENTS.NODE_START, (payload: any) => dispatchEvent(WS_EVENTS.NODE_START, payload));
socket.on(WS_EVENTS.NODE_END, (payload: any) => dispatchEvent(WS_EVENTS.NODE_END, payload));
socket.on(WS_EVENTS.NODE_ERROR, (payload: any) => dispatchEvent(WS_EVENTS.NODE_ERROR, payload));
socket.on(WS_EVENTS.DEBATE_ROUND, (payload: any) => dispatchEvent(WS_EVENTS.DEBATE_ROUND, payload));
socket.on(WS_EVENTS.DEBATE_YIELD, (payload: any) => dispatchEvent(WS_EVENTS.DEBATE_YIELD, payload));
socket.on(WS_EVENTS.AGENT_THINKING, (payload: any) => dispatchEvent(WS_EVENTS.AGENT_THINKING, payload));
socket.on(WS_EVENTS.AGENT_TOOL_CALL, (payload: any) => dispatchEvent(WS_EVENTS.AGENT_TOOL_CALL, payload));
socket.on(WS_EVENTS.AGENT_TOOL_RESULT, (payload: any) => dispatchEvent(WS_EVENTS.AGENT_TOOL_RESULT, payload));
socket.on(WS_EVENTS.AGENT_WRITING, (payload: any) => dispatchEvent(WS_EVENTS.AGENT_WRITING, payload));
```

保留 `socket.on("disconnect", ...)` 和 `socket.on("connect_error", ...)` 不变。

- [ ] **Step 5: 新增回放逻辑**

在 `useEffect` 中，connect 之前先回放 initialEvents：

```typescript
useEffect(() => {
  // Phase 1: 回放 DB 中的历史事件（如有）
  if (initialEvents && initialEvents.length > 0) {
    for (const event of initialEvents) {
      try {
        const payload = JSON.parse(event.payload);
        dispatchEvent(event.eventType, payload);
      } catch (e) {
        console.warn(`[replay] Failed to parse event seq=${event.seq} type=${event.eventType}:`, e);
      }
    }
  }

  // Phase 2: 连接 WebSocket 接收后续增量事件
  connect();

  return () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
  };
}, [connect, dispatchEvent, initialEvents]);
```

注意：`useEffect` 的依赖数组需要加 `initialEvents`。但由于 `initialEvents` 通常只在首次渲染时传入且不变，这不会导致重连。

- [ ] **Step 6: 验证 TypeScript 编译**

```bash
cd D:/Code2/agent-trade && npx tsc --noEmit --pretty 2>&1 | grep -v duckduckgo
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add hooks/useAnalysisSocket.ts
git commit -m "feat: extract dispatchEvent, add initialEvents replay to useAnalysisSocket"
```

---

### Task 5: 页面桥接 — page.tsx + client.tsx 传递初始事件

**Files:**
- Modify: `app/analyze/[id]/page.tsx:1-68`
- Modify: `app/analyze/[id]/client.tsx:1-45`

**Interfaces:**
- Consumes: `EventRepo.getBySession()` from Task 2
- Produces: `AnalysisLiveClient` 新增 `initialEvents` prop，透传给 `useAnalysisSocket`

- [ ] **Step 1: 修改 page.tsx — running 状态下读取 events**

`app/analyze/[id]/page.tsx`:

```typescript
import { AnalysisHeader } from "@/components/analysis/AnalysisHeader";
import { DataPanel } from "@/components/analysis/DataPanel";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { getDb } from "@/lib/db/client.js";
import { AnalysisRepo } from "@/lib/db/analysis-repo.js";
import { EventRepo } from "@/lib/db/event-repo.js";       // ← 新增
import { AnalysisLiveClient } from "./client";
import { StaticFindingsPanel } from "./static-panel";

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();                                        // ← 提前获取 db 实例
  const repo = new AnalysisRepo(db);
  const record = repo.getById(id);

  if (!record) {
    return (
      <div className="p-8 text-center text-zinc-500">分析记录不存在</div>
    );
  }

  const context = JSON.parse(record.context);
  const isRunning = record.status === "running";

  // 如果是 running 状态，从 DB 读取已有事件供客户端回放
  let initialEvents: Array<{
    id: number;
    sessionId: string;
    seq: number;
    eventType: string;
    payload: string;
    createdAt: number;
  }> = [];
  if (isRunning) {
    const eventRepo = new EventRepo(db);                     // ← 复用同一个 db 实例
    initialEvents = eventRepo.getBySession(id);
  }

  const dataPanelContent = (
    <DataPanel
      code={record.targetCode}
      name={record.targetName}
      agentConclusions={[]}
    />
  );

  return (
    <main className="h-screen flex flex-col md:flex-row bg-zinc-950">
      <div className="flex-1 min-w-0 overflow-y-auto p-4 pb-16 md:pb-4">
        <AnalysisHeader
          target={{
            type: record.targetType,
            code: record.targetCode,
            name: record.targetName ?? undefined,
          }}
          workflow={record.workflowName}
          status={record.status}
        />
        {isRunning ? (
          <AnalysisLiveClient sessionId={id} initialEvents={initialEvents} />
        ) : (
          <StaticFindingsPanel findings={context.findings ?? []} />
        )}
      </div>

      <aside className="hidden md:flex md:w-[420px] lg:w-[540px] flex-shrink-0 border-l border-zinc-800 bg-zinc-950/50 overflow-y-auto">
        {dataPanelContent}
      </aside>

      <BottomSheet triggerLabel="📊 行情数据" title="行情数据">
        {dataPanelContent}
      </BottomSheet>
    </main>
  );
}
```

- [ ] **Step 2: 修改 client.tsx — 接收并透传 initialEvents**

`app/analyze/[id]/client.tsx`:

```typescript
"use client";
import { useAnalysisSocket, type PersistedEvent } from "@/hooks/useAnalysisSocket";
import { StepProgress } from "@/components/analysis/StepProgress";
import { LiveDebatePanel } from "@/components/analysis/LiveDebatePanel";

export function AnalysisLiveClient({
  sessionId,
  initialEvents,
}: {
  sessionId: string;
  initialEvents?: PersistedEvent[];
}) {
  const { connected, findings, steps, nodes, agentStreams, status } =
    useAnalysisSocket(sessionId, initialEvents);

  return (
    <div>
      <StepProgress steps={steps} nodes={nodes} />
      <LiveDebatePanel agentStreams={agentStreams} isRunning={status === "running"} />
      {status === "running" && (
        <p className={`text-sm mt-4 ${connected ? "text-amber-400 animate-pulse" : "text-red-400"}`}>
          {connected ? "● 实时分析进行中..." : "● 连接断开，正在重连..."}
        </p>
      )}
      {status === "error" && (
        <div className="mt-4 p-4 bg-red-950/30 border border-red-900/50 rounded-lg">
          <p className="text-sm text-red-400 font-medium">分析失败</p>
          <p className="text-xs text-red-400/60 mt-1">分析过程出错，请返回重试</p>
        </div>
      )}
      {status === "complete" && (
        <p className="text-sm mt-4 text-emerald-400">● 分析完成</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
cd D:/Code2/agent-trade && npx tsc --noEmit --pretty 2>&1 | grep -v duckduckgo
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/analyze/\[id\]/page.tsx app/analyze/\[id\]/client.tsx
git commit -m "feat: pass persisted events to AnalysisLiveClient for replay on refresh"
```

---

### Task 6: 提交 runner.ts streamEvents 修复

**Files:**
- Modify: `lib/langgraph/runner.ts` (已在 Task 0 中编辑完成)

**Interfaces:**
- Consumes: `app.streamEvents()` (LangGraph 0.4.9)
- Produces: `onNodeStart` 在节点执行前触发，`onNodeEnd` 在节点执行后触发

- [ ] **Step 1: 验证改动内容**

```bash
cd D:/Code2/agent-trade && git diff lib/langgraph/runner.ts
```

确认 diff 将 `app.stream({ streamMode: "updates" })` 替换为 `app.streamEvents({ version: "v2" })`，并用 `on_chain_start`/`on_chain_end` 事件分离 `onNodeStart`/`onNodeEnd` 调用。

- [ ] **Step 2: Commit**

```bash
git add lib/langgraph/runner.ts
git commit -m "fix: use streamEvents to fire AGENT_THINKING before node execution

Previously app.stream({ streamMode: 'updates' }) only yielded after node
completion, causing onNodeStart and onNodeEnd to fire in the same
sub-millisecond iteration.  AGENT_THINKING was immediately overwritten
by NODE_END, so the frontend thinking animation was never visible.

streamEvents v2 emits on_chain_start before node execution and
on_chain_end after, giving proper separation between the two callbacks."
```

---

## 验证

全部完成后运行冒烟测试：

```bash
cd D:/Code2/agent-trade && npx tsc --noEmit 2>&1 | grep -v duckduckgo
```

Expected: Zero errors.

```bash
cd D:/Code2/agent-trade && git log --oneline -7
```

Expected: 本次实现的 6 个 commit 出现在最新记录中。
