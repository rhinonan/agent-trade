# AgentTrade SaaS Phase 4 — Mock 支付 设计 Spec

**Date:** 2026-06-23
**Status:** 设计确认

## 背景

Phase 2 完成了配额和订阅体系，Phase 3 完成了管理后台。Phase 4 添加支付接口层（Mock）和管理员升级用户计划的能力。

已有基础：
- `SubscriptionRepo.updatePlan(userId, planId)` — Phase 2
- `SubscriptionRepo.getByUserId(userId)` — Phase 2
- 管理后台用户列表页面 — Phase 3
- 计划常量（free/pro/max）— Phase 3

## 目标

1. **支付接口层**：`PaymentProvider` 接口 + `MockPaymentProvider`，为未来真实支付预留扩展点
2. **管理员升级**：在用户列表页直接变更用户计划
3. **API**：`POST /api/admin/users/[id]/plan` — 管理员调 `updatePlan`

## 架构

```
lib/billing/
├── types.ts              ← PaymentProvider 接口 + MockPaymentProvider + 全局单例
└── (已有文件不变)

app/admin/users/
└── page.tsx              ← 计划列加下拉框（Select 组件），选完调 API

app/api/admin/users/[id]/plan/
└── route.ts              ← POST { planId } → updatePlan
```

## PaymentProvider 接口

```typescript
interface CreateOrderInput {
  userId: string;
  planId: string;
  amount: number; // 分，预留
}

interface OrderResult {
  orderId: string;
  payUrl: string; // 扫码地址
}

interface PaymentProvider {
  /** 创建支付订单，返回支付链接 */
  createOrder(input: CreateOrderInput): Promise<OrderResult>;
  /** 验证支付回调签名 */
  verifyWebhook(body: any, signature: string): Promise<{
    userId: string; planId: string; paid: boolean;
  }>;
}

/** 全局单例，默认 Mock，未来 setPaymentProvider 替换 */
let _provider: PaymentProvider = new MockPaymentProvider();
export function getPaymentProvider(): PaymentProvider { return _provider; }
export function setPaymentProvider(p: PaymentProvider): void { _provider = p; }
```

## MockPaymentProvider

```typescript
class MockPaymentProvider implements PaymentProvider {
  async createOrder(input: CreateOrderInput): Promise<OrderResult> {
    throw new Error("Payment not available — use admin panel to upgrade");
  }
  async verifyWebhook(body: any, signature: string) {
    throw new Error("Webhook not available in mock mode");
  }
}
```

## POST /api/admin/users/[id]/plan

权限：middleware `ADMIN_PREFIXES` 自动校验 role=admin

Body：`{ "planId": "pro" }`（free | pro | max）

调用 `SubscriptionRepo.updatePlan(userId, planId)`

## 管理后台计划变更 UI

用户列表每行加一个 Select 下拉框（或直接在现有 Badge 旁边加个可点击的计划选择器）：

- 当前计划显示为 Badge
- 点击 → 下拉选 free/pro/max → 确认 → 调 API
- 变更后自动刷新列表

## 注意事项

- 不创建订单表、支付记录等——Phase 4 只做管理员手动升级
- 调 `updatePlan` 后 quota_limit 会改变，但已消耗配额不重置（这是预期行为）
- `MockPaymentProvider` 的方法全部 throw，确保不会在生产环境意外调用
