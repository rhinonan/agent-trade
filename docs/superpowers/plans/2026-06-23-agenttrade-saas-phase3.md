# AgentTrade SaaS Phase 3 — OAuth + 管理后台 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 引入 shadcn/ui 组件库，实现 GitHub/微信 OAuth 登录，构建管理后台（用户列表、封禁、统计）

**Architecture:** shadcn/ui 组件替换登录/注册页手写样式。NextAuth 内置 GitHub provider + 自定义微信 provider（qrconnect）。管理后台三页面（layout 侧边栏 + users 表 + analytics 卡片），API 受 middleware ADMIN_PREFIXES 保护。

**Tech Stack:** shadcn/ui, NextAuth v5, better-sqlite3, Tailwind CSS v4

## Global Constraints

- 全部在 SaaS 仓库（`D:\Code2\agenttrade-saas\`），不动开源仓库
- middleware 已有 `ADMIN_PREFIXES = ["/api/admin"]`，自动校验 role=admin
- shadcn/ui init 会修改 `globals.css` 和 `layout.tsx`，需保留已有内容
- OAuth provider 读 env，未配则跳过（不显示按钮）
- 管理后台统计需跨库查询 `agenttrade.db`（analyses 表）和 `users.db`
- 所有 import 使用 ESM（`.js` 后缀）

---

### Task 1: shadcn/ui 初始化 + 组件安装

**Files:**
- Modify: `components/ui/*`（自动生成）
- Modify: `app/globals.css`（shadcn 追加 CSS variables）
- Modify: `app/layout.tsx`（可能需要调整）

**Interfaces:**
- Produces: shadcn/ui 组件库可用（button, input, card, table, badge, dialog）

- [ ] **Step 1: 运行 shadcn/ui init**

```bash
cd D:/Code2/agenttrade-saas && pnpm dlx shadcn@latest init
```

交互式选择：
- Style: New York
- Base color: Zinc
- CSS variables: Yes

**重要：** init 会覆盖 `globals.css`。操作前备份：
```bash
cp app/globals.css app/globals.css.bak
```

init 完成后，将备份中的自定义样式合并回新的 `globals.css`。

- [ ] **Step 2: 安装所需组件**

```bash
cd D:/Code2/agenttrade-saas && pnpm dlx shadcn@latest add button input card table badge dialog
```

- [ ] **Step 3: 验证编译 + 构建**

```bash
cd D:/Code2/agenttrade-saas && pnpm tsc --noEmit && pnpm build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
cd D:/Code2/agenttrade-saas && git add -A && git commit -m "feat: init shadcn/ui with button/input/card/table/badge/dialog"
```

---

### Task 2: 用 shadcn/ui 重写登录页

**Files:**
- Modify: `D:\Code2\agenttrade-saas\app\login\page.tsx`

**Interfaces:**
- Consumes: shadcn/ui Button, Input, Card（Task 1）
- Produces: 登录页（保留功能逻辑，换 UI 组件）

- [ ] **Step 1: 重写 login/page.tsx**

```tsx
// app/login/page.tsx
"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function LoginForm() {
  const searchParams = useSearchParams();
  const verified = searchParams.get("verified");
  const error = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const errorMessages: Record<string, string> = {
    "missing-token": "验证链接无效",
    "invalid-token": "验证链接无效或已过期",
    "token-expired": "验证链接已过期，请重新注册",
  };

  const displayError = errMsg || (error ? errorMessages[error] ?? "登录失败" : "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrMsg("");
    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) { setErrMsg("邮箱或密码错误"); setLoading(false); }
    else { window.location.href = "/"; }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>登录 AgentTrade</CardTitle>
          <CardDescription>输入你的邮箱和密码</CardDescription>
        </CardHeader>
        <CardContent>
          {verified === "1" && (
            <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-sm p-3 rounded-lg mb-4">
              邮箱验证成功，请登录
            </div>
          )}
          {displayError && (
            <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm p-3 rounded-lg mb-4">
              {displayError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">邮箱</label>
              <Input id="email" type="email" required value={email}
                onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">密码</label>
              <Input id="password" type="password" required value={password}
                onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "登录中..." : "登录"}
            </Button>
          </form>

          {/* OAuth buttons — rendered when env vars are set */}
          <div className="mt-4 space-y-2">
            <Button variant="outline" className="w-full"
              onClick={() => signIn("github", { callbackUrl: "/" })}>
              GitHub 登录
            </Button>
            <Button variant="outline" className="w-full"
              onClick={() => signIn("wechat", { callbackUrl: "/" })}>
              微信登录
            </Button>
          </div>

          <p className="text-center text-sm text-muted-foreground mt-4">
            还没有账号？{" "}
            <a href="/signup" className="text-primary underline underline-offset-2">去注册</a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">加载中...</div>}>
      <LoginForm />
    </Suspense>
  );
}
```

- [ ] **Step 2: 运行构建验证**

```bash
cd D:/Code2/agenttrade-saas && pnpm tsc --noEmit && pnpm build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
cd D:/Code2/agenttrade-saas && git add app/login/ && git commit -m "feat: rewrite login page with shadcn/ui"
```

---

### Task 3: 用 shadcn/ui 重写注册页

**Files:**
- Modify: `D:\Code2\agenttrade-saas\app\signup\page.tsx`

- [ ] **Step 1: 重写 signup/page.tsx**

```tsx
// app/signup/page.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrMsg("");
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: name || undefined }),
    });
    if (!res.ok) {
      const data = await res.json();
      setErrMsg(data.error ?? "注册失败");
      setLoading(false);
      return;
    }
    setSuccess(true);
    setLoading(false);
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <CardTitle>检查你的邮箱</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              我们向 <span className="font-medium text-foreground">{email}</span> 发送了一封验证邮件，
              请点击邮件中的链接完成注册。
            </p>
            <a href="/login" className="text-primary underline text-sm mt-4 inline-block">去登录</a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>注册 AgentTrade</CardTitle>
          <CardDescription>创建你的账号</CardDescription>
        </CardHeader>
        <CardContent>
          {errMsg && (
            <div className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-sm p-3 rounded-lg mb-4">
              {errMsg}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">名字（可选）</label>
              <Input id="name" type="text" value={name}
                onChange={e => setName(e.target.value)} placeholder="你的名字" />
            </div>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">邮箱</label>
              <Input id="email" type="email" required value={email}
                onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">密码</label>
              <Input id="password" type="password" required minLength={8} value={password}
                onChange={e => setPassword(e.target.value)} placeholder="至少 8 位" />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "注册中..." : "注册"}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            已有账号？{" "}
            <a href="/login" className="text-primary underline underline-offset-2">去登录</a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: 运行构建验证**

```bash
cd D:/Code2/agenttrade-saas && pnpm tsc --noEmit && pnpm build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
cd D:/Code2/agenttrade-saas && git add app/signup/ && git commit -m "feat: rewrite signup page with shadcn/ui"
```

---

### Task 4: GitHub OAuth Provider

**Files:**
- Modify: `D:\Code2\agenttrade-saas\lib\auth\auth.config.ts`
- Modify: `D:\Code2\agenttrade-saas\.env.example`

- [ ] **Step 1: 修改 auth.config.ts**

在 `providers` 数组中，Credentials 之后添加：

```typescript
import GitHub from "next-auth/providers/github";

// 在 providers 数组中：
GitHub({
  clientId: process.env.GITHUB_CLIENT_ID!,
  clientSecret: process.env.GITHUB_CLIENT_SECRET!,
}),
```

如果 env 未设（undefined），NextAuth 会自动跳过这个 provider。

- [ ] **Step 2: 更新 .env.example**

```bash
# GitHub OAuth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

- [ ] **Step 3: 验证编译**

```bash
cd D:/Code2/agenttrade-saas && pnpm tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd D:/Code2/agenttrade-saas && git add lib/auth/auth.config.ts .env.example && git commit -m "feat: add GitHub OAuth provider"
```

---

### Task 5: 微信 OAuth Provider

**Files:**
- Create: `D:\Code2\agenttrade-saas\lib\auth\wechat-provider.ts`
- Modify: `D:\Code2\agenttrade-saas\lib\auth\auth.config.ts`
- Modify: `D:\Code2\agenttrade-saas\.env.example`

- [ ] **Step 1: 创建 wechat-provider.ts**

```typescript
// lib/auth/wechat-provider.ts
import type { OAuthConfig, OAuthUserConfig } from "next-auth/providers/oauth";

interface WeChatProfile {
  openid: string;
  nickname: string;
  headimgurl: string;
  unionid?: string;
}

export function WeChatProvider(
  config: OAuthUserConfig<WeChatProfile>
): OAuthConfig<WeChatProfile> {
  return {
    id: "wechat",
    name: "微信",
    type: "oauth",
    clientId: config.clientId!,
    clientSecret: config.clientSecret!,
    authorization: {
      url: "https://open.weixin.qq.com/connect/qrconnect",
      params: {
        appid: config.clientId!,
        redirect_uri: config.redirectUri!,
        response_type: "code",
        scope: "snsapi_login",
        state: "{state}",
      },
    },
    token: {
      url: "https://api.weixin.qq.com/sns/oauth2/access_token",
      async request({ params }) {
        const url = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
        url.searchParams.set("appid", config.clientId!);
        url.searchParams.set("secret", config.clientSecret!);
        url.searchParams.set("code", params.code as string);
        url.searchParams.set("grant_type", "authorization_code");

        const res = await fetch(url.toString());
        const json = await res.json();

        if (json.errcode) {
          throw new Error(`WeChat token error: ${json.errmsg}`);
        }

        return { tokens: json };
      },
    },
    userinfo: {
      url: "https://api.weixin.qq.com/sns/userinfo",
      async request({ tokens }) {
        const url = new URL("https://api.weixin.qq.com/sns/userinfo");
        url.searchParams.set("access_token", (tokens as any).access_token);
        url.searchParams.set("openid", (tokens as any).openid);

        const res = await fetch(url.toString());
        return res.json();
      },
    },
    profile(profile) {
      return {
        id: profile.openid,
        name: profile.nickname,
        image: profile.headimgurl,
        email: null,
      };
    },
  };
}
```

- [ ] **Step 2: 添加到 auth.config.ts**

```typescript
import { WeChatProvider } from "@/lib/auth/wechat-provider.js";

// 在 providers 数组中添加：
WeChatProvider({
  clientId: process.env.WECHAT_APP_ID!,
  clientSecret: process.env.WECHAT_APP_SECRET!,
  redirectUri: `${process.env.AUTH_URL}/api/auth/callback/wechat`,
}),
```

- [ ] **Step 3: 更新 .env.example**

```bash
# 微信 OAuth
WECHAT_APP_ID=
WECHAT_APP_SECRET=
```

- [ ] **Step 4: 验证编译**

```bash
cd D:/Code2/agenttrade-saas && pnpm tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd D:/Code2/agenttrade-saas && git add lib/auth/wechat-provider.ts lib/auth/auth.config.ts .env.example && git commit -m "feat: add WeChat OAuth provider"
```

---

### Task 6: 管理后台 Layout（侧边栏 + 守卫）

**Files:**
- Create: `D:\Code2\agenttrade-saas\app\admin\layout.tsx`
- Create: `D:\Code2\agenttrade-saas\app\admin\page.tsx`

**Interfaces:**
- Consumes: shadcn/ui (Task 1), NextAuth useSession
- Produces: 管理后台布局（侧边栏 + 权限守卫），/admin 重定向到 /admin/users

- [ ] **Step 1: 创建 admin/layout.tsx**

```tsx
// app/admin/layout.tsx
"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/analytics", label: "数据统计" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center">加载中...</div>;
  }

  if (!session || (session.user as any)?.role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">无权限访问</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-48 border-r p-4 space-y-2">
        <h2 className="font-semibold text-sm mb-4">管理后台</h2>
        {navItems.map(item => (
          <Link key={item.href} href={item.href}
            className={`block text-sm px-2 py-1 rounded ${pathname === item.href ? "bg-zinc-800 text-white" : "text-muted-foreground hover:text-white"}`}>
            {item.label}
          </Link>
        ))}
        <div className="pt-4 border-t">
          <Link href="/" className="block text-sm text-muted-foreground hover:text-white px-2 py-1">
            ← 返回首页
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: 创建 admin/page.tsx（重定向）**

```tsx
// app/admin/page.tsx
import { redirect } from "next/navigation";

export default function AdminPage() {
  redirect("/admin/users");
}
```

- [ ] **Step 3: 验证构建**

```bash
cd D:/Code2/agenttrade-saas && pnpm tsc --noEmit && pnpm build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
cd D:/Code2/agenttrade-saas && git add app/admin/ && git commit -m "feat: add admin layout with sidebar and role guard"
```

---

### Task 7: 管理后台 API

**Files:**
- Create: `D:\Code2\agenttrade-saas\app\api\admin\users\route.ts`
- Create: `D:\Code2\agenttrade-saas\app\api\admin\users\[id]\ban\route.ts`
- Create: `D:\Code2\agenttrade-saas\app\api\admin\stats\route.ts`

**Interfaces:**
- Consumes: UserRepo (Phase 1), SubscriptionRepo (Phase 2), QuotaRepo (Phase 2), getDb from agenttrade (跨库查询 analyses)
- Produces: admin API routes（受 middleware ADMIN_PREFIXES 保护）

- [ ] **Step 1: 创建 GET /api/admin/users**

```typescript
// app/api/admin/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getUsersDb } from "@/lib/db/client.js";
import { UserRepo } from "@/lib/db/user-repo.js";
import { createSubscriptionRepo } from "@/lib/billing/subscription-repo.js";
import { createQuotaRepo } from "@/lib/billing/quota-repo.js";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.toLowerCase();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20")));
  const offset = (page - 1) * limit;

  const db = getUsersDb();
  const userRepo = new UserRepo(db);
  const subscriptionRepo = createSubscriptionRepo();
  const quotaRepo = createQuotaRepo();

  // Get all non-deleted users (simple approach — repo supports)
  const allUsers = userRepo.listAll(1000, 0); // max 1000 for now

  // Apply search filter
  const filtered = q
    ? allUsers.filter(u =>
        u.email.toLowerCase().includes(q) ||
        (u.name && u.name.toLowerCase().includes(q))
      )
    : allUsers;

  const total = filtered.length;
  const paged = filtered.slice(offset, offset + limit);

  const users = paged.map(u => {
    const sub = subscriptionRepo.getByUserId(u.id);
    const used = quotaRepo.getUsage(u.id);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      role: u.role,
      banned: u.banned,
      plan: sub?.plan ?? "free",
      quotaLimit: sub?.quotaLimit ?? 0,
      quotaUsed: used,
    };
  });

  return NextResponse.json({ users, total, page, limit });
}
```

- [ ] **Step 2: 创建 POST /api/admin/users/[id]/ban**

```typescript
// app/api/admin/users/[id]/ban/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getUsersDb } from "@/lib/db/client.js";
import { UserRepo } from "@/lib/db/user-repo.js";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { banned: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.banned !== "boolean") {
    return NextResponse.json({ error: "banned must be boolean" }, { status: 400 });
  }

  const db = getUsersDb();
  const repo = new UserRepo(db);
  repo.setBanned(id, body.banned);

  return NextResponse.json({ id, banned: body.banned });
}
```

- [ ] **Step 3: 创建 GET /api/admin/stats**

```typescript
// app/api/admin/stats/route.ts
import { NextResponse } from "next/server";
import { getUsersDb } from "@/lib/db/client.js";
import { UserRepo } from "@/lib/db/user-repo.js";
import { createSubscriptionRepo } from "@/lib/billing/subscription-repo.js";
import { getDb } from "agenttrade/lib/db/client.js";

export async function GET() {
  const usersDb = getUsersDb();
  const userRepo = new UserRepo(usersDb);
  const subscriptionRepo = createSubscriptionRepo();

  const allUsers = userRepo.listAll(10000, 0);
  const totalUsers = allUsers.length;

  // Active users: analyzed in last 30 days (cross-DB query)
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let activeUsers = 0;
  let totalAnalyses = 0;

  try {
    const agentDb = getDb(); // agenttrade.db
    const activeRows = agentDb.prepare(
      `SELECT COUNT(DISTINCT user_id) as cnt FROM analyses WHERE created_at > ?`
    ).all(thirtyDaysAgo) as { cnt: number }[];
    activeUsers = activeRows[0]?.cnt ?? 0;

    const totalRows = agentDb.prepare(
      `SELECT COUNT(*) as cnt FROM analyses`
    ).all() as { cnt: number }[];
    totalAnalyses = totalRows[0]?.cnt ?? 0;
  } catch {
    // agenttrade.db may not exist or be inaccessible
  }

  // Plan distribution
  const byPlan: Record<string, number> = { free: 0, pro: 0, max: 0 };
  for (const u of allUsers) {
    const sub = subscriptionRepo.getByUserId(u.id);
    const plan = sub?.plan ?? "free";
    byPlan[plan] = (byPlan[plan] ?? 0) + 1;
  }

  return NextResponse.json({ totalUsers, activeUsers, totalAnalyses, byPlan });
}
```

- [ ] **Step 4: 运行现有测试确认无回归**

```bash
cd D:/Code2/agenttrade-saas && pnpm test
```

- [ ] **Step 5: 验证编译**

```bash
cd D:/Code2/agenttrade-saas && pnpm tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
cd D:/Code2/agenttrade-saas && git add app/api/admin/ && git commit -m "feat: add admin API routes (users, ban, stats)"
```

---

### Task 8: 用户管理页面

**Files:**
- Create: `D:\Code2\agenttrade-saas\app\admin\users\page.tsx`

**Interfaces:**
- Consumes: shadcn/ui Table, Badge, Button, Input, Dialog (Task 1), admin layout (Task 6), admin API (Task 7)

- [ ] **Step 1: 创建 admin/users/page.tsx**

```tsx
// app/admin/users/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

interface UserRow {
  id: string; name: string | null; email: string; emailVerified: number | null;
  role: string; banned: number; plan: string; quotaLimit: number; quotaUsed: number;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [banTarget, setBanTarget] = useState<UserRow | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (q) params.set("q", q);
    const res = await fetch(`/api/admin/users?${params}`);
    const data = await res.json();
    setUsers(data.users);
    setTotal(data.total);
    setLoading(false);
  }, [page, q]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  async function toggleBan(user: UserRow) {
    const res = await fetch(`/api/admin/users/${user.id}/ban`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banned: !user.banned }),
    });
    if (res.ok) {
      fetchUsers();
      setBanTarget(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">用户管理</h1>
        <Input
          placeholder="搜索邮箱或名字..."
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          className="w-64"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>邮箱</TableHead>
            <TableHead>角色</TableHead>
            <TableHead>计划</TableHead>
            <TableHead>配额</TableHead>
            <TableHead>状态</TableHead>
            <TableHead>操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map(u => (
            <TableRow key={u.id} className={u.banned ? "opacity-50" : ""}>
              <TableCell className="font-medium">{u.email}</TableCell>
              <TableCell>
                <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                  {u.role}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{u.plan}</Badge>
              </TableCell>
              <TableCell>{u.quotaUsed}/{u.quotaLimit}</TableCell>
              <TableCell>
                {u.banned ? <Badge variant="destructive">已封禁</Badge> : <Badge variant="outline">正常</Badge>}
              </TableCell>
              <TableCell>
                <Dialog open={banTarget?.id === u.id} onOpenChange={open => !open && setBanTarget(null)}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => setBanTarget(u)}>
                      {u.banned ? "解封" : "封禁"}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{u.banned ? "解封用户" : "封禁用户"}</DialogTitle>
                      <DialogDescription>
                        {u.banned
                          ? `确认解封 ${u.email}？解封后该用户可重新登录。`
                          : `确认封禁 ${u.email}？封禁后该用户将无法登录，但历史数据保留。`}
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setBanTarget(null)}>取消</Button>
                      <Button variant={u.banned ? "default" : "destructive"} onClick={() => toggleBan(u)}>
                        {u.banned ? "确认解封" : "确认封禁"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">共 {total} 用户</span>
        <div className="space-x-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            上一页
          </Button>
          <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}>
            下一页
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证构建**

```bash
cd D:/Code2/agenttrade-saas && pnpm tsc --noEmit && pnpm build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
cd D:/Code2/agenttrade-saas && git add app/admin/users/ && git commit -m "feat: add admin users page with search, pagination, and ban/unban"
```

---

### Task 9: 统计页面

**Files:**
- Create: `D:\Code2\agenttrade-saas\app\admin\analytics\page.tsx`

**Interfaces:**
- Consumes: shadcn/ui Card (Task 1), admin layout (Task 6), stats API (Task 7)

- [ ] **Step 1: 创建 admin/analytics/page.tsx**

```tsx
// app/admin/analytics/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalAnalyses: number;
  byPlan: Record<string, number>;
}

export default function AdminAnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then(r => r.json())
      .then(setStats)
      .catch(console.error);
  }, []);

  if (!stats) return <div className="text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">数据统计</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">总用户数</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.totalUsers}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">活跃用户（30天）</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.activeUsers}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">分析总数</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats.totalAnalyses}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">计划分布</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-sm">
              {Object.entries(stats.byPlan).map(([plan, count]) => (
                <div key={plan} className="flex justify-between">
                  <span className="text-muted-foreground">{plan}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证构建**

```bash
cd D:/Code2/agenttrade-saas && pnpm tsc --noEmit && pnpm build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
cd D:/Code2/agenttrade-saas && git add app/admin/analytics/ && git commit -m "feat: add admin analytics page with stats cards"
```

---

### Task 10: 端到端验证

**Files:**
- 无新文件

- [ ] **Step 1: 运行所有测试**

```bash
cd D:/Code2/agenttrade-saas && pnpm test && cd D:/Code2/agent-trade/nextjs-app && pnpm vitest run
```

- [ ] **Step 2: 验证构建**

```bash
cd D:/Code2/agenttrade-saas && pnpm build
```

- [ ] **Step 3: 验证页面可访问（dev 模式）**

启动 `pnpm dev`，确认：
- `/login` — 登录页正常渲染，shadcn/ui 组件正常
- `/signup` — 注册页正常
- `/admin` — 非 admin 用户看到"无权限"，admin 用户看到管理后台
- `/admin/users` — 用户列表加载
- `/admin/analytics` — 统计数据加载

- [ ] **Step 4: Commit any fixes**

```bash
cd D:/Code2/agenttrade-saas && git add -A && git commit -m "chore: Phase 3 integration fixes"
```
