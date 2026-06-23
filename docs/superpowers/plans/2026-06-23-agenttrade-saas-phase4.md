# AgentTrade SaaS Phase 4 — Mock 支付 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 定义 PaymentProvider 接口 + Mock 实现，管理员在后台直接升级用户计划

**Architecture:** `lib/billing/types.ts` 新增 PaymentProvider 接口和全局单例（与 AuthAdapter 同模式）。新增 `POST /api/admin/users/[id]/plan` API，管理员用户列表页加计划下拉框直接调 `SubscriptionRepo.updatePlan()`。

**Tech Stack:** TypeScript（接口层），shadcn/ui Select（管理后台）

## Global Constraints

- 全部在 SaaS 仓库（`D:\Code2\agenttrade-saas\`）
- API 受 middleware `ADMIN_PREFIXES` 保护
- MockPaymentProvider 所有方法 throw Error（不在生产环境启用）
- 升级后 quota_limit 改变，已消耗配额不重置
- ESM 模块，`.js` 后缀导入

---

### Task 1: PaymentProvider 接口 + Mock 实现

**Files:**
- Create: `D:\Code2\agenttrade-saas\lib\billing\types.ts`

**Interfaces:**
- Produces: `PaymentProvider` 接口、`MockPaymentProvider`、`getPaymentProvider()` / `setPaymentProvider()`

- [ ] **Step 1: 创建 types.ts**

```typescript
// lib/billing/types.ts

/** 创建支付订单的输入 */
export interface CreateOrderInput {
  userId: string;
  planId: string;
  amount: number; // 单位：分，预留
}

/** 支付订单结果 */
export interface OrderResult {
  orderId: string;
  payUrl: string;
}

/** 支付 webhook 验证结果 */
export interface WebhookResult {
  userId: string;
  planId: string;
  paid: boolean;
}

/** 支付提供者接口——当前 Mock，未来真实接入时替换 */
export interface PaymentProvider {
  /** 创建支付订单，返回扫码链接 */
  createOrder(input: CreateOrderInput): Promise<OrderResult>;
  /** 验证支付回调签名并返回支付结果 */
  verifyWebhook(body: unknown, signature: string): Promise<WebhookResult>;
}

/** Mock 实现——所有方法抛出 "not available" 错误 */
export class MockPaymentProvider implements PaymentProvider {
  async createOrder(_input: CreateOrderInput): Promise<OrderResult> {
    throw new Error("Payment not available — use admin panel to upgrade");
  }
  async verifyWebhook(_body: unknown, _signature: string): Promise<WebhookResult> {
    throw new Error("Webhook not available in mock mode");
  }
}

/** 全局单例——默认 Mock，后续 setPaymentProvider 替换 */
let _provider: PaymentProvider = new MockPaymentProvider();

export function getPaymentProvider(): PaymentProvider {
  return _provider;
}

export function setPaymentProvider(provider: PaymentProvider): void {
  _provider = provider;
}
```

- [ ] **Step 2: 验证编译**

```bash
cd D:/Code2/agenttrade-saas && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd D:/Code2/agenttrade-saas && git add lib/billing/types.ts && git commit -m "feat: add PaymentProvider interface and MockPaymentProvider"
```

---

### Task 2: POST /api/admin/users/[id]/plan

**Files:**
- Create: `D:\Code2\agenttrade-saas\app\api\admin\users\[id]\plan\route.ts`

**Interfaces:**
- Consumes: `SubscriptionRepo.updatePlan()` (Phase 2), `getPlan()` (Phase 2)
- Produces: `POST /api/admin/users/[id]/plan` → `{ userId, planId, quotaLimit }`

- [ ] **Step 1: 创建 route.ts**

```typescript
// app/api/admin/users/[id]/plan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createSubscriptionRepo } from "@/lib/billing/subscription-repo.js";
import { getPlan } from "@/lib/billing/plans.js";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: { planId: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { planId } = body;
  if (!planId || !["free", "pro", "max"].includes(planId)) {
    return NextResponse.json(
      { error: "planId must be one of: free, pro, max" },
      { status: 400 }
    );
  }

  const plan = getPlan(planId);
  if (!plan) {
    return NextResponse.json({ error: `Unknown plan: ${planId}` }, { status: 400 });
  }

  const subscriptionRepo = createSubscriptionRepo();
  const sub = subscriptionRepo.updatePlan(id, planId);

  return NextResponse.json({
    userId: sub.userId,
    planId: sub.plan,
    quotaLimit: sub.quotaLimit,
  });
}
```

- [ ] **Step 2: 验证编译**

```bash
cd D:/Code2/agenttrade-saas && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd D:/Code2/agenttrade-saas && git add app/api/admin/users/[id]/plan/ && git commit -m "feat: add POST /api/admin/users/[id]/plan for plan upgrade"
```

---

### Task 3: 管理后台用户列表加计划下拉框

**Files:**
- Modify: `D:\Code2\agenttrade-saas\app\admin\users\page.tsx`

- [ ] **Step 1: 在现有 Table 中修改"计划"列**

将计划 Badge 替换为可点击的 Select 下拉框。需要先安装 shadcn Select 组件：

```bash
cd D:/Code2/agenttrade-saas && pnpm dlx shadcn@latest add select
```

然后在 page.tsx 中修改计划列：

```tsx
// 在文件顶部加 import
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// 在组件内加升级函数
async function upgradePlan(userId: string, planId: string) {
  const res = await fetch(`/api/admin/users/${userId}/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId }),
  });
  if (res.ok) {
    fetchUsers();
  }
}

// 表格中"计划"列替换为（原来是一行 Badge）：
<TableCell>
  <Select
    defaultValue={u.plan}
    onValueChange={(planId) => upgradePlan(u.id, planId)}
  >
    <SelectTrigger className="w-24 h-8 text-xs">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="free">免费版</SelectItem>
      <SelectItem value="pro">专业版</SelectItem>
      <SelectItem value="max">旗舰版</SelectItem>
    </SelectContent>
  </Select>
</TableCell>
```

- [ ] **Step 2: 运行现有测试 + 构建验证**

```bash
cd D:/Code2/agenttrade-saas && pnpm test && pnpm build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
cd D:/Code2/agenttrade-saas && git add app/admin/users/ components/ui/ && git commit -m "feat: add plan selector dropdown to admin users page"
```

---

### Task 4: 端到端验证

**Files:**
- 无新文件

- [ ] **Step 1: 运行所有测试**

```bash
cd D:/Code2/agenttrade-saas && pnpm test && cd D:/Code2/agent-trade/nextjs-app && pnpm vitest run
```

- [ ] **Step 2: 构建验证**

```bash
cd D:/Code2/agenttrade-saas && pnpm build 2>&1 | tail -5
```

- [ ] **Step 3: Commit any fixes**

```bash
cd D:/Code2/agenttrade-saas && git add -A && git commit -m "chore: Phase 4 integration fixes"
```
