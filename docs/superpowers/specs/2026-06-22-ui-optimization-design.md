# UI 优化：搜索建议 + 历史记录 + 结构化输出

**Status**: Approved  
**Date**: 2026-06-22  
**Author**: rhinonan

---

## 1. Overview

对 AgentTrade 前端进行三项 UI 优化：

1. **股票代码搜索建议** — 输入框支持实时搜索候选建议，数据来源 d2-data 的 `reference/search` 接口
2. **历史分析报告展示** — 首页新增"最近分析"区块，点击可查看详情，支持"查看全部"跳转全量历史页
3. **结构化输出 + 展开/收起** — 聊天消息不再硬截断，默认显示摘要，点击展开查看完整结论和推理过程

### 1.1 Design Approach

方案 A — 各自独立实现。三个功能改动范围不重叠，可独立开发、测试、上线。

---

## 2. Feature 1: 股票代码搜索建议

### 2.1 API

新增 `GET /api/search?keyword=600`，代理到 d2-data：

```
Browser → GET /api/search?keyword=600 → DataClient.reference.search("600") → d2-data :9500
                                                                                  ↓
Browser ← SearchResponse { results: [...] } ←──────────────────────────────────┘
```

### 2.2 UI 行为

```
┌──────────────────────────────────┐
│ 输入股票代码，如 600519     [🔍] │  ← 现有 Input
├──────────────────────────────────┤
│ ● 600519  贵州茅台               │  ← 下拉面板
│   白酒 · 2.3万亿                 │
│ ● 600809  山西汾酒               │
│   白酒 · 3200亿                  │
│ ● 600559  老白干酒               │
│   白酒 · 180亿                   │
└──────────────────────────────────┘
```

| 行为 | 规则 |
|------|------|
| 触发 | 输入 ≥1 字符，300ms debounce 后发起搜索 |
| 键盘 | ↑↓ 导航、Enter 选中、Esc 关闭 |
| 鼠标 | 点击选中、点击外部关闭 |
| 状态 | idle / loading（旋转图标）/ results / empty（"未找到匹配股票"） |
| 选中 | 填入代码，关闭下拉 |

### 2.3 新增 Hook

`hooks/useStockSearch.ts` — 封装 debounce + fetch + 状态机：

```ts
function useStockSearch(keyword: string): {
  results: SearchResult[];
  loading: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
}
```

---

## 3. Feature 2: 历史分析报告

### 3.1 数据层

新增 `sessions` 表持久化会话元数据：

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  target_code TEXT NOT NULL,
  target_name TEXT,
  target_type TEXT DEFAULT 'stock',
  workflow_name TEXT NOT NULL,
  status TEXT DEFAULT 'RUNNING',
  created_at INTEGER NOT NULL
);
```

新增 `SessionRepo`（`lib/db/session-repo.ts`）：
- `insert(session)` — 创建时写入
- `deleteById(id)` — 删除时清理
- `listRecent(limit)` — 按 `created_at DESC` 取最近 N 条
- `updateStatus(id, status)` — 状态变更时更新

### 3.2 API

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/sessions?limit=5` | GET | 最近 N 条列表 |
| `/api/session/[id]` | GET | 单个 session 详情 |

`GET /api/sessions` 响应：
```json
{
  "sessions": [
    { "id": "uuid", "targetCode": "600519", "targetName": "贵州茅台",
      "targetType": "stock", "workflowName": "牛熊对抗",
      "status": "complete", "createdAt": 1719034200 }
  ]
}
```

### 3.3 UI

首页搜索区域下方新增"最近分析"区块：

```
┌─────────────────────────────────────────┐
│  最近分析                        查看全部 → │
├─────────────────────────────────────────┤
│  ● 600519 贵州茅台   牛熊对抗   ✅      │
│    06-22 14:30                           │
│  ● 000858 五粮液     四层深度   🟢      │
│    06-22 13:15                           │
│  ● 300750 宁德时代   快速扫描   ✅      │
│    06-22 11:02                           │
└─────────────────────────────────────────┘
```

| 交互 | 行为 |
|------|------|
| 点击某条 | 跳转 `/session/[id]` |
| 查看全部 | 跳转 `/history` |
| 空列表 | 不渲染该区块 |
| 加载中 | 骨架屏（3 行灰色占位块） |
| 错误 | 静默隐藏（不阻塞主流程） |

### 3.4 SessionManager 改动

`createSession()` 在创建内存 session 后同步写入 `sessions` 表。  
`target_name` 通过 `DataClient.reference.get(code)` 从 d2-data 获取；若数据服务不可用，`target_name` 为 null，UI 回退为仅显示代码。  
`deleteSession()` 同步删除 DB 记录。  
`startAutoAdvance()` 在状态变更（STOPPED / PAUSED）时调用 `SessionRepo.updateStatus()`。

> **注意：** 旧 `analyses` 表（`AnalysisRepo`）不受影响。历史列表仅展示新 session 系统的记录。

---

## 4. Feature 3: 结构化输出 + 展开/收起

### 4.1 渲染策略

根据 `metadata.analysis` 是否存在，区分两种渲染模式。

**有结构化数据（Agent 消息）：**

```
收起态：
┌──────────────────────────────────────────┐
│ 🤖 技术面分析师  🟢 bullish  85%         │
│                                          │
│ 短期均线多头排列，MACD 金叉信号明显...    │  ← conclusion 前 ~120 字符 + "…"
│                                          │
│                          点击展开 ▼      │
└──────────────────────────────────────────┘

展开态：
┌──────────────────────────────────────────┐
│ 🤖 技术面分析师  🟢 bullish  85%         │
│                                          │
│ 短期均线多头排列，MACD 金叉信号明显，     │  ← 完整 conclusion
│ 成交量温和放大，技术形态偏向多头...       │
│                                          │
│ ▎推理过程                               │
│ ▎• 均线系统呈多头排列，短期上穿长期       │  ← reasoning 逐条展示
│ ▎• MACD 零轴上方金叉，动能转强           │
│ ▎• 近5日成交量 > 20日均量               │
│                                          │
│                          点击收起 ▲      │
└──────────────────────────────────────────┘
```

**无结构化数据（System / 纯文本消息）：**

```
收起态：
┌──────────────────────────────────────────┐
│ 🔔 System                               │
│ 分析流程已启动，正在获取行情数据...       │  ← 前 ~120 字符 + "…"
│                          点击展开 ▼      │
└──────────────────────────────────────────┘
```

### 4.2 交互规则

| 规则 | 说明 |
|------|------|
| 截断长度 | 收起态显示前 120 字符（约 2 行中文）。有 `analysis` 时取 `conclusion` 前 120 字符，无 `analysis` 时取 `content` 前 120 字符 |
| 展开方式 | 点击卡片任意位置或底部"展开/收起"文字 |
| 自动完整 | 内容 ≤ 120 字符直接完整显示，不显示展开按钮 |
| 新消息 | 最新一条 Agent 消息默认展开，其余默认收起 |
| 动画 | `max-height` transition ~200ms ease-in-out |
| 用户消息 | 不截断，始终完整显示（发信人不需要折叠自己的话） |

### 4.3 组件拆分

`MessageBubble.tsx` 内部拆出 `StructuredAnalysis` 子组件，负责：
- 解析 `metadata.analysis`（conclusion / reasoning / sentiment / confidence）
- 收起态摘要 + 展开态完整内容
- sentiment 颜色映射（bullish → emerald, bearish → red, neutral → zinc）

---

## 5. 文件变更总览

| 文件 | 操作 | 关联功能 |
|------|------|---------|
| `app/api/search/route.ts` | 新增 | Feature 1 |
| `hooks/useStockSearch.ts` | 新增 | Feature 1 |
| `components/landing/StockSearchInput.tsx` | 修改 | Feature 1 |
| `lib/db/session-repo.ts` | 新增 | Feature 2 |
| `lib/db/client.ts` | 修改（建表 sessions） | Feature 2 |
| `lib/chat/session-manager.ts` | 修改（持久化 session） | Feature 2 |
| `app/api/sessions/route.ts` | 新增 | Feature 2 |
| `app/api/session/[id]/route.ts` | 新增 | Feature 2 |
| `app/page.tsx` | 修改（新增最近分析区块） | Feature 2 |
| `components/landing/RecentAnalyses.tsx` | 新增 | Feature 2 |
| `app/history/page.tsx` | 新增 | Feature 2 |
| `components/chat/MessageBubble.tsx` | 重写 | Feature 3 |
| `components/chat/StructuredAnalysis.tsx` | 新增 | Feature 3 |

---

## 6. 测试要点

### Feature 1
- debounce 300ms 正常触发搜索
- 输入 <1 字符时不发起请求
- 结果列表正确渲染，点击选中填入 Input
- 键盘导航（↑↓Enter Esc）正常
- 空结果展示 "未找到匹配股票"
- API 异常时静默失败，不阻塞输入

### Feature 2
- 首页正常展示最近 5 条分析
- 空列表时不渲染区块
- 点击跳转到正确 session 页面
- "查看全部" 跳转 `/history`
- 状态标识颜色正确（running / complete / error）

### Feature 3
- Agent 消息：收起态截断 120 字符，展开态完整展示
- conclusion + reasoning 结构化渲染
- 内容 ≤ 120 字符不显示展开按钮
- 用户消息不截断
- 纯文本消息正常展开/收起
