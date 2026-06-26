# Wishpool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a GitHub-Issues-style public feature request board (许愿池) on top of the existing placeholder page, with status workflow, tag filtering, emoji reactions, and threaded comments.

**Architecture:** Next.js SSR pages with SQLite backend, following the existing analyze page pattern. Server components read directly from SQLite via repo functions; interactive elements (reactions, comments, filters) are `"use client"` components that call API routes for write operations. No new dependencies — all UI built on existing shadcn/ui primitives + native HTML elements.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript 5 strict, SQLite (better-sqlite3), Tailwind CSS 4, Zod, react-markdown + remark-gfm

## Global Constraints

- No new npm dependencies (no radix-ui, no lucide-react — open-source side doesn't have them)
- `"use client"` only on interactive leaf components; pages are server components by default
- All DB tables include `user_id TEXT NOT NULL DEFAULT 'anonymous'` for multi-tenant support
- API routes read `x-user-id` / `x-user-role` from request headers (set by middleware)
- ESM imports use `.js` extensions for relative paths inside `lib/`
- Strict TypeScript — no `any` in production code
- Migration idempotency via `CREATE TABLE IF NOT EXISTS`
- URL searchParams drive filtering on the list page (SSR-compatible)

---

### Task 1: Types & Zod Schemas (Foundation)

**Files:**
- Create: `lib/wishpool/types.ts`

**Interfaces:**
- Produces: All shared types (`Wish`, `WishWithMeta`, `CommentTree`, etc.) and Zod validation schemas (`createWishSchema`, `updateWishSchema`, `createCommentSchema`, `setReactionSchema`, `wishFiltersSchema`)

- [ ] **Step 1: Write types.ts**

```typescript
// lib/wishpool/types.ts
import { z } from "zod";

// ── Status ──────────────────────────────────────────────
export const WISH_STATUS = ["open", "in_progress", "done", "closed"] as const;
export type WishStatus = (typeof WISH_STATUS)[number];

export const WISH_STATUS_LABELS: Record<WishStatus, string> = {
  open: "待处理",
  in_progress: "进行中",
  done: "已完成",
  closed: "已关闭",
};

// ── Tags ────────────────────────────────────────────────
export const PRESET_TAGS = ["功能请求", "体验优化", "数据相关", "Bug修复"] as const;

// ── Reactions ───────────────────────────────────────────
export const REACTION_EMOJIS = ["👍", "👎", "😄", "🎉", "😕", "❤️"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

// ── Sort ────────────────────────────────────────────────
export const WISH_SORT_OPTIONS = ["latest", "popular", "updated"] as const;
export type WishSort = (typeof WISH_SORT_OPTIONS)[number];

// ── DB Row Types ────────────────────────────────────────
export interface Wish {
  id: string;
  title: string;
  body: string;
  status: WishStatus;
  pinned: number; // SQLite boolean (0|1)
  author_id: string;
  author_name: string;
  created_at: number;
  updated_at: number;
}

export interface WishTagRow {
  id: number;
  wish_id: string;
  tag: string;
}

export interface WishReactionRow {
  wish_id: string;
  user_id: string;
  emoji: ReactionEmoji;
}

export interface WishCommentRow {
  id: string;
  wish_id: string;
  parent_id: string | null;
  author_id: string;
  author_name: string;
  body: string;
  created_at: number;
}

// ── Display Types ───────────────────────────────────────
export interface ReactionCount {
  emoji: ReactionEmoji;
  count: number;
  reacted: boolean;
}

export interface WishWithMeta extends Wish {
  tags: string[];
  reactions: ReactionCount[];
  comment_count: number;
}

export interface CommentTree extends WishCommentRow {
  replies: WishCommentRow[];
}

// ── Zod Schemas ─────────────────────────────────────────
export const createWishSchema = z.object({
  title: z.string().min(1, "标题不能为空").max(200),
  body: z.string().max(20000).default(""),
  tags: z.array(z.string()).max(5).default([]),
});

export type CreateWishInput = z.infer<typeof createWishSchema>;

export const updateWishSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(20000).optional(),
  status: z.enum(WISH_STATUS).optional(),
  pinned: z.boolean().optional(),
  tags: z.array(z.string()).max(5).optional(),
});

export type UpdateWishInput = z.infer<typeof updateWishSchema>;

export const createCommentSchema = z.object({
  body: z.string().min(1, "评论不能为空").max(5000),
  parent_id: z.string().nullable().default(null),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const setReactionSchema = z.object({
  emoji: z.enum(REACTION_EMOJIS),
});

export const wishFiltersSchema = z.object({
  status: z.enum(WISH_STATUS).optional(),
  tag: z.string().optional(),
  q: z.string().max(100).optional(),
  sort: z.enum(WISH_SORT_OPTIONS).default("latest"),
  page: z.coerce.number().int().min(0).default(0),
});

export type WishFilters = z.infer<typeof wishFiltersSchema>;
```

- [ ] **Step 2: Type check**

Run: `cd agent-trade && pnpm lint`

---

### Task 2: Database Migration & Table Creation

**Files:**
- Create: `lib/db/migrations/003-wishpool.ts`
- Modify: `lib/db/client.ts`

**Interfaces:**
- Consumes: Table schemas from spec
- Produces: `migrate(db)` function exported from `003-wishpool.ts`; 4 tables in agenttrade.db

- [ ] **Step 1: Write the migration file**

```typescript
// lib/db/migrations/003-wishpool.ts
import type Database from "better-sqlite3";

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wishes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      pinned INTEGER NOT NULL DEFAULT 0,
      author_id TEXT NOT NULL DEFAULT 'anonymous',
      author_name TEXT NOT NULL DEFAULT '匿名用户',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_wishes_status ON wishes(status);
    CREATE INDEX IF NOT EXISTS idx_wishes_pinned ON wishes(pinned);
    CREATE INDEX IF NOT EXISTS idx_wishes_created ON wishes(created_at DESC);

    CREATE TABLE IF NOT EXISTS wish_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      UNIQUE(wish_id, tag)
    );
    CREATE INDEX IF NOT EXISTS idx_wish_tags_tag ON wish_tags(tag);

    CREATE TABLE IF NOT EXISTS wish_reactions (
      wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL DEFAULT 'anonymous',
      emoji TEXT NOT NULL,
      PRIMARY KEY (wish_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS wish_comments (
      id TEXT PRIMARY KEY,
      wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
      parent_id TEXT,
      author_id TEXT NOT NULL DEFAULT 'anonymous',
      author_name TEXT NOT NULL DEFAULT '匿名用户',
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_wish_comments_wish ON wish_comments(wish_id, created_at);
  `);
}
```

- [ ] **Step 2: Wire migration into db/client.ts**

Read `lib/db/client.ts`. Add import and call in `runMigrations()`:

```typescript
// Add near other imports at top:
import { migrate as migrate003 } from "./migrations/003-wishpool.js";

// Add at end of runMigrations() body, before the closing brace:
  // Migration 004: wishpool tables
  migrate003(db);
```

- [ ] **Step 3: Verify table creation**

Create a quick inline check — add this temporarily to `createTables()` and remove after verifying, or just run a smoke test:

Run: `cd agent-trade && node -e "import('./lib/db/client.js').then(m => { const db = m.getDb(); const tables = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'wish%'\").all(); console.log(tables); })"`
Expected: Output includes `wishes`, `wish_tags`, `wish_reactions`, `wish_comments`

- [ ] **Step 4: Commit**

```bash
git add lib/db/migrations/003-wishpool.ts lib/db/client.ts
git commit -m "feat: add wishpool database tables"
```

---

### Task 3: Wishpool Repo — Core CRUD

**Files:**
- Create: `lib/wishpool/repo.ts`
- Create: `lib/wishpool/__tests__/repo.test.ts`

**Interfaces:**
- Consumes: Types from Task 1, `getDb()` from `lib/db/client.ts`
- Produces: `createWish()`, `getWish()`, `listWishes()`, `updateWish()`, `deleteWish()`, `getUsedTags()`

- [ ] **Step 1: Write the failing test skeleton**

```typescript
// lib/wishpool/__tests__/repo.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { getDb, setDb, resetDb } from "@/lib/db/client.js";
import {
  createWish,
  getWish,
  listWishes,
  updateWish,
  deleteWish,
  getUsedTags,
} from "../repo.js";
import type { CreateWishInput, WishWithMeta } from "../types.js";

let db: Database.Database;

beforeAll(() => {
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  // Recreate tables in memory
  db.exec(`
    CREATE TABLE IF NOT EXISTS wishes (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open', pinned INTEGER NOT NULL DEFAULT 0,
      author_id TEXT NOT NULL DEFAULT 'anonymous', author_name TEXT NOT NULL DEFAULT '匿名用户',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS wish_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT, wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
      tag TEXT NOT NULL, UNIQUE(wish_id, tag)
    );
    CREATE TABLE IF NOT EXISTS wish_reactions (
      wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL DEFAULT 'anonymous', emoji TEXT NOT NULL,
      PRIMARY KEY (wish_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS wish_comments (
      id TEXT PRIMARY KEY, wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE,
      parent_id TEXT, author_id TEXT NOT NULL DEFAULT 'anonymous',
      author_name TEXT NOT NULL DEFAULT '匿名用户', body TEXT NOT NULL, created_at INTEGER NOT NULL
    );
  `);
  setDb(db);
});

afterAll(() => {
  resetDb();
});

describe("createWish", () => {
  it("creates a wish with tags and returns WishWithMeta", () => {
    const input: CreateWishInput = {
      title: "暗夜模式支持",
      body: "需要夜间主题",
      tags: ["体验优化"],
    };
    const result = createWish("user-1", "Alice", input);
    expect(result.title).toBe("暗夜模式支持");
    expect(result.status).toBe("open");
    expect(result.tags).toContain("体验优化");
    expect(result.comment_count).toBe(0);
    expect(result.id).toBeTruthy();
  });
});

describe("getWish", () => {
  it("returns null for missing wish", () => {
    expect(getWish("nonexistent", "anonymous")).toBeNull();
  });

  it("returns WishWithMeta with reaction flags for the requesting user", () => {
    const created = createWish("user-1", "Bob", {
      title: "测试",
      body: "",
      tags: [],
    });
    const result = getWish(created.id, "viewer-1");
    expect(result).not.toBeNull();
    expect(result!.id).toBe(created.id);
  });
});

describe("listWishes", () => {
  it("returns paginated results with total count", () => {
    // Seed 3 wishes
    for (let i = 1; i <= 3; i++) {
      createWish("user-1", "Tester", { title: `Wish ${i}`, body: "", tags: [] });
    }
    const page = listWishes({ sort: "latest", page: 0 }, "anonymous");
    expect(page.items.length).toBeGreaterThanOrEqual(3);
    expect(page.total).toBeGreaterThanOrEqual(3);
    expect(page.page).toBe(0);
  });

  it("filters by status", () => {
    const page = listWishes({ status: "open", sort: "latest", page: 0 }, "anonymous");
    expect(page.items.every((w) => w.status === "open")).toBe(true);
  });

  it("filters by tag", () => {
    createWish("user-1", "T", { title: "Tagged wish", body: "", tags: ["数据相关"] });
    const page = listWishes({ tag: "数据相关", sort: "latest", page: 0 }, "anonymous");
    expect(page.items.length).toBeGreaterThanOrEqual(1);
    expect(page.items.some((w) => w.tags.includes("数据相关"))).toBe(true);
  });

  it("searches by keyword", () => {
    createWish("user-1", "T", { title: "独一无二关键词测试", body: "", tags: [] });
    const page = listWishes({ q: "独一无二关键词测试", sort: "latest", page: 0 }, "anonymous");
    expect(page.items.length).toBe(1);
  });

  it("puts pinned items first", () => {
    const w = createWish("user-1", "T", { title: "Pinned item", body: "", tags: [] });
    updateWish(w.id, "admin", "admin", { pinned: true });
    const page = listWishes({ sort: "latest", page: 0 }, "anonymous");
    if (page.items.length > 1) {
      expect(page.items[0].pinned).toBe(1);
    }
  });
});

describe("updateWish", () => {
  it("updates status and tags", () => {
    const created = createWish("user-1", "X", { title: "Old", body: "", tags: ["功能请求"] });
    const updated = updateWish(created.id, "user-1", "user", {
      status: "in_progress",
      tags: ["功能请求", "数据相关"],
    });
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("in_progress");
    expect(updated!.tags).toEqual(expect.arrayContaining(["功能请求", "数据相关"]));
  });

  it("rejects non-author non-admin edits", () => {
    const created = createWish("user-1", "X", { title: "Mine", body: "", tags: [] });
    const result = updateWish(created.id, "user-2", "user", { status: "done" });
    expect(result).toBeNull();
  });

  it("allows admin to edit anyone's wish", () => {
    const created = createWish("user-1", "X", { title: "User wish", body: "", tags: [] });
    const result = updateWish(created.id, "admin-1", "admin", { status: "done" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("done");
  });
});

describe("getUsedTags", () => {
  it("returns distinct tags in use", () => {
    createWish("u", "A", { title: "T1", body: "", tags: ["Bug修复"] });
    createWish("u", "A", { title: "T2", body: "", tags: ["Bug修复", "体验优化"] });
    const tags = getUsedTags();
    expect(tags).toContain("Bug修复");
    expect(tags).toContain("体验优化");
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `cd agent-trade && pnpm vitest run lib/wishpool/__tests__/repo.test.ts`
Expected: FAIL — module not found or functions not exported

- [ ] **Step 3: Implement the repo**

```typescript
// lib/wishpool/repo.ts
import { getDb } from "@/lib/db/client.js";
import type {
  Wish,
  WishWithMeta,
  WishFilters,
  CreateWishInput,
  UpdateWishInput,
  ReactionCount,
  ReactionEmoji,
  WishTagRow,
  CommentTree,
  WishCommentRow,
} from "./types.js";
import { REACTION_EMOJIS } from "./types.js";

const PAGE_SIZE = 20;

// ── Wishes CRUD ────────────────────────────────────────

export function createWish(
  authorId: string,
  authorName: string,
  input: CreateWishInput,
): WishWithMeta {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  const insertWish = db.prepare(`
    INSERT INTO wishes (id, title, body, author_id, author_name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTag = db.prepare(`
    INSERT OR IGNORE INTO wish_tags (wish_id, tag) VALUES (?, ?)
  `);

  const txn = db.transaction(() => {
    insertWish.run(id, input.title, input.body, authorId, authorName, now, now);
    for (const tag of input.tags) {
      insertTag.run(id, tag);
    }
  });
  txn();

  return getWish(id, authorId)!;
}

export function getWish(id: string, viewerId: string): WishWithMeta | null {
  const db = getDb();
  const wish = db.prepare("SELECT * FROM wishes WHERE id = ?").get(id) as Wish | undefined;
  if (!wish) return null;

  const tags = (
    db.prepare("SELECT tag FROM wish_tags WHERE wish_id = ?").all(id) as WishTagRow[]
  ).map((r) => r.tag);

  const reactionRows = db
    .prepare(
      "SELECT emoji, COUNT(*) as count FROM wish_reactions WHERE wish_id = ? GROUP BY emoji",
    )
    .all(id) as { emoji: ReactionEmoji; count: number }[];

  const userEmoji = (
    db
      .prepare("SELECT emoji FROM wish_reactions WHERE wish_id = ? AND user_id = ?")
      .get(id, viewerId) as { emoji: ReactionEmoji } | undefined
  )?.emooji ?? null;

  const reactions: ReactionCount[] = REACTION_EMOJIS.map((emoji) => {
    const row = reactionRows.find((r) => r.emoji === emoji);
    return {
      emoji,
      count: row ? row.count : 0,
      reacted: userEmoji === emoji,
    };
  });

  const { count: comment_count } = db
    .prepare("SELECT COUNT(*) as count FROM wish_comments WHERE wish_id = ?")
    .get(id) as { count: number };

  return { ...wish, tags, reactions, comment_count };
}

export function listWishes(
  filters: WishFilters,
  viewerId: string,
): { items: WishWithMeta[]; total: number; page: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filters.status) {
    conditions.push("w.status = ?");
    params.push(filters.status);
  }
  if (filters.q) {
    conditions.push("w.title LIKE ?");
    params.push(`%${filters.q}%`);
  }
  if (filters.tag) {
    conditions.push(
      "EXISTS (SELECT 1 FROM wish_tags wt WHERE wt.wish_id = w.id AND wt.tag = ?)",
    );
    params.push(filters.tag);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  let orderBy: string;
  switch (filters.sort) {
    case "popular":
      orderBy =
        "ORDER BY w.pinned DESC, (SELECT COUNT(*) FROM wish_reactions wr WHERE wr.wish_id = w.id) DESC, w.created_at DESC";
      break;
    case "updated":
      orderBy = "ORDER BY w.pinned DESC, w.updated_at DESC";
      break;
    default:
      orderBy = "ORDER BY w.pinned DESC, w.created_at DESC";
  }

  const { total } = db
    .prepare(`SELECT COUNT(*) as total FROM wishes w ${where}`)
    .get(...params) as { total: number };

  const offset = filters.page * PAGE_SIZE;
  const rows = db
    .prepare(
      `SELECT w.* FROM wishes w ${where} ${orderBy} LIMIT ? OFFSET ?`,
    )
    .all(...params, PAGE_SIZE, offset) as Wish[];

  // Batch-load tags for all rows
  const tagRows = db
    .prepare(
      `SELECT wish_id, tag FROM wish_tags WHERE wish_id IN (${rows.map(() => "?").join(",")})`,
    )
    .all(...rows.map((r) => r.id)) as WishTagRow[];

  const tagsByWish = new Map<string, string[]>();
  for (const tr of tagRows) {
    const arr = tagsByWish.get(tr.wish_id) ?? [];
    arr.push(tr.tag);
    tagsByWish.set(tr.wish_id, arr);
  }

  const items: WishWithMeta[] = rows.map((w) => {
    const tags = tagsByWish.get(w.id) ?? [];
    const { count: comment_count } = db
      .prepare("SELECT COUNT(*) as count FROM wish_comments WHERE wish_id = ?")
      .get(w.id) as { count: number };
    // Reactions summary — aggregated
    const reactionRows = db
      .prepare(
        "SELECT emoji, COUNT(*) as count FROM wish_reactions WHERE wish_id = ? GROUP BY emoji",
      )
      .all(w.id) as { emoji: ReactionEmoji; count: number }[];
    const userEmoji = (
      db
        .prepare("SELECT emoji FROM wish_reactions WHERE wish_id = ? AND user_id = ?")
        .get(w.id, viewerId) as { emoji: ReactionEmoji } | undefined
    )?.emoji ?? null;
    const reactions: ReactionCount[] = REACTION_EMOJIS.map((emoji) => {
      const row = reactionRows.find((r) => r.emoji === emoji);
      return { emoji, count: row ? row.count : 0, reacted: userEmoji === emoji };
    });
    return { ...w, tags, reactions, comment_count };
  });

  return { items, total, page: filters.page };
}

export function updateWish(
  id: string,
  userId: string,
  userRole: string,
  input: UpdateWishInput,
): WishWithMeta | null {
  const db = getDb();
  const existing = db.prepare("SELECT * FROM wishes WHERE id = ?").get(id) as Wish | undefined;
  if (!existing) return null;

  // Permission check: author or admin
  if (existing.author_id !== userId && userRole !== "admin") return null;

  // Non-admin cannot toggle pinned
  const pinned =
    input.pinned !== undefined
      ? userRole === "admin"
        ? input.pinned
          ? 1
          : 0
        : existing.pinned
      : existing.pinned;

  const txn = db.transaction(() => {
    const sets: string[] = [];
    const params: (string | number)[] = [];

    if (input.title !== undefined) {
      sets.push("title = ?");
      params.push(input.title);
    }
    if (input.body !== undefined) {
      sets.push("body = ?");
      params.push(input.body);
    }
    if (input.status !== undefined) {
      sets.push("status = ?");
      params.push(input.status);
    }
    if (input.pinned !== undefined && userRole === "admin") {
      sets.push("pinned = ?");
      params.push(pinned);
    }
    sets.push("updated_at = ?");
    params.push(Math.floor(Date.now() / 1000));

    if (sets.length > 1) {
      params.push(id);
      db.prepare(`UPDATE wishes SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    }

    // Replace tags if provided
    if (input.tags !== undefined) {
      db.prepare("DELETE FROM wish_tags WHERE wish_id = ?").run(id);
      const insertTag = db.prepare("INSERT OR IGNORE INTO wish_tags (wish_id, tag) VALUES (?, ?)");
      for (const tag of input.tags) {
        insertTag.run(id, tag);
      }
    }
  });
  txn();

  return getWish(id, userId);
}

// ── Tags ─────────────────────────────────────────────────

export function getUsedTags(): string[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT DISTINCT tag FROM wish_tags ORDER BY tag")
    .all() as WishTagRow[];
  return rows.map((r) => r.tag);
}

// ── Comments ────────────────────────────────────────────

export function createComment(
  wishId: string,
  authorId: string,
  authorName: string,
  body: string,
  parentId: string | null,
): WishCommentRow {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(`
    INSERT INTO wish_comments (id, wish_id, parent_id, author_id, author_name, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, wishId, parentId, authorId, authorName, body, now);

  // Touch wish updated_at
  db.prepare("UPDATE wishes SET updated_at = ? WHERE id = ?").run(now, wishId);

  return db.prepare("SELECT * FROM wish_comments WHERE id = ?").get(id) as WishCommentRow;
}

export function getComments(wishId: string): CommentTree[] {
  const db = getDb();
  const all = db
    .prepare("SELECT * FROM wish_comments WHERE wish_id = ? ORDER BY created_at ASC")
    .all(wishId) as WishCommentRow[];

  // Build tree: top-level + one level of replies
  const topLevel = all.filter((c) => c.parent_id === null);
  const replies = all.filter((c) => c.parent_id !== null);

  return topLevel.map((c) => ({
    ...c,
    replies: replies.filter((r) => r.parent_id === c.id),
  }));
}

export function deleteComment(
  commentId: string,
  userId: string,
  userRole: string,
): boolean {
  const db = getDb();
  const comment = db
    .prepare("SELECT * FROM wish_comments WHERE id = ?")
    .get(commentId) as WishCommentRow | undefined;
  if (!comment) return false;
  if (comment.author_id !== userId && userRole !== "admin") return false;

  db.prepare("DELETE FROM wish_comments WHERE id = ?").run(commentId);
  return true;
}

// ── Reactions ───────────────────────────────────────────

export function setReaction(
  wishId: string,
  userId: string,
  emoji: ReactionEmoji,
): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO wish_reactions (wish_id, user_id, emoji) VALUES (?, ?, ?)
  `).run(wishId, userId, emoji);
}

export function removeReaction(wishId: string, userId: string): void {
  const db = getDb();
  db.prepare("DELETE FROM wish_reactions WHERE wish_id = ? AND user_id = ?").run(
    wishId,
    userId,
  );
}
```

- [ ] **Step 4: Run tests**

Run: `cd agent-trade && pnpm vitest run lib/wishpool/__tests__/repo.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/wishpool/types.ts lib/wishpool/repo.ts lib/wishpool/__tests__/repo.test.ts
git commit -m "feat: add wishpool types, repo with full CRUD and tests"
```

---

### Task 4: Wishpool Utils

**Files:**
- Create: `lib/wishpool/utils.ts`
- Modify: `lib/utils.ts` (add `formatRelativeTime`)

**Interfaces:**
- Produces: `formatRelativeTime(timestamp)`, `renderMarkdown(body)` (simple wrapper)

- [ ] **Step 1: Add relative time to lib/utils.ts**

```typescript
// Append to lib/utils.ts:
export function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} 天前`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} 个月前`;
  return `${Math.floor(diff / 31536000)} 年前`;
}
```

- [ ] **Step 2: Write lib/wishpool/utils.ts**

```typescript
// lib/wishpool/utils.ts
import { WISH_STATUS_LABELS } from "./types.js";
import type { WishStatus, ReactionEmoji } from "./types.js";
export { WISH_STATUS_LABELS };

export function statusLabel(status: WishStatus): string {
  return WISH_STATUS_LABELS[status];
}

export function statusColor(status: WishStatus): string {
  switch (status) {
    case "open":
      return "bg-green-500/10 text-green-400 border-green-500/30";
    case "in_progress":
      return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    case "done":
      return "bg-purple-500/10 text-purple-400 border-purple-500/30";
    case "closed":
      return "bg-zinc-500/10 text-zinc-500 border-zinc-500/30";
  }
}

export function emojiLabel(emoji: ReactionEmoji): string {
  const labels: Record<ReactionEmoji, string> = {
    "👍": "赞同",
    "👎": "反对",
    "😄": "开心",
    "🎉": "庆祝",
    "😕": "困惑",
    "❤️": "喜爱",
  };
  return labels[emoji];
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/utils.ts lib/wishpool/utils.ts
git commit -m "feat: add wishpool utils and relative time formatter"
```

---

### Task 5: API Routes — Wishes List & Create

**Files:**
- Create: `app/api/wishes/route.ts`
- Modify: `middleware.ts` (add `/api/wishes` to PROTECTED_PREFIXES)

**Interfaces:**
- Consumes: `listWishes()`, `createWish()` from repo; `wishFiltersSchema`, `createWishSchema` from types
- Produces: `GET /api/wishes` (list with filters), `POST /api/wishes` (create)

- [ ] **Step 1: Update middleware to protect wish API routes**

In `middleware.ts`, change:
```typescript
const PROTECTED_PREFIXES = ["/api/analyze", "/api/session"];
```
to:
```typescript
const PROTECTED_PREFIXES = ["/api/analyze", "/api/session", "/api/wishes"];
```

- [ ] **Step 2: Write GET + POST route**

```typescript
// app/api/wishes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { listWishes, createWish } from "@/lib/wishpool/repo.js";
import { wishFiltersSchema, createWishSchema } from "@/lib/wishpool/types.js";

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const parsed = wishFiltersSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const result = listWishes(parsed.data, userId);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createWishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const userName = req.headers.get("x-user-name") ?? "匿名用户";
  const wish = createWish(userId, userName, parsed.data);
  return NextResponse.json(wish, { status: 201 });
}
```

- [ ] **Step 3: Smoke test with curl**

```bash
# Start dev server in background, then:
curl -s "http://localhost:3000/api/wishes?sort=latest&page=0" | head -c 200
# Expected: {"items":[],"total":0,"page":0}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/wishes/route.ts middleware.ts
git commit -m "feat: add GET/POST /api/wishes with filtering"
```

---

### Task 6: API Route — Single Wish (GET + PATCH)

**Files:**
- Create: `app/api/wishes/[id]/route.ts`

**Interfaces:**
- Consumes: `getWish()`, `updateWish()` from repo; `updateWishSchema` from types

- [ ] **Step 1: Write the route**

```typescript
// app/api/wishes/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getWish, updateWish } from "@/lib/wishpool/repo.js";
import { updateWishSchema } from "@/lib/wishpool/types.js";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const wish = getWish(id, userId);
  if (!wish) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(wish);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = updateWishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const userRole = req.headers.get("x-user-role") ?? "anonymous";
  const updated = updateWish(id, userId, userRole, parsed.data);
  if (updated === null) {
    return NextResponse.json(
      { error: "Not found or permission denied" },
      { status: 403 },
    );
  }
  return NextResponse.json(updated);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/wishes/[id]/route.ts
git commit -m "feat: add GET/PATCH /api/wishes/[id]"
```

---

### Task 7: API Routes — Comments & Tags

**Files:**
- Create: `app/api/wishes/[id]/comments/route.ts`
- Create: `app/api/wishes/[id]/comments/[cid]/route.ts`
- Create: `app/api/wishes/tags/route.ts`

**Interfaces:**
- Consumes: `createComment()`, `getComments()`, `deleteComment()`, `getUsedTags()` from repo

- [ ] **Step 1: Write POST comments + GET tags**

```typescript
// app/api/wishes/[id]/comments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createComment, getComments } from "@/lib/wishpool/repo.js";
import { createCommentSchema } from "@/lib/wishpool/types.js";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const comments = getComments(id);
  return NextResponse.json(comments);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = createCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const userName = req.headers.get("x-user-name") ?? "匿名用户";
  const comment = createComment(id, userId, userName, parsed.data.body, parsed.data.parent_id);
  return NextResponse.json(comment, { status: 201 });
}
```

```typescript
// app/api/wishes/[id]/comments/[cid]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { deleteComment } from "@/lib/wishpool/repo.js";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; cid: string }> },
) {
  const { cid } = await params;
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  const userRole = req.headers.get("x-user-role") ?? "anonymous";
  const ok = deleteComment(cid, userId, userRole);
  if (!ok) {
    return NextResponse.json(
      { error: "Not found or permission denied" },
      { status: 403 },
    );
  }
  return NextResponse.json({ ok: true });
}
```

```typescript
// app/api/wishes/tags/route.ts
import { NextResponse } from "next/server";
import { getUsedTags } from "@/lib/wishpool/repo.js";

export async function GET() {
  const tags = getUsedTags();
  return NextResponse.json(tags);
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/wishes/
git commit -m "feat: add comment and tag API routes"
```

---

### Task 8: API Route — Reactions

**Files:**
- Create: `app/api/wishes/[id]/reactions/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// app/api/wishes/[id]/reactions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { setReaction, removeReaction } from "@/lib/wishpool/repo.js";
import { setReactionSchema } from "@/lib/wishpool/types.js";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = setReactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  setReaction(id, userId, parsed.data.emoji);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const userId = req.headers.get("x-user-id") ?? "anonymous";
  removeReaction(id, userId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/wishes/[id]/reactions/route.ts
git commit -m "feat: add reaction API route"
```

---

### Task 9: UI Primitives — Badge + Textarea

**Files:**
- Create: `components/ui/badge.tsx`
- Create: `components/ui/textarea.tsx`

- [ ] **Step 1: Write Badge component (no radix-ui dependency)**

```typescript
// components/ui/badge.tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-zinc-100 text-zinc-900",
        secondary: "border-transparent bg-zinc-800 text-zinc-200",
        outline: "border-zinc-700 text-zinc-300",
        green: "border-green-500/30 bg-green-500/10 text-green-400",
        blue: "border-blue-500/30 bg-blue-500/10 text-blue-400",
        purple: "border-purple-500/30 bg-purple-500/10 text-purple-400",
        muted: "border-zinc-500/30 bg-zinc-500/10 text-zinc-500",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
```

- [ ] **Step 2: Write Textarea component**

```typescript
// components/ui/textarea.tsx
import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-zinc-700 bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
```

- [ ] **Step 3: Commit**

```bash
git add components/ui/badge.tsx components/ui/textarea.tsx
git commit -m "feat: add Badge and Textarea UI primitives"
```

---

### Task 10: WishCard Component

**Files:**
- Create: `components/wishpool/WishCard.tsx`
- Create: `components/wishpool/__tests__/WishCard.test.tsx`

**Interfaces:**
- Consumes: `WishWithMeta` from types, `formatRelativeTime` from utils, Badge component

- [ ] **Step 1: Write the component**

```typescript
// components/wishpool/WishCard.tsx
import Link from "next/link";
import { Badge } from "@/components/ui/badge.js";
import { formatRelativeTime } from "@/lib/utils.js";
import { statusLabel, statusColor } from "@/lib/wishpool/utils.js";
import type { WishWithMeta } from "@/lib/wishpool/types.js";

export function WishCard({ wish }: { wish: WishWithMeta }) {
  return (
    <Link
      href={`/wishpool/${wish.id}`}
      className="block rounded-xl border border-zinc-800 bg-zinc-950 hover:border-zinc-700 hover:bg-zinc-900/50 transition-colors p-5 space-y-3"
    >
      {/* Top row: title + pinned */}
      <div className="flex items-start gap-2">
        {wish.pinned === 1 && (
          <span className="text-amber-400 text-sm shrink-0 mt-0.5">📌</span>
        )}
        <h3 className="text-sm font-medium text-zinc-200 leading-snug line-clamp-2">
          {wish.title}
        </h3>
      </div>

      {/* Middle: tags + status */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusColor(wish.status)}`}>
          {statusLabel(wish.status)}
        </span>
        {wish.tags.map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
      </div>

      {/* Bottom: meta */}
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span>{wish.author_name}</span>
        <span>{formatRelativeTime(wish.created_at)}</span>
        <span className="flex items-center gap-1">
          👍 {wish.reactions.find((r) => r.emoji === "👍")?.count ?? 0}
        </span>
        <span>💬 {wish.comment_count}</span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Write test**

```typescript
// components/wishpool/__tests__/WishCard.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WishCard } from "../WishCard.js";
import type { WishWithMeta } from "@/lib/wishpool/types.js";

const mockWish: WishWithMeta = {
  id: "test-1",
  title: "暗夜模式",
  body: "需要夜间主题",
  status: "open",
  pinned: 1,
  author_id: "u1",
  author_name: "Alice",
  created_at: Math.floor(Date.now() / 1000) - 3600,
  updated_at: Math.floor(Date.now() / 1000),
  tags: ["体验优化"],
  reactions: [{ emoji: "👍", count: 3, reacted: false }, { emoji: "👎", count: 0, reacted: false }, { emoji: "😄", count: 0, reacted: false }, { emoji: "🎉", count: 0, reacted: false }, { emoji: "😕", count: 0, reacted: false }, { emoji: "❤️", count: 1, reacted: false }],
  comment_count: 5,
};

describe("WishCard", () => {
  it("renders title, status label, author, pin marker", () => {
    render(<WishCard wish={mockWish} />);
    expect(screen.getByText("暗夜模式")).toBeDefined();
    expect(screen.getByText("待处理")).toBeDefined();
    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText("📌")).toBeDefined();
  });

  it("links to the detail page", () => {
    render(<WishCard wish={mockWish} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/wishpool/test-1");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd agent-trade && pnpm vitest run components/wishpool/__tests__/WishCard.test.tsx`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/wishpool/WishCard.tsx components/wishpool/__tests__/WishCard.test.tsx
git commit -m "feat: add WishCard component"
```

---

### Task 11: WishpoolToolbar (Filters)

**Files:**
- Create: `components/wishpool/WishToolbar.tsx`

**Interfaces:**
- Consumes: `WISH_STATUS`, `WISH_STATUS_LABELS`, `PRESET_TAGS`, `WISH_SORT_OPTIONS` from types
- Produces: `WishToolbar` client component that updates URL searchParams

This is a `"use client"` component. Uses native `<select>` (no radix-ui dependency).

- [ ] **Step 1: Write WishToolbar**

```typescript
// components/wishpool/WishToolbar.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { WISH_STATUS, WISH_STATUS_LABELS, PRESET_TAGS, WISH_SORT_OPTIONS } from "@/lib/wishpool/types.js";

const SORT_LABELS: Record<string, string> = {
  latest: "最新",
  popular: "最热",
  updated: "最近更新",
};

export function WishToolbar({ usedTags }: { usedTags: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();

  const currentStatus = sp.get("status") ?? "";
  const currentTag = sp.get("tag") ?? "";
  const currentSort = sp.get("sort") ?? "latest";
  const currentQ = sp.get("q") ?? "";

  function update(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.delete("page"); // reset pagination on filter change
    router.push(`/wishpool?${next.toString()}`);
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-6">
      {/* Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget as HTMLFormElement;
          const input = form.elements.namedItem("q") as HTMLInputElement;
          update("q", input.value);
        }}
        className="flex-1 w-full"
      >
        <Input
          name="q"
          placeholder="搜索心愿..."
          defaultValue={currentQ}
          className="w-full"
        />
      </form>

      {/* Status filter */}
      <select
        value={currentStatus}
        onChange={(e) => update("status", e.target.value)}
        className="h-9 rounded-md border border-zinc-700 bg-transparent px-3 py-1 text-sm text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
      >
        <option value="" className="bg-zinc-900">全部状态</option>
        {WISH_STATUS.map((s) => (
          <option key={s} value={s} className="bg-zinc-900">
            {WISH_STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      {/* Tag filter */}
      <select
        value={currentTag}
        onChange={(e) => update("tag", e.target.value)}
        className="h-9 rounded-md border border-zinc-700 bg-transparent px-3 py-1 text-sm text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
      >
        <option value="" className="bg-zinc-900">全部标签</option>
        {PRESET_TAGS.map((t) => (
          <option key={t} value={t} className="bg-zinc-900">{t}</option>
        ))}
      </select>

      {/* Sort */}
      <select
        value={currentSort}
        onChange={(e) => update("sort", e.target.value)}
        className="h-9 rounded-md border border-zinc-700 bg-transparent px-3 py-1 text-sm text-zinc-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
      >
        {WISH_SORT_OPTIONS.map((s) => (
          <option key={s} value={s} className="bg-zinc-900">
            {SORT_LABELS[s]}
          </option>
        ))}
      </select>

      {/* New wish button */}
      <Button onClick={() => router.push("/wishpool/new")} variant="default">
        + 提需求
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/wishpool/WishToolbar.tsx
git commit -m "feat: add WishToolbar filter component"
```

---

### Task 12: ReactionBar Component

**Files:**
- Create: `components/wishpool/ReactionBar.tsx`

- [ ] **Step 1: Write ReactionBar**

```typescript
// components/wishpool/ReactionBar.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { REACTION_EMOJIS, emojiLabel } from "@/lib/wishpool/utils.js";
import type { ReactionCount, ReactionEmoji } from "@/lib/wishpool/types.js";

export function ReactionBar({
  wishId,
  reactions,
}: {
  wishId: string;
  reactions: ReactionCount[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<ReactionCount[]>(reactions);

  async function toggle(emoji: ReactionEmoji) {
    const current = optimistic.find((r) => r.emoji === emoji);
    const wasReacted = current?.reacted;

    // Optimistic update
    setOptimistic((prev) =>
      prev.map((r) => {
        if (r.emoji === emoji) {
          return {
            ...r,
            count: wasReacted ? r.count - 1 : r.count + 1,
            reacted: !wasReacted,
          };
        }
        // If switching emoji, remove previous reaction
        if (r.reacted && !wasReacted) {
          return { ...r, count: r.count - 1, reacted: false };
        }
        return r;
      }),
    );

    if (wasReacted) {
      await fetch(`/api/wishes/${wishId}/reactions`, { method: "DELETE" });
    } else {
      await fetch(`/api/wishes/${wishId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
    }

    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {optimistic.map((r) => (
        <button
          key={r.emoji}
          onClick={() => toggle(r.emoji)}
          disabled={isPending}
          title={emojiLabel(r.emoji)}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors ${
            r.reacted
              ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
              : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
          }`}
        >
          <span>{r.emoji}</span>
          {r.count > 0 && <span className="tabular-nums">{r.count}</span>}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Fix import** — `emojiLabel` is in `lib/wishpool/utils.ts`, verify import path.

- [ ] **Step 3: Commit**

```bash
git add components/wishpool/ReactionBar.tsx
git commit -m "feat: add ReactionBar component with optimistic updates"
```

---

### Task 13: CommentSection + CommentItem + CommentForm

**Files:**
- Create: `components/wishpool/CommentForm.tsx`
- Create: `components/wishpool/CommentItem.tsx`
- Create: `components/wishpool/CommentSection.tsx`

- [ ] **Step 1: Write CommentForm**

```typescript
// components/wishpool/CommentForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button.js";
import { Textarea } from "@/components/ui/textarea.js";

export function CommentForm({
  wishId,
  parentId = null,
  onCancel,
}: {
  wishId: string;
  parentId?: string | null;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    const res = await fetch(`/api/wishes/${wishId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.trim(), parent_id: parentId }),
    });
    if (res.ok) {
      setBody("");
      router.refresh();
      onCancel?.();
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Textarea
        placeholder={parentId ? "写下你的回复..." : "写下你的评论..."}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={submitting || !body.trim()} size="sm">
          {submitting ? "发表中..." : "发表"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            取消
          </Button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write CommentItem**

```typescript
// components/wishpool/CommentItem.tsx
"use client";

import { useState } from "react";
import { formatRelativeTime } from "@/lib/utils.js";
import { CommentForm } from "./CommentForm.js";
import type { CommentTree } from "@/lib/wishpool/types.js";

export function CommentItem({
  comment,
  wishId,
}: {
  comment: CommentTree;
  wishId: string;
}) {
  const [showReply, setShowReply] = useState(false);

  return (
    <div className="space-y-3">
      {/* Main comment */}
      <div className="border-l-2 border-zinc-800 pl-4">
        <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
          <span className="text-zinc-400 font-medium">{comment.author_name}</span>
          <span>{formatRelativeTime(comment.created_at)}</span>
        </div>
        <div className="text-sm text-zinc-300 whitespace-pre-wrap">{comment.body}</div>
        <button
          onClick={() => setShowReply(!showReply)}
          className="text-xs text-zinc-500 hover:text-zinc-300 mt-2 transition-colors"
        >
          {showReply ? "取消回复" : "回复"}
        </button>
      </div>

      {/* Inline reply form */}
      {showReply && (
        <div className="ml-6">
          <CommentForm
            wishId={wishId}
            parentId={comment.id}
            onCancel={() => setShowReply(false)}
          />
        </div>
      )}

      {/* Nested replies */}
      {comment.replies.length > 0 && (
        <div className="ml-6 space-y-3 border-l border-zinc-800/50 pl-4">
          {comment.replies.map((reply) => (
            <div key={reply.id}>
              <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                <span className="text-zinc-400 font-medium">{reply.author_name}</span>
                <span>{formatRelativeTime(reply.created_at)}</span>
              </div>
              <div className="text-sm text-zinc-300 whitespace-pre-wrap">{reply.body}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write CommentSection**

```typescript
// components/wishpool/CommentSection.tsx
import { CommentForm } from "./CommentForm.js";
import { CommentItem } from "./CommentItem.js";
import type { CommentTree } from "@/lib/wishpool/types.js";

export function CommentSection({
  wishId,
  comments,
}: {
  wishId: string;
  comments: CommentTree[];
}) {
  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold text-zinc-300">
        评论 ({comments.reduce((sum, c) => sum + 1 + c.replies.length, 0)})
      </h3>

      {/* Top-level comment form */}
      <CommentForm wishId={wishId} />

      {/* Comment tree */}
      {comments.length > 0 ? (
        <div className="space-y-6">
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} wishId={wishId} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">暂无评论，来发表第一条吧。</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/wishpool/CommentForm.tsx components/wishpool/CommentItem.tsx components/wishpool/CommentSection.tsx
git commit -m "feat: add comment components with nested replies"
```

---

### Task 14: New Wish Page

**Files:**
- Create: `app/wishpool/new/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
// app/wishpool/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { PRESET_TAGS } from "@/lib/wishpool/types.js";

export default function NewWishPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function toggleTag(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("标题不能为空");
      return;
    }
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/wishes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), body, tags }),
    });
    if (res.ok) {
      const wish = await res.json();
      router.push(`/wishpool/${wish.id}`);
    } else {
      const err = await res.json();
      setError(err.error?.fieldErrors?.title?.[0] ?? "创建失败");
    }
    setSubmitting(false);
  }

  return (
    <main className="relative z-10 min-h-[calc(100vh-3.5rem)] max-w-2xl mx-auto p-4 space-y-6">
      <h1 className="text-xl font-bold text-zinc-200">提新需求</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">标题</label>
          <Input
            placeholder="一句话描述你的需求..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">详细描述（支持 Markdown）</label>
          <Textarea
            placeholder="详细说明你的需求，支持 Markdown 格式..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
          />
        </div>

        <div>
          <label className="block text-sm text-zinc-400 mb-1.5">标签</label>
          <div className="flex flex-wrap gap-2">
            {PRESET_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  tags.includes(tag)
                    ? "border-blue-500/50 bg-blue-500/10 text-blue-300"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={submitting}>
            {submitting ? "提交中..." : "提交需求"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
          >
            取消
          </Button>
        </div>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/wishpool/new/page.tsx
git commit -m "feat: add new wish creation page"
```

---

### Task 15: Wishpool List Page (SSR)

**Files:**
- Rewrite: `app/wishpool/page.tsx` (replace placeholder)

**Interfaces:**
- Consumes: `listWishes()` from repo, `wishFiltersSchema` from types, `WishCard`, `WishToolbar`

- [ ] **Step 1: Rewrite the page**

```typescript
// app/wishpool/page.tsx
import { listWishes, getUsedTags } from "@/lib/wishpool/repo.js";
import { wishFiltersSchema } from "@/lib/wishpool/types.js";
import { WishCard } from "@/components/wishpool/WishCard.js";
import { WishToolbar } from "@/components/wishpool/WishToolbar.js";
import { headers } from "next/headers";
import Link from "next/link";

const PAGE_SIZE = 20;

export default async function WishpoolPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const parsed = wishFiltersSchema.safeParse({
    status: sp.status,
    tag: sp.tag,
    q: sp.q,
    sort: sp.sort,
    page: sp.page,
  });

  const filters = parsed.success ? parsed.data : { sort: "latest" as const, page: 0 };
  const headersList = await headers();
  const userId = headersList.get("x-user-id") ?? "anonymous";
  const { items, total, page } = listWishes(filters, userId);
  const usedTags = getUsedTags();
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="relative z-10 min-h-[calc(100vh-3.5rem)] max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-200">许愿池</h1>
        <span className="text-xs text-zinc-500">{total} 个心愿</span>
      </div>

      <WishToolbar usedTags={usedTags} />

      {items.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <p className="text-zinc-500">没有找到匹配的心愿</p>
          {filters.q || filters.status || filters.tag ? (
            <Link href="/wishpool" className="text-sm text-blue-400 hover:underline">
              清除过滤条件
            </Link>
          ) : (
            <Link
              href="/wishpool/new"
              className="inline-block text-sm text-blue-400 hover:underline"
            >
              去提第一个需求 →
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((wish) => (
            <WishCard key={wish.id} wish={wish} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-6">
          {page > 0 && (
            <Link
              href={`/wishpool?${new URLSearchParams({ ...sp as Record<string,string>, page: String(page - 1) }).toString()}`}
              className="text-sm text-zinc-400 hover:text-zinc-200"
            >
              ← 上一页
            </Link>
          )}
          <span className="text-sm text-zinc-500">
            {page + 1} / {totalPages}
          </span>
          {page < totalPages - 1 && (
            <Link
              href={`/wishpool?${new URLSearchParams({ ...sp as Record<string,string>, page: String(page + 1) }).toString()}`}
              className="text-sm text-zinc-400 hover:text-zinc-200"
            >
              下一页 →
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/wishpool/page.tsx
git commit -m "feat: implement wishpool list page with SSR filtering"
```

---

### Task 16: Wishpool Detail Page (SSR)

**Files:**
- Create: `app/wishpool/[id]/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
// app/wishpool/[id]/page.tsx
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getWish, getComments } from "@/lib/wishpool/repo.js";
import { statusLabel, statusColor } from "@/lib/wishpool/utils.js";
import { Badge } from "@/components/ui/badge.js";
import { ReactionBar } from "@/components/wishpool/ReactionBar.js";
import { CommentSection } from "@/components/wishpool/CommentSection.js";
import { formatRelativeTime } from "@/lib/utils.js";

export default async function WishDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const headersList = await headers();
  const userId = headersList.get("x-user-id") ?? "anonymous";
  const wish = getWish(id, userId);

  if (!wish) notFound();

  const comments = getComments(id);

  return (
    <main className="relative z-10 min-h-[calc(100vh-3.5rem)] max-w-3xl mx-auto p-4 space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {wish.pinned === 1 && <span className="text-amber-400">📌</span>}
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor(wish.status)}`}
          >
            {statusLabel(wish.status)}
          </span>
        </div>
        <h1 className="text-xl font-bold text-zinc-100">{wish.title}</h1>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span>{wish.author_name}</span>
          <span>发布于 {formatRelativeTime(wish.created_at)}</span>
          {wish.updated_at !== wish.created_at && (
            <span>更新于 {formatRelativeTime(wish.updated_at)}</span>
          )}
        </div>
      </div>

      {/* Tags */}
      {wish.tags.length > 0 && (
        <div className="flex items-center gap-2">
          {wish.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Body */}
      {wish.body && (
        <div className="prose prose-invert prose-sm max-w-none border border-zinc-800 rounded-lg p-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{wish.body}</ReactMarkdown>
        </div>
      )}

      {/* Reaction bar */}
      <ReactionBar wishId={wish.id} reactions={wish.reactions} />

      <hr className="border-zinc-800" />

      {/* Comments */}
      <CommentSection wishId={wish.id} comments={comments} />
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/wishpool/[id]/page.tsx
git commit -m "feat: implement wishpool detail page with markdown and comments"
```

---

### Task 17: Auth Adapter + Wire SaaS

**Files:**
- Modify: `lib/auth/types.ts` (add optional wishpool methods)
- New on SaaS side: `agenttrade-saas` auth adapter updates (only if needed)

- [ ] **Step 1: Extend AuthAdapter interface**

In `lib/auth/types.ts`, add optional methods to the `AuthAdapter` interface:

```typescript
export interface AuthAdapter {
  // ... existing methods remain ...

  /** 检查用户能否管理心愿（编辑 / 删除） */
  canManageWish?(userId: string, wishAuthorId: string, userRole: string): boolean;

  /** 检查用户能否置顶心愿 */
  canPinWish?(userRole: string): boolean;
}
```

- [ ] **Step 2: Update NoopAuthAdapter**

```typescript
// In NoopAuthAdapter class, add:
  canManageWish(_userId: string, _wishAuthorId: string, _userRole: string): boolean {
    return true; // Open source: everyone can manage
  }

  canPinWish(_userRole: string): boolean {
    return true; // Open source: everyone can pin
  }
```

- [ ] **Step 3: Commit**

```bash
git add lib/auth/types.ts
git commit -m "feat: extend AuthAdapter with wishpool permission hooks"
```

---

### Task 18: Integration Smoke Test

**Files:**
- Create: `__tests__/integration/wishpool-flow.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// __tests__/integration/wishpool-flow.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Database from "better-sqlite3";
import { setDb, resetDb } from "@/lib/db/client.js";
import {
  createWish,
  getWish,
  listWishes,
  updateWish,
  createComment,
  getComments,
  setReaction,
  removeReaction,
} from "@/lib/wishpool/repo.js";

let db: Database.Database;

beforeAll(() => {
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE wishes (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open', pinned INTEGER NOT NULL DEFAULT 0, author_id TEXT NOT NULL DEFAULT 'anonymous', author_name TEXT NOT NULL DEFAULT '匿名用户', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch()));
    CREATE TABLE wish_tags (id INTEGER PRIMARY KEY AUTOINCREMENT, wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE, tag TEXT NOT NULL, UNIQUE(wish_id, tag));
    CREATE TABLE wish_reactions (wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE, user_id TEXT NOT NULL DEFAULT 'anonymous', emoji TEXT NOT NULL, PRIMARY KEY (wish_id, user_id));
    CREATE TABLE wish_comments (id TEXT PRIMARY KEY, wish_id TEXT NOT NULL REFERENCES wishes(id) ON DELETE CASCADE, parent_id TEXT, author_id TEXT NOT NULL DEFAULT 'anonymous', author_name TEXT NOT NULL DEFAULT '匿名用户', body TEXT NOT NULL, created_at INTEGER NOT NULL);
  `);
  setDb(db);
});

afterAll(() => resetDb());

describe("Wishpool full flow", () => {
  it("create → react → comment → reply → filter → update status", () => {
    // 1. Create wish
    const wish = createWish("alice", "Alice", {
      title: "添加K线回放功能",
      body: "希望能逐根K线回放历史走势。",
      tags: ["功能请求", "数据相关"],
    });
    expect(wish.status).toBe("open");
    expect(wish.tags).toHaveLength(2);

    // 2. Others react
    setReaction(wish.id, "bob", "👍");
    setReaction(wish.id, "carol", "👍");
    setReaction(wish.id, "dave", "❤️");

    const afterReactions = getWish(wish.id, "carol");
    const thumbsUp = afterReactions!.reactions.find((r) => r.emoji === "👍");
    expect(thumbsUp!.count).toBe(2);

    // 3. Comment
    const comment = createComment(wish.id, "bob", "Bob", "这个功能很需要！", null);
    expect(comment.parent_id).toBeNull();

    // 4. Reply
    const reply = createComment(wish.id, "alice", "Alice", "已经在计划中了", comment.id);
    expect(reply.parent_id).toBe(comment.id);

    // 5. Get comment tree
    const tree = getComments(wish.id);
    expect(tree).toHaveLength(1);
    expect(tree[0].replies).toHaveLength(1);

    // 6. Filter by tag
    const tagged = listWishes({ tag: "功能请求", sort: "latest", page: 0 }, "anonymous");
    expect(tagged.items.some((w) => w.id === wish.id)).toBe(true);

    // 7. Search
    const searched = listWishes({ q: "K线回放", sort: "latest", page: 0 }, "anonymous");
    expect(searched.items.some((w) => w.id === wish.id)).toBe(true);

    // 8. Update status (admin)
    const updated = updateWish(wish.id, "admin-1", "admin", { status: "in_progress" });
    expect(updated!.status).toBe("in_progress");

    // 9. Update pinned (admin)
    const pinned = updateWish(wish.id, "admin-1", "admin", { pinned: true });
    expect(pinned!.pinned).toBe(1);

    // 10. Remove reaction
    removeReaction(wish.id, "bob");
    const afterRemove = getWish(wish.id, "bob");
    expect(afterRemove!.reactions.find((r) => r.emoji === "👍")!.count).toBe(1); // was 2, now 1
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `cd agent-trade && pnpm vitest run __tests__/integration/wishpool-flow.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Full test suite**

Run: `cd agent-trade && pnpm test`
Expected: All existing + new tests PASS

- [ ] **Step 4: Final commit**

```bash
git add __tests__/integration/wishpool-flow.test.ts
git commit -m "test: add wishpool integration flow test"
```

---

## Task Dependency Graph

```
T1 (types) ──→ T3 (repo) ──→ T5 (API list/create)
             │                │
             │                ├──→ T6 (API single wish)
             │                ├──→ T7 (API comments/tags)
             │                └──→ T8 (API reactions)
             │
T2 (DB migration) ──→ T3
             │
T4 (utils) ──→ T10 (WishCard) ──→ T15 (list page)
             │
             ├──→ T12 (ReactionBar) ──→ T16 (detail page)
             │
             └──→ T13 (CommentSection) ──→ T16

T9 (Badge/Textarea) ──→ T10, T11, T13, T14

T11 (WishToolbar) ──→ T15

T14 (new page) — independent leaf

T17 (auth) — independent, last

T18 (integration test) — after all tasks complete
```

**Execution order:** T1 → T2 → T3 → T4 → T9 → T5, T6, T7, T8, T10, T11, T13 in parallel → T12, T14 → T15, T16 → T17 → T18
