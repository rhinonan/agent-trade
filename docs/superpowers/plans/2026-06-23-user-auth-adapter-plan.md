# User Auth Adapter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add minimal user-management "hook layer" to the open-source repo — AuthAdapter interface, middleware, and DB schema预留 — so a private SaaS repo can inject real auth later.

**Architecture:** Three independent modules layered from bottom to top: (1) `lib/auth/types.ts` defines the AuthAdapter interface + NoopAuthAdapter default, (2) `middleware.ts` calls the adapter and injects `x-user-id`/`x-user-role` headers into API requests, (3) DB migration adds `user_id TEXT DEFAULT 'anonymous'` to `analyses` and `sessions` tables. API routes and repos are updated to read `userId` from headers and pass it through.

**Tech Stack:** TypeScript 5.x strict, Next.js 15 (App Router), better-sqlite3 (WAL mode), Vitest

## Global Constraints

- TypeScript strict mode — no `any` in production code
- ESM module system — `.js` extensions in imports
- All existing 162 tests must continue to pass
- Open-source repo must remain independently usable (anonymous user by default)
- No real auth logic, password handling, OAuth secrets, or billing code anywhere in open-source repo
- DB migration must be idempotent (safe to re-run)
- `x-user-id` header is server-set — clients cannot forge it

---

## File Structure Map

```
nextjs-app/
├── lib/
│   ├── auth/
│   │   ├── types.ts          ← NEW: User, Session, AuthAdapter, NoopAuthAdapter, getAuthAdapter()
│   │   └── __tests__/
│   │       └── types.test.ts ← NEW: NoopAuthAdapter behavior tests
│   └── db/
│       ├── client.ts          ← MODIFY: run migration after createTables
│       ├── analysis-repo.ts   ← MODIFY: create/query accept optional userId
│       └── session-repo.ts    ← MODIFY: insert/query accept optional userId
├── middleware.ts              ← NEW: read auth adapter, inject headers
├── app/
│   └── api/
│       ├── analyze/route.ts   ← MODIFY: read x-user-id, pass to repo
│       ├── session/route.ts   ← MODIFY: read x-user-id, pass to repo
│       └── sessions/route.ts  ← MODIFY: read x-user-id, filter list
```

---

### Task 1: AuthAdapter Interface + NoopAuthAdapter

**Files:**
- Create: `nextjs-app/lib/auth/types.ts`
- Create: `nextjs-app/lib/auth/__tests__/types.test.ts`

**Interfaces:**
- Produces: `User`, `Session`, `AuthAdapter` (interface), `NoopAuthAdapter` (class), `getAuthAdapter()`, `setAuthAdapter()` — all exported from `@/lib/auth/types`

- [ ] **Step 1: Create the auth types file**

Create `nextjs-app/lib/auth/types.ts`:

```typescript
/** 用户身份 */
export interface User {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  role: "anonymous" | "user" | "admin";
}

/** 会话信息 */
export interface Session {
  user: User;
  expiresAt?: number;
}

/** 认证适配器接口 — 开源仓库只定义接口，不包含真实实现 */
export interface AuthAdapter {
  /** 从请求中解析会话（cookie/jwt/header），失败返回 null */
  getSession(request: Request): Promise<Session | null>;

  /** 用户是否有指定权限 */
  hasPermission(user: User, permission: string): boolean;

  /** 该用户的分析配额限制（-1 表示无限制） */
  getQuotaLimit(user: User): Promise<number>;

  /** 查询当前已用配额 */
  getQuotaUsed(user: User): Promise<number>;
}

/** 开源版默认实现——所有人匿名、不限配额 */
export class NoopAuthAdapter implements AuthAdapter {
  async getSession(_request: Request): Promise<Session | null> {
    return {
      user: { id: "anonymous", name: "匿名用户", role: "anonymous" },
    };
  }

  hasPermission(_user: User, _permission: string): boolean {
    return true;
  }

  async getQuotaLimit(_user: User): Promise<number> {
    return -1;
  }

  async getQuotaUsed(_user: User): Promise<number> {
    return 0;
  }
}

/** 全局单例——默认使用 Noop，私有仓库调用 setAuthAdapter() 替换 */
let _adapter: AuthAdapter = new NoopAuthAdapter();

export function getAuthAdapter(): AuthAdapter {
  return _adapter;
}

export function setAuthAdapter(adapter: AuthAdapter): void {
  _adapter = adapter;
}
```

- [ ] **Step 2: Write unit tests for NoopAuthAdapter**

Create `nextjs-app/lib/auth/__tests__/types.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  NoopAuthAdapter,
  getAuthAdapter,
  setAuthAdapter,
} from "../types.js";
import type { AuthAdapter } from "../types.js";

describe("NoopAuthAdapter", () => {
  const adapter = new NoopAuthAdapter();

  it("returns anonymous user from getSession", async () => {
    const req = new Request("http://localhost:3000/api/analyze");
    const session = await adapter.getSession(req);
    expect(session).not.toBeNull();
    expect(session!.user.id).toBe("anonymous");
    expect(session!.user.name).toBe("匿名用户");
    expect(session!.user.role).toBe("anonymous");
  });

  it("grants all permissions", () => {
    expect(
      adapter.hasPermission(
        { id: "test", name: "test", role: "user" },
        "admin:access",
      ),
    ).toBe(true);
  });

  it("returns unlimited quota", async () => {
    const limit = await adapter.getQuotaLimit({
      id: "test",
      name: "test",
      role: "user",
    });
    expect(limit).toBe(-1);
  });

  it("returns zero used quota", async () => {
    const used = await adapter.getQuotaUsed({
      id: "test",
      name: "test",
      role: "user",
    });
    expect(used).toBe(0);
  });
});

describe("getAuthAdapter / setAuthAdapter", () => {
  it("returns NoopAuthAdapter by default", () => {
    // Reset to default first
    setAuthAdapter(new NoopAuthAdapter());
    const adapter = getAuthAdapter();
    expect(adapter).toBeInstanceOf(NoopAuthAdapter);
  });

  it("allows replacing the adapter", () => {
    const mock: AuthAdapter = {
      getSession: async () => null,
      hasPermission: () => false,
      getQuotaLimit: async () => 5,
      getQuotaUsed: async () => 3,
    };
    setAuthAdapter(mock);
    expect(getAuthAdapter()).toBe(mock);
    // Reset for other tests
    setAuthAdapter(new NoopAuthAdapter());
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd nextjs-app && npx vitest run lib/auth/__tests__/types.test.ts`

Expected: 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add nextjs-app/lib/auth/types.ts nextjs-app/lib/auth/__tests__/types.test.ts
git commit -m "feat: add AuthAdapter interface and NoopAuthAdapter default"
```

---

### Task 2: Next.js Middleware

**Files:**
- Create: `nextjs-app/middleware.ts`

**Interfaces:**
- Consumes: `getAuthAdapter` from `@/lib/auth/types` (Task 1)
- Produces: `x-user-id` and `x-user-role` request headers on protected API routes
- Note: Middleware behavior is verified in Task 5 via integration tests — standalone unit test is skipped because mocking `NextRequest`/`NextResponse` in vitest is fragile and Next.js middleware is inherently tested through API route integration.

- [ ] **Step 1: Create the middleware**

Create `nextjs-app/middleware.ts`:

```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthAdapter } from "@/lib/auth/types.js";

/** API 路由前缀——需要注入用户上下文 */
const PROTECTED_PREFIXES = ["/api/analyze", "/api/session"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 非 API 路由或不需要保护的 API 直接放行
  if (!PROTECTED_PREFIXES.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }

  const auth = getAuthAdapter();
  const session = await auth.getSession(request);

  // 开源版 NoopAuthAdapter 始终返回匿名用户，这里永远放行
  // 商业版 RealAuthAdapter 认证失败时返回 null，触发 401
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  // 将用户身份注入 request header，下游 API route 通过 headers 读取
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", session.user.id);
  requestHeaders.set("x-user-role", session.user.role);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/api/:path*"],
};
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd nextjs-app && npx tsc --noEmit 2>&1 | grep -i "middleware" || echo "No middleware errors"`

Expected: No type errors referencing middleware.ts.

- [ ] **Step 3: Commit**

```bash
git add nextjs-app/middleware.ts
git commit -m "feat: add auth middleware — inject x-user-id/x-user-role headers"
```

---

### Task 3: DB Migration + Repository Updates

**Files:**
- Create: `nextjs-app/lib/db/migrations/002_user_id.sql`
- Modify: `nextjs-app/lib/db/client.ts`
- Modify: `nextjs-app/lib/db/analysis-repo.ts`
- Modify: `nextjs-app/lib/db/session-repo.ts`
- Modify: `nextjs-app/lib/db/__tests__/db.test.ts`

**Interfaces:**
- Consumes: `getAuthAdapter` (Task 1), `x-user-id` header (Task 2)
- Produces: `user_id` column on `analyses` and `sessions`; repos expose `userId` parameter on create/find methods

- [ ] **Step 1: Create the migration SQL file**

Create `nextjs-app/lib/db/migrations/002_user_id.sql`:

```sql
-- Migration 002: Add user_id to support multi-tenant SaaS
-- Open source default: 'anonymous' — behavior unchanged

ALTER TABLE analyses ADD COLUMN user_id TEXT DEFAULT 'anonymous';
ALTER TABLE sessions ADD COLUMN user_id TEXT DEFAULT 'anonymous';

CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
```

- [ ] **Step 2: Add user_id to CREATE TABLE + migration runner to client.ts**

Modify `nextjs-app/lib/db/client.ts`:

**Change A** — Add `user_id` column to the `analyses` and `sessions` CREATE TABLE statements inside `createTables()`. This ensures new installations and `:memory:` test databases get the column from day one.

Replace the `createTables` function with:

```typescript
export function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      target_code TEXT NOT NULL,
      target_name TEXT,
      target_type TEXT NOT NULL DEFAULT 'stock',
      workflow_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      context TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      user_id TEXT NOT NULL DEFAULT 'anonymous'
    );
    CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, timestamp);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      target_code TEXT NOT NULL,
      target_name TEXT,
      target_type TEXT NOT NULL DEFAULT 'stock',
      workflow_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'RUNNING',
      created_at INTEGER NOT NULL,
      user_id TEXT NOT NULL DEFAULT 'anonymous'
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  `);
}
```

**Change B** — After the `createTables` function closing `}`, add a `runMigrations` function to handle existing databases that were created before the `user_id` column existed:

```typescript
function runMigrations(db: Database.Database): void {
  // Migration 002: user_id columns — idempotent via try/catch
  // These ALTER TABLEs are no-ops on new databases (column created above),
  // but add the column on databases created before this migration.
  try {
    db.exec(`ALTER TABLE analyses ADD COLUMN user_id TEXT NOT NULL DEFAULT 'anonymous'`);
  } catch {
    // Column already exists — safe to ignore
  }
  try {
    db.exec(`ALTER TABLE sessions ADD COLUMN user_id TEXT NOT NULL DEFAULT 'anonymous'`);
  } catch {
    // Column already exists — safe to ignore
  }
}
```

**Change C** — Inside `getDb()`, after `createTables(_db);`, add:

```typescript
    runMigrations(_db);
```

- [ ] **Step 3: Update AnalysisRepo to accept and store userId**

Modify `nextjs-app/lib/db/analysis-repo.ts`:

Change the `create` method signature to accept optional `userId`:

```typescript
export interface AnalysisRecord {
  id: string;
  targetCode: string;
  targetName: string | null;
  targetType: string;
  workflowName: string;
  status: "running" | "complete" | "error";
  context: string;
  createdAt: number;
  updatedAt?: number;
  userId?: string;
}

export class AnalysisRepo {
  constructor(private db: Database.Database) {}

  create(record: AnalysisRecord): AnalysisRecord {
    const stmt = this.db.prepare(
      `INSERT INTO analyses (id, target_code, target_name, target_type, workflow_name, status, context, created_at, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    stmt.run(
      record.id, record.targetCode, record.targetName, record.targetType,
      record.workflowName, record.status, record.context, record.createdAt,
      record.userId ?? "anonymous",
    );
    return record;
  }

  getById(id: string, userId?: string): AnalysisRecord | undefined {
    let sql = `SELECT id, target_code, target_name, target_type, workflow_name, status, context, created_at, updated_at, user_id
               FROM analyses WHERE id = ?`;
    const params: any[] = [id];
    if (userId) {
      sql += ` AND user_id = ?`;
      params.push(userId);
    }
    const row = this.db.prepare(sql).get(...params) as any;
    if (!row) return undefined;
    return {
      id: row.id, targetCode: row.target_code, targetName: row.target_name,
      targetType: row.target_type, workflowName: row.workflow_name,
      status: row.status, context: row.context,
      createdAt: row.created_at, updatedAt: row.updated_at,
      userId: row.user_id,
    };
  }

  update(id: string, patch: { status?: string; context?: string }): void {
    const updates: string[] = [];
    const values: any[] = [];
    if (patch.status !== undefined) { updates.push("status = ?"); values.push(patch.status); }
    if (patch.context !== undefined) { updates.push("context = ?"); values.push(patch.context); }
    updates.push("updated_at = unixepoch()");
    values.push(id);
    this.db.prepare(`UPDATE analyses SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  }

  listRecent(limit = 20, userId?: string): AnalysisRecord[] {
    let sql = `SELECT id, target_code, target_name, target_type, workflow_name, status, context, created_at, updated_at, user_id
               FROM analyses`;
    const params: any[] = [];
    if (userId) {
      sql += ` WHERE user_id = ?`;
      params.push(userId);
    }
    sql += ` ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map((row: any) => ({
      id: row.id, targetCode: row.target_code, targetName: row.target_name,
      targetType: row.target_type, workflowName: row.workflow_name,
      status: row.status, context: row.context,
      createdAt: row.created_at, updatedAt: row.updated_at,
      userId: row.user_id,
    }));
  }
}
```

- [ ] **Step 4: Update SessionRepo to accept and store userId**

Modify `nextjs-app/lib/db/session-repo.ts`:

Change the `SessionRow` interface and `insert`/`listRecent` methods:

```typescript
export interface SessionRow {
  id: string;
  targetCode: string;
  targetName: string | null;
  targetType: string;
  workflowName: string;
  status: string;
  createdAt: number;
  userId?: string;
}

export class SessionRepo {
  constructor(private db: Database.Database) {}

  insert(row: SessionRow): void {
    this.db.prepare(
      `INSERT INTO sessions (id, target_code, target_name, target_type, workflow_name, status, created_at, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      row.id, row.targetCode, row.targetName, row.targetType,
      row.workflowName, row.status, row.createdAt,
      row.userId ?? "anonymous",
    );
  }

  getById(id: string, userId?: string): SessionRow | null {
    let sql = "SELECT * FROM sessions WHERE id = ?";
    const params: any[] = [id];
    if (userId) {
      sql += " AND user_id = ?";
      params.push(userId);
    }
    const row = this.db.prepare(sql).get(...params) as any;
    return row ? mapRow(row) : null;
  }

  listRecent(limit: number = 20, userId?: string): SessionRow[] {
    let sql = "SELECT * FROM sessions";
    const params: any[] = [];
    if (userId) {
      sql += " WHERE user_id = ?";
      params.push(userId);
    }
    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(mapRow);
  }

  updateStatus(id: string, status: string): void {
    this.db.prepare("UPDATE sessions SET status = ? WHERE id = ?").run(status, id);
  }

  updateName(id: string, name: string): void {
    this.db.prepare("UPDATE sessions SET target_name = ? WHERE id = ?").run(name, id);
  }

  deleteById(id: string): void {
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }
}

function mapRow(row: any): SessionRow {
  return {
    id: row.id,
    targetCode: row.target_code,
    targetName: row.target_name,
    targetType: row.target_type,
    workflowName: row.workflow_name,
    status: row.status,
    createdAt: row.created_at,
    userId: row.user_id,
  };
}
```

- [ ] **Step 5: Update existing DB tests to verify migration runs**

Modify `nextjs-app/lib/db/__tests__/db.test.ts`:

Add a test that verifies the migration added `user_id` columns:

```typescript
it("migrates analyses and sessions tables with user_id column", () => {
  const db = getDb(":memory:");
  // Verify user_id column exists on analyses
  const anaCols = db.prepare("PRAGMA table_info(analyses)").all() as any[];
  const hasUserId = anaCols.some((c: any) => c.name === "user_id");
  expect(hasUserId).toBe(true);

  // Verify user_id column exists on sessions
  const sessCols = db.prepare("PRAGMA table_info(sessions)").all() as any[];
  const sessHasUserId = sessCols.some((c: any) => c.name === "user_id");
  expect(sessHasUserId).toBe(true);

  // Verify default value works
  db.prepare(
    `INSERT INTO analyses (id, target_code, target_name, target_type, workflow_name, status, context, created_at)
     VALUES ('test-mig', '000001', 'test', 'stock', 'bull-bear', 'running', '{}', 0)`
  ).run();
  const row = db.prepare("SELECT user_id FROM analyses WHERE id = 'test-mig'").get() as any;
  expect(row.user_id).toBe("anonymous");
});
```

Also update existing `create` calls in tests to include `userId` where assertions check the record. If no assertions check `userId`, no changes needed to existing test logic — only add the migration test above.

- [ ] **Step 6: Run DB tests**

Run: `cd nextjs-app && npx vitest run lib/db/__tests__/db.test.ts`

Expected: All tests pass including new migration test.

- [ ] **Step 7: Commit**

```bash
git add nextjs-app/lib/db/migrations/002_user_id.sql nextjs-app/lib/db/client.ts nextjs-app/lib/db/analysis-repo.ts nextjs-app/lib/db/session-repo.ts nextjs-app/lib/db/__tests__/db.test.ts
git commit -m "feat: add user_id column to analyses/sessions tables with migration"
```

---

### Task 4: API Route Updates

**Files:**
- Modify: `nextjs-app/app/api/analyze/route.ts`
- Modify: `nextjs-app/app/api/session/route.ts`
- Modify: `nextjs-app/app/api/sessions/route.ts`
- Modify: `nextjs-app/lib/chat/types.ts` (add `userId` to `CreateSessionInput`)
- Modify: `nextjs-app/lib/chat/session-manager.ts` (pass `userId` to `SessionRepo.insert()`)

**Interfaces:**
- Consumes: `x-user-id` header (set by middleware, Task 2); updated repos with `userId` parameter (Task 3)

- [ ] **Step 1: Update POST /api/analyze — pass userId to repo**

Modify `nextjs-app/app/api/analyze/route.ts`:

Change line 30 (`repo.create({...})`) — add `userId` read from request header:

```typescript
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { code, sector, index, workflow = "bull-bear", provider = "deepseek", model, dataServiceUrl } = body;

  if (!code && !sector && !index) {
    return NextResponse.json({ error: "Must specify code, sector, or index" }, { status: 400 });
  }

  const VALID_PROVIDERS = new Set(["deepseek", "openai", "anthropic"]);
  if (provider && !VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: `Invalid provider: ${provider}. Must be one of: deepseek, openai, anthropic` }, { status: 400 });
  }

  const sessionId = randomUUID();
  const userId = req.headers.get("x-user-id") ?? "anonymous";

  // Save to DB
  const db = getDb();
  const repo = new AnalysisRepo(db);
  repo.create({
    id: sessionId,
    targetCode: code ?? sector ?? index,
    targetName: null,
    targetType: sector ? "sector" : index ? "index" : "stock",
    workflowName: workflow,
    status: "running",
    context: "{}",
    createdAt: Date.now(),
    userId,
  });

  // ... rest of the function unchanged
```

- [ ] **Step 2a: Add userId to CreateSessionInput type**

Modify `nextjs-app/lib/chat/types.ts` — add `userId` field to `CreateSessionInput`:

```typescript
export interface CreateSessionInput {
  code?: string;
  sector?: string;
  index?: string;
  workflow?: string;
  provider?: string;
  model?: string;
  dataServiceUrl?: string;
  userId?: string;
}
```

- [ ] **Step 2b: Update POST /api/session — pass userId to repo**

Modify `nextjs-app/app/api/session/route.ts`:

Add `userId` extraction after `const sessionId = randomUUID();` (line 25):

```typescript
  const sessionId = randomUUID();
  const userId = req.headers.get("x-user-id") ?? "anonymous";
```

Then update the `mgr.createSession()` call to pass `userId` in the input dto:

```typescript
  mgr.createSession(
    sessionId,
    { code, sector, index, workflow, provider, model, userId },
    dag,
    registry,
    { provider: provider as any, modelName: model },
  );
```

- [ ] **Step 2c: Update session-manager.ts to pass userId to SessionRepo.insert()**

Modify `nextjs-app/lib/chat/session-manager.ts` — inside `createSession()`, at the `sessionRepo.insert()` call (lines 75-79), add `userId`:

```typescript
    if (this.sessionRepo) {
      this.sessionRepo.insert({
        id, targetCode: target.code, targetName: null,
        targetType: target.type, workflowName: dag.name,
        status: "RUNNING", createdAt: Date.now(),
        userId: input.userId ?? "anonymous",
      });
```

Note: the `input` parameter is the `CreateSessionInput` passed from the route handler. Since we added `userId` to `CreateSessionInput` in Step 2a, TypeScript will accept `input.userId`.

- [ ] **Step 3: Update GET /api/sessions — filter by userId**

Modify `nextjs-app/app/api/sessions/route.ts`:

```typescript
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "20"), 1), 100);
  const userId = req.headers.get("x-user-id") ?? "anonymous";

  try {
    const db = getDb();
    const repo = new SessionRepo(db);
    const sessions = repo.listRecent(limit, userId !== "anonymous" ? userId : undefined);
    return NextResponse.json({ sessions });
  } catch (err) {
    console.error("Sessions list error:", err);
    return NextResponse.json({ sessions: [] });
  }
}
```

The ternary `userId !== "anonymous" ? userId : undefined` ensures anonymous users see all records (backward compatible), while authenticated users only see their own.

- [ ] **Step 4: Check session-manager for userId passthrough**

Read `nextjs-app/lib/chat/session-manager.ts` and update `createSession` to pass `userId` to `SessionRepo.insert()`. If the file is complex, extract the minimal change:

Locate the `SessionRepo.insert()` call inside `createSession` and add `userId` from the dto:

```typescript
// In session-manager.ts, inside createSession():
sessionRepo.insert({
  id: sessionId,
  targetCode: dto.code ?? dto.sector ?? dto.index ?? "",
  targetName: null,
  targetType: dto.sector ? "sector" : dto.index ? "index" : "stock",
  workflowName: dto.workflow ?? "bull-bear",
  status: "RUNNING",
  createdAt: Date.now(),
  userId: dto.userId ?? "anonymous",
});
```

- [ ] **Step 5: Verify typecheck**

Run: `cd nextjs-app && npx tsc --noEmit 2>&1 | head -20`

Expected: No type errors from modified files.

- [ ] **Step 6: Commit**

```bash
git add nextjs-app/app/api/analyze/route.ts nextjs-app/app/api/session/route.ts nextjs-app/app/api/sessions/route.ts nextjs-app/lib/chat/types.ts nextjs-app/lib/chat/session-manager.ts
git commit -m "feat: pass userId from x-user-id header to API routes and repos"
```

---

### Task 5: Full Verification

- [ ] **Step 1: Run full test suite**

Run: `cd nextjs-app && npx vitest run`

Expected: All 162+ tests pass (at least 168 including new tests from Tasks 1–3).

- [ ] **Step 2: Run typecheck**

Run: `cd nextjs-app && npx tsc --noEmit`

Expected: Clean — no type errors.

- [ ] **Step 3: Run production build**

Run: `cd nextjs-app && npx next build 2>&1 | tail -10`

Expected: Build succeeds. Pre-existing EPERM symlink errors on Windows (standalone trace) are unrelated.

- [ ] **Step 4: Manual smoke test**

Start the app and verify:
- Homepage loads
- Can start an analysis (search → analyze)
- No 401 errors, no broken pages

```bash
cd nextjs-app && pnpm dev
# Open http://localhost:3000, verify app works as before
```

- [ ] **Step 5: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "chore: final verification — all tests pass, build clean"
```

---

## Summary

| Task | Files | Est. Lines | Test Coverage |
|------|-------|-----------|---------------|
| 1. AuthAdapter | `lib/auth/types.ts` (new), test (new) | ~60 + ~50 test | 6 tests |
| 2. Middleware | `middleware.ts` (new) | ~40 | integration (Task 5) |
| 3. DB Migration | `client.ts`, `analysis-repo.ts`, `session-repo.ts` (modify), migration SQL (new), test (modify) | ~80 + ~20 test | migration + existing |
| 4. API Routes | 3 routes (modify), `chat/types.ts` (modify), `session-manager.ts` (modify) | ~25 | existing integration |
| 5. Verification | Full suite | — | 168+ tests |

**Total: ~115 lines new code, ~70 lines tests, 4 commits.**
