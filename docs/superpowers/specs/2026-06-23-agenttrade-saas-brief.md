# AgentTrade SaaS — 私有仓库搭建 Brief

**Date:** 2026-06-23
**Status:** 开始搭建

## 背景

开源仓库 `agenttrade`（AGPL-3.0）已完成用户管理钩子层：

| Commit | 文件 | 做了什么 |
|--------|------|---------|
| `003eb55` | `lib/auth/types.ts` | `AuthAdapter` 接口、`NoopAuthAdapter`（匿名用户）、`getAuthAdapter()` / `setAuthAdapter()` 全局单例 |
| `96e9d85` | `middleware.ts` | 保护 `/api/analyze` 和 `/api/session` 路由，调用 `getAuthAdapter().getSession()`，注入 `x-user-id` / `x-user-role` header |
| `75ebb21` | `lib/db/client.ts`、`analysis-repo.ts`、`session-repo.ts` | `analyses` 和 `sessions` 表新增 `user_id TEXT NOT NULL DEFAULT 'anonymous'` 列，repo 方法支持可选 `userId` 参数 |
| `9d34230` | 3 个 API route、`chat/types.ts`、`session-manager.ts` | API routes 从 `x-user-id` header 读 userId 传入 repo |

**开源仓库路径**：`D:\Code2\agent-trade`

---

## 目标

创建私有仓库 `agenttrade-saas`，导入开源核心，实现：

1. **用户认证**：注册 / 登录 / 密码重置 / 邮箱验证
2. **OAuth 登录**：微信 / GitHub
3. **会员体系**：免费层 + 付费层，按分析次数限流
4. **管理后台**：用户列表、用量统计、封禁/解封
5. **RealAuthAdapter**：实现开源仓库定义的 `AuthAdapter` 接口，通过 `setAuthAdapter()` 注入

---

## 架构

```
agenttrade-saas/（私有仓库）
├── package.json              ← 依赖：agenttrade（本地路径或 git submodule）
├── .env                      ← 数据库连接、OAuth 密钥、支付密钥
│
├── lib/
│   ├── auth/
│   │   └── adapter.ts        ← RealAuthAdapter implements AuthAdapter
│   │       - getSession()   → NextAuth.js session 验证
│   │       - hasPermission() → 查用户角色
│   │       - getQuotaLimit() → 查订阅计划
│   │       - getQuotaUsed()  → 查本月用量
│   │
│   ├── db/
│   │   ├── client.ts         ← users.db 连接（独立于 agenttrade.db）
│   │   ├── user-repo.ts      ← 用户 CRUD + 密码 hash
│   │   ├── subscription-repo.ts ← 订阅计划 + 用户订阅状态
│   │   ├── quota-repo.ts     ← 用量计数
│   │   └── migrations/       ← users/subscriptions/quota 建表 SQL
│   │
│   ├── billing/              ← 支付集成（预留接口，先 mock）
│   │   └── types.ts
│   │
│   └── email/                ← 邮件服务（验证码、密码重置）
│       └── client.ts
│
├── app/
│   ├── login/page.tsx        ← 登录页
│   ├── signup/page.tsx       ← 注册页
│   ├── settings/page.tsx     ← 用户设置
│   └── admin/
│       ├── page.tsx          ← 管理后台首页
│       ├── users/page.tsx    ← 用户管理
│       └── analytics/page.tsx ← 用量统计
│
├── app/api/
│   ├── auth/
│   │   ├── [...nextauth]/route.ts  ← NextAuth.js 路由
│   │   ├── signup/route.ts        ← 注册 API
│   │   └── verify-email/route.ts   ← 邮箱验证
│   ├── billing/
│   │   ├── plans/route.ts         ← 订阅计划列表
│   │   ├── subscribe/route.ts     ← 订阅
│   │   └── webhook/route.ts       ← 支付回调
│   └── admin/
│       ├── users/route.ts         ← 用户 CRUD（管理员）
│       └── stats/route.ts         ← 统计数据
│
├── middleware.ts             ← 扩展开源 middleware（或直接替换为商业版）
│
└── main.ts                   ← 入口：setAuthAdapter(new RealAuthAdapter())
                                （在 Next.js instrumentation 或 server startup 中调用）
```

---

## 关键设计决策

### 1. 如何导入开源核心

**方案 A（推荐）**：用 pnpm workspace 将开源仓库作为本地依赖

```json
// agenttrade-saas/package.json
{
  "dependencies": {
    "agenttrade": "file:../agent-trade/nextjs-app"
  }
}
```

开源仓库 import：`import { getAuthAdapter } from "agenttrade/lib/auth/types"`

**方案 B**：git submodule + path alias
```
agenttrade-saas/
├── vendor/agenttrade/   ← git submodule
```

选择方案 A 最简单，适合初期快速迭代。后续可以发布 npm 包。

### 2. 独立数据库

开源仓库的 `agenttrade.db` 和私有仓库的 `users.db` 是**两个独立 SQLite 文件**，通过 `user_id` 字符串关联（不是数据库外键）。

```
agenttrade.db（开源 core 管理）       users.db（私有 SaaS 管理）
├── analyses (+user_id)            ├── users
├── sessions (+user_id)            ├── subscriptions
└── chat_messages                  ├── quotas
                                   ├── oauth_accounts
                                   └── email_verifications
```

`agenttrade.db` 的 schema 归开源代码所有，私有仓库不修改。`users.db` 完全由私有仓库管理，开源代码不知道它的存在。

### 3. 认证框架

用 **NextAuth.js v5**（`next-auth@beta`）：
- 内置邮箱/密码（Credentials provider）
- 内置 GitHub OAuth
- 微信 OAuth 需要自定义 provider（或第三方包 `next-auth/wechat`）
- Session 存 JWT 或数据库，通过 cookie 传递

### 4. 会员体系

先用最简单的模型：

```
subscriptions 表：
  user_id     TEXT
  plan        TEXT  — "free" | "pro" | "enterprise"
  quota_limit INTEGER  — 每月分析次数，-1 = 不限
  expires_at  INTEGER  — 订阅到期时间

quotas 表（按月计数）：
  user_id   TEXT
  month     TEXT  — "2026-06"
  count     INTEGER
```

免费层：每月 10 次分析。Pro：每月 100 次。Enterprise：不限。

---

## 实施计划（建议分阶段）

### Phase 1：基础认证（最小可用）
- 初始化 Next.js 项目，导入 agenttrade
- NextAuth.js 配置（邮箱密码 + GitHub）
- `RealAuthAdapter` 实现
- `users.db` + `user-repo.ts`
- 登录/注册页面
- `setAuthAdapter(new RealAuthAdapter())` 注入

### Phase 2：会员 + 配额
- 订阅计划定义
- 配额计数
- middleware 限流（`getQuotaUsed >= getQuotaLimit → 429`）
- 免费层 vs Pro 层

### Phase 3：OAuth + 管理后台
- 微信登录
- 管理后台（用户列表、用量统计）
- 封禁/解封

### Phase 4：支付集成
- 支付宝/微信支付对接
- 支付 webhook
- 自动续费

---

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 15（与开源版一致） |
| 认证 | NextAuth.js v5 |
| 数据库 | SQLite（better-sqlite3），独立 users.db |
| 密码哈希 | bcrypt 或 @node-rs/argon2 |
| 支付 | Phase 4 再做，先 mock |
| 邮件 | Resend 或 nodemailer |
| UI | shadcn/ui + Tailwind CSS 4（与开源版一致） |

---

## 开源仓库钩子回顾

私有仓库需要对接的开源接口：

```typescript
// 来自 agenttrade/lib/auth/types.ts

// 1. 实现这个接口
interface AuthAdapter {
  getSession(request: Request): Promise<Session | null>;
  hasPermission(user: User, permission: string): boolean;
  getQuotaLimit(user: User): Promise<number>;
  getQuotaUsed(user: User): Promise<number>;
}

// 2. 在启动时调用
setAuthAdapter(new RealAuthAdapter());

// 3. middleware 会自动调用 getSession()，
//    注入 x-user-id / x-user-role header
//    （开源 middleware 可以复用，也可以在私有仓库替换）

// 4. API routes 已从 header 读取 userId：
//    const userId = req.headers.get("x-user-id") ?? "anonymous";
//    并传入 repo.create({ ..., userId })
```

---

## 注意事项

- `agenttrade.db` 和 `users.db` 需要通过应用层 `user_id` 字符串关联
- `DELETE /api/session` 目前没有校验 userId（开源仓库遗留，私有仓库需要加固）
- `runMigrations()` 的 try/catch 范围较宽（开源仓库已知 issue）
- middleware 的 `PROTECTED_PREFIXES` 用 `startsWith` 匹配，新增 `/api/session-*` 路由时需注意
- 开源仓库的所有修改已 commit 但未 push（在本地 master 分支）
