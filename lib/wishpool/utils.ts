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
