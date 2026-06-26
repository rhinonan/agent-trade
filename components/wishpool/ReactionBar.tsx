// components/wishpool/ReactionBar.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { emojiLabel } from "@/lib/wishpool/utils.js";
import { REACTION_EMOJIS } from "@/lib/wishpool/types.js";
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
