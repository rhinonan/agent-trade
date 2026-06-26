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
