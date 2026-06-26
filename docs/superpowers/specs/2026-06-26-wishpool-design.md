# Wishpool (许愿池) — 产品公开需求看板

> 日期: 2026-06-26 | 状态: 设计完成

## 概述

将现有的占位页 `/wishpool` 完善为一个**产品公开需求看板**，类似 GitHub Issues 的轻量版。用户可以提出需求、参与讨论、用表情投票；需求有状态流转，支持多维度过滤。

## 功能范围

- **创建心愿**：标题、正文(Markdown)、标签
- **状态流转**：`open` → `in_progress` → `done` / `closed`，支持置顶
- **过滤排序**：按状态、标签、关键词搜索；按最新/最热(👍数)/最近更新排序
- **表情反馈**：6 个 emoji（👍 👎 😄 🎉 😕 ❤️），每用户每心愿限一种
- **评论讨论**：支持回复特定评论（嵌套一层），Markdown 正文
- **权限控制**：作者可编辑/删除自己的内容，admin 可管理所有内容和置顶

## 技术方案

纯 Next.js SSR + SQLite，无新依赖。遵循项目现有模式：页面 SSR 直读数据库，交互组件用 `"use client"`，API routes 处理写操作。不引入 Socket.IO 实时推送（心愿墙不需要分析面板级别的实时性）。

## 数据模型

4 张新表，建在 `agenttrade.db`，遵循多租户惯例 (`user_id NOT NULL DEFAULT 'anonymous'`)：

```sql
CREATE TABLE IF NOT EXISTS wishes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',    -- open | in_progress | done | closed
  pinned INTEGER NOT NULL DEFAULT 0,
  author_id TEXT NOT NULL DEFAULT 'anonymous',
  author_name TEXT NOT NULL DEFAULT '匿名用户',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS wish_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  UNIQUE(wish_id, tag)
);

CREATE TABLE IF NOT EXISTS wish_reactions (
  wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL DEFAULT 'anonymous',
  emoji TEXT NOT NULL,                    -- '👍'|'👎'|'😄'|'🎉'|'😕'|'❤️'
  PRIMARY KEY (wish_id, user_id)
);

CREATE TABLE IF NOT EXISTS wish_comments (
  id TEXT PRIMARY KEY,
  wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
  parent_id TEXT,                         -- NULL=顶级评论, 非NULL=回复
  author_id TEXT NOT NULL DEFAULT 'anonymous',
  author_name TEXT NOT NULL DEFAULT '匿名用户',
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

TypeScript 类型和 Zod 校验在 `lib/wishpool/types.ts`。

## 路由设计

### 页面

| 路由 | 说明 | 渲染模式 |
|------|------|---------|
| `/wishpool` | 列表页，URL searchParams 驱动过滤 | SSR |
| `/wishpool/[id]` | 详情页，心愿 + 评论区 | SSR |
| `/wishpool/new` | 新建表单 | Client |

### API Routes

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/wishes` | 列表查询 (qs: `status`, `tag`, `q`, `sort`, `page`) |
| POST | `/api/wishes` | 创建心愿 |
| GET | `/api/wishes/[id]` | 单条详情（含标签、reaction 汇总、评论树） |
| PATCH | `/api/wishes/[id]` | 更新状态 / 编辑正文 / 切换置顶 |
| POST | `/api/wishes/[id]/comments` | 发表评论（`parent_id` 支持回复） |
| DELETE | `/api/wishes/[id]/comments/[cid]` | 删除自己评论 |
| POST | `/api/wishes/[id]/reactions` | 设置/更换表情 (`body: { emoji }`) |
| DELETE | `/api/wishes/[id]/reactions` | 取消表情 |
| GET | `/api/wishes/tags` | 已用标签列表 (供 filter 下拉) |

### 过滤参数 (`GET /api/wishes`)

| 参数 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| `status` | string | 状态筛选 | 无(全部) |
| `tag` | string | 标签筛选 | 无(全部) |
| `q` | string | 标题关键词 | 无 |
| `sort` | string | `latest` / `popular` / `updated` | `latest` |
| `page` | number | 分页偏移，每页 20 条 | `0` |

## 权限模型

- **创建心愿 / 评论 / 表情**：需登录（SaaS 侧校验；开源侧 anonymous 通行）
- **编辑/删除心愿**：仅作者本人或 admin
- **删除评论**：仅评论作者本人或 admin
- **置顶 / 改他人状态**：仅 admin

权限判断通过 `middleware.ts` 注入的 `x-user-id` / `x-user-role` header 实现。AuthAdapter 新增可选的 `canManageWish()`、`canPinWish()` 方法。

## 前端组件树

### 列表页 `/wishpool`

```
WishpoolPage (server)
├── WishpoolToolbar ("use client")
│   ├── StatusFilter      — 状态下拉
│   ├── TagFilter         — 标签下拉
│   ├── SearchInput       — 关键词输入
│   └── SortSelect        — 排序选择
├── WishList (server)
│   └── WishCard          — 标题、标签徽章、👍数、评论数、状态、时间
└── Pagination (server)
```

过滤交互：过滤器改变 → 更新 URL searchParams → 服务端重新查询。

### 详情页 `/wishpool/[id]`

```
WishDetailPage (server)
├── WishHeader (server)               — 标题 + 状态徽章 + 置顶标记
├── WishBody (server)                 — Markdown 正文渲染
├── ReactionBar ("use client")        — 6 表情按钮 + 计数
├── TagList (server)                  — 标签展示
└── CommentSection (server)
    ├── CommentForm ("use client")    — 发表顶级评论
    ├── CommentTree (server)          — 递归渲染
    │   └── CommentItem
    │       └── ReplyForm ("use client") — 折叠式内联回复
    └── CommentCount
```

### 新建页 `/wishpool/new`

```
NewWishPage ("use client")
├── TitleInput
├── BodyEditor            — textarea + Markdown 预览
├── TagPicker             — 多选预设标签
└── SubmitButton
```

## 实现要点

- DB repo 文件 `lib/wishpool/repo.ts` 封装所有 SQL 操作
- 预设标签：`功能请求`、`体验优化`、`数据相关`、`Bug修复`
- 评论树在 API 层组装（查询所有评论 → 按 parent_id 分组 → 嵌套一层）
- Markdown 渲染使用简单的 markdown-to-HTML 转换（`lib/wishpool/utils.ts`）
- 时间显示使用相对时间（"3 小时前"等），工具函数放在 `lib/utils.ts`
- 状态中文映射：`{ open: "待处理", in_progress: "进行中", done: "已完成", closed: "已关闭" }`
- 预设标签列表硬编码在前端，为将来扩展预留数据库支持的通用标签系统

## 文件清单

```
app/wishpool/
├── page.tsx                          (重写 — 列表页)
├── [id]/page.tsx                     (新增 — 详情页)
├── new/page.tsx                      (新增 — 新建页)

app/api/wishes/
├── route.ts                          (新增 — GET 列表 + POST 创建)
├── tags/route.ts                     (新增 — GET 标签列表)
├── [id]/route.ts                     (新增 — GET 详情 + PATCH 更新)
├── [id]/comments/route.ts            (新增 — POST 评论)
├── [id]/comments/[cid]/route.ts      (新增 — DELETE 评论)
├── [id]/reactions/route.ts           (新增 — POST + DELETE 表情)

components/wishpool/
├── WishCard.tsx                      (新增)
├── WishToolbar.tsx                   (新增 — 过滤器行)
├── ReactionBar.tsx                   (新增 — 表情反馈)
├── CommentSection.tsx                (新增)
├── CommentForm.tsx                   (新增)
├── CommentItem.tsx                   (新增)

lib/wishpool/
├── types.ts                          (新增 — Zod schemas + TS 类型)
├── repo.ts                           (新增 — 数据库 CRUD)
├── utils.ts                          (新增 — Markdown 渲染、时间格式化)

lib/db/migrations/
└── 003-wishpool.ts                   (新增)

lib/db/client.ts                      (修改 — createTables 加 4 张表)
lib/auth/types.ts                     (修改 — AuthAdapter 加可选方法)
```

纯增量，不改动其他现有文件。
