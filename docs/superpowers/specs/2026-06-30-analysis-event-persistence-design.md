# 分析事件持久化 & 页面刷新恢复

> 问题：分析进行中刷新页面 → WebSocket 断开 → 所有中间状态丢失 → 用户看到的是一片空白，即使分析仍在运行。

## 现状

### 数据流（修复前）

```
分析中:  POST /api/analyze → runAnalysis() → WebSocket 广播事件 (纯内存，无持久化)
分析后:  GET /analyze/[id] → DB 读取 analyses 表 → StaticFindingsPanel 静态渲染
```

### 刷新时发生了什么

1. `useAnalysisSocket` 的 React 状态（agentStreams、nodes、findings、debateRounds…）全部丢失
2. `page.tsx` 读到 `status === "running"`，渲染 `<AnalysisLiveClient sessionId={id}>`
3. `useAnalysisSocket` 重新连接 WebSocket，订阅 sessionId
4. 但历史事件已经没了——只能收到后续的新事件
5. 用户看到空壳

### 附带问题：AGENT_THINKING 动画从未显示

`runner.ts` 使用 `app.stream({ streamMode: "updates" })`，只在节点**完成后**才 yield。导致 `onNodeStart`（发射 `AGENT_THINKING`）和 `onNodeEnd`（发射 `NODE_END`，改状态为 done）在不到 1ms 内连续触发——前端"思考中…"的三个点从未实际显示过。

## 设计

### 总体思路

事件溯源（Event Sourcing）：每个 WebSocket 事件同时写入 `analysis_events` 表。页面刷新时，从 DB 读取历史事件回放重建状态，再订阅 WebSocket 接收增量。

### 数据库

新增 `analysis_events` 表：

```sql
CREATE TABLE analysis_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT    NOT NULL,
  seq         INTEGER NOT NULL,          -- 会话内自增序号，从 0 开始
  event_type  TEXT    NOT NULL,          -- 对应 WS_EVENTS 的值
  payload     TEXT    NOT NULL,          -- JSON 载荷
  created_at  INTEGER NOT NULL,          -- unix 毫秒
  FOREIGN KEY (session_id) REFERENCES analyses(id) ON DELETE CASCADE
);

CREATE INDEX idx_events_session ON analysis_events(session_id, seq);
```

新增 `EventRepo`（`lib/db/event-repo.ts`）：

```
EventRepo
├─ insert(sessionId, seq, eventType, payload)  → 插入单条事件
└─ getBySession(sessionId)                       → 按 seq ASC 返回所有事件
```

`analyses` 表不变。`context` 字段仍然保存最终 findings，给已完成分析用的静态渲染路径保持不变。

### 服务端：事件写库

`route.ts` 中新增 `emitAndPersist` 封装，替换所有 `ns.to(sessionId).emit(...)`：

```typescript
let seq = 0;
function emitAndPersist(eventType: string, payload: Record<string, unknown>) {
  ns.to(sessionId).emit(eventType, payload);
  eventRepo.insert(sessionId, seq++, eventType, payload);
}
```

涵盖当前 `runAnalysis()` 中的 **14 个 emit 点**（包括 `ANALYSIS_ERROR` 的错误路径）。

### 修复 AGENT_THINKING 时序

`runner.ts` 改用 `app.streamEvents({ version: "v2" })` 替代 `app.stream({ streamMode: "updates" })`：

- `on_chain_start`（节点开始执行前）→ 调用 `onNodeStart` → 发射 `AGENT_THINKING`
- `on_chain_end`（节点执行完成后）→ 调用 `onNodeEnd` → 发射 `NODE_END`、提取 findings

两者之间有实际的 LLM 执行间隔，前端终于能看到三个点跳动。

### 客户端：回放 + 增量订阅

`page.tsx`（服务端组件）：

```
1. 读取 analyses 表 → 判断 status
2. 如果 status === "running"：
   - 读取 analysis_events 表 → 按 seq ASC
   - 将 events[] 传给 AnalysisLiveClient
3. 如果 status === "complete" / "error"：
   - 走现有的 StaticFindingsPanel 路径（不变）
```

`useAnalysisSocket(sessionId, initialEvents)`：

```
1. 回放阶段：initialEvents.forEach(e => dispatch(e.event_type, e.payload))
   - dispatch 复用现有的 socket.on handler 逻辑
   - 提取为独立函数，回放和实时共用
2. 实时阶段：connect WebSocket，订阅后续新事件
   - 新事件的 seq > max(initialSeq)，天然不会重复
```

`StaticFindingsPanel` / `LiveDebatePanel` 组件无需任何修改。

### 边界情况

| 场景 | 处理 |
|---|---|
| status=running 但 events 表为空 | 正常连接 WebSocket 等待首批事件 |
| status=complete/error | 走现有静态渲染路径，events 表仅作审计日志 |
| 回放中途 WebSocket 连上 | 先全部回放完再订阅 |
| 回放时某事件格式异常 | 跳过该事件，console.warn，不阻塞 |
| events 表写入失败 | 不阻塞 WebSocket 发射，console.error 记录 |
| 旧数据分析（无 events 记录） | getBySession 返回 []，回放零事件，行为不变 |

### 去重

不需要额外去重逻辑。客户端回放完 DB 事件后，WebSocket 接收到的新事件 seq 必然 > 已回放的最大 seq，不会重复。

## 影响范围

| 文件 | 改动 |
|---|---|
| `lib/db/event-repo.ts` | **新增** — EventRepo CRUD |
| `app/api/analyze/route.ts` | 新增 emitAndPersist，14 个 emit 点改为同时写库 |
| `lib/langgraph/runner.ts` | stream → streamEvents（修复 thinking 动画） |
| `hooks/useAnalysisSocket.ts` | 新增 initialEvents 参数 + 回放逻辑 |
| `app/analyze/[id]/page.tsx` | running 状态时读取 events 表传给客户端 |
| `app/analyze/[id]/client.tsx` | 接收 initialEvents 并透传给 hook |

不涉及：`LiveDebatePanel`、`AgentBubble`、`StaticFindingsPanel`、`analysis-repo.ts`。
