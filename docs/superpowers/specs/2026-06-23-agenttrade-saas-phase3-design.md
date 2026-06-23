# AgentTrade SaaS Phase 3 — OAuth + 管理后台 设计 Spec

**Date:** 2026-06-23
**Status:** 设计确认

## 背景

Phase 1 完成认证，Phase 2 完成配额。Phase 3 在已有基础之上添加 GitHub/微信 OAuth 登录和管理员后台。

已有基础：
- NextAuth v5 配置（Credentials + SQLite 适配器）
- UserRepo（CRUD + ban/delete）
- SubscriptionRepo / QuotaRepo（计划 + 配额）
- middleware 已有 `ADMIN_PREFIXES = ["/api/admin"]` + admin 角色校验
- Tailwind CSS v4 已安装

## 目标

1. **shadcn/ui 组件库**：安装并替换登录/注册页手写样式，管理后台使用专业组件
2. **GitHub OAuth**：NextAuth 内置 provider，读 env 配置，未配置时不显示按钮
3. **微信 OAuth**：自定义 NextAuth OAuth provider（qrconnect 流程）
4. **管理后台**：用户列表（含配额/订阅信息）+ 封禁/解封 + 统计面板
5. **API**：`/api/admin/users`（列表+搜索+分页）、`/api/admin/users/[id]/ban`（toggle）、`/api/admin/stats`（统计）

## 架构

```
agenttrade-saas/
├── components/ui/               ← shadcn/ui (button, input, card, table, badge, dialog)
├── lib/auth/
│   ├── auth.config.ts           ← +GitHub + 微信 provider
│   └── wechat-provider.ts       ← 微信自定义 OAuth provider
├── app/
│   ├── login/page.tsx           ← 改用 shadcn/ui + OAuth 按钮
│   ├── signup/page.tsx          ← 改用 shadcn/ui
│   ├── admin/
│   │   ├── layout.tsx           ← 侧边栏 + 路由守卫（role check）
│   │   ├── page.tsx             ← 重定向到 /admin/users
│   │   ├── users/page.tsx       ← 用户列表 + 封禁
│   │   └── analytics/page.tsx   ← 统计卡片
│   └── api/admin/
│       ├── users/route.ts       ← GET 用户列表（分页、搜索）
│       ├── users/[id]/ban/route.ts ← POST toggle 封禁
│       └── stats/route.ts       ← GET 统计数据
```

## shadcn/ui 引入

```bash
pnpm dlx shadcn@latest init  # Next.js 15 + Tailwind v4
pnpm dlx shadcn@latest add button input card table badge dialog
```

## OAuth Provider

### GitHub

```typescript
import GitHub from "next-auth/providers/github";

providers: [
  GitHub({
    clientId: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
  }),
]
```

- 未配 env → provider 跳过（NextAuth 自动处理 undefined provider）
- 账户绑定：SQLite 适配器自动处理 accounts 表

### 微信

自定义 provider（`lib/auth/wechat-provider.ts`）：
- `authorization`: `https://open.weixin.qq.com/connect/qrconnect`（扫码）
- `token`: `https://api.weixin.qq.com/sns/oauth2/access_token`（code 换 token）
- `userinfo`: `https://api.weixin.qq.com/sns/userinfo`（openid + 昵称 + 头像）
- `profile` 回调：提取 openid / nickname / headimgurl

env 配置：
```bash
WECHAT_APP_ID=
WECHAT_APP_SECRET=
```

## 管理后台 API

### GET /api/admin/users

权限：middleware 校验 role=admin

参数：`?q=`（搜索邮箱/名字）、`?page=1&limit=20`

返回：
```json
{
  "users": [{
    "id", "name", "email", "emailVerified",
    "role", "banned", "plan", "quotaUsed", "quotaLimit", "createdAt"
  }],
  "total": 150,
  "page": 1,
  "limit": 20
}
```

### POST /api/admin/users/[id]/ban

权限：middleware 校验 role=admin

Body：`{ "banned": true }` 或 `{ "banned": false }`

调用 `UserRepo.setBanned(id, banned)`

### GET /api/admin/stats

权限：middleware 校验 role=admin

返回：
```json
{
  "totalUsers": 150,
  "activeUsers": 42,
  "totalAnalyses": 1280,
  "byPlan": { "free": 120, "pro": 25, "max": 5 }
}
```

- `activeUsers` = 近 30 天有分析的唯一用户数
- `totalAnalyses` = analyses 表总行数（跨 agenttrade.db 查询）
- `byPlan` = 按 subscriptions.plan 分组 count

## 管理后台页面

### 侧边栏布局（`admin/layout.tsx`）

```
┌────────────────────────────────────┐
│ 管理后台           [返回首页]       │
├──────────┬─────────────────────────┤
│ 用户管理  │ 主内容区               │
│ 数据统计  │                        │
└──────────┴─────────────────────────┘
```

- 前端守卫：`useSession()` 检查 `role !== "admin"` → 显示 "无权限"
- 侧边栏链接高亮当前页

### 用户列表（`admin/users/page.tsx`）

- Table 组件：邮箱、名字、角色(badge)、计划(badge)、配额、状态
- 搜索框 + 分页
- 封禁按钮 → Dialog 确认 → POST ban API → refetch
- banned=1 的行显示红色标记

### 统计面板（`admin/analytics/page.tsx`）

- 4 个 Card：总用户数、活跃用户、分析总数、计划分布
- 计划分布用简单的条形或数字展示

## 注意事项

- 微信 provider 需处理 `token` 端点的特殊响应格式（微信不返回标准 OAuth JSON）
- `accounts` 表已有（migration 001），OAuth 绑定无需额外迁移
- shadcn/ui `init` 会覆盖 `globals.css`，需检查不丢失已有样式
- 管理后台查询 `agenttrade.db` 的 analyses 表（跨库查询），需要导入开源仓库的 `getDb()`
- 统计 API 的 `totalAnalyses` 和 `activeUsers` 依赖 agenttrade.db 数据存在
