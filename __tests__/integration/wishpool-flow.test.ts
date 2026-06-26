// @vitest-environment node
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
