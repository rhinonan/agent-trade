// components/wishpool/ReactionBar.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { emojiLabel } from "@/lib/wishpool/utils.js";
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
    const intent: { action: "add" | "remove" } = { action: "add" };

    // Optimistic update – derive wasReacted from prev to avoid stale closure
    setOptimistic((prev) => {
      const current = prev.find((r) => r.emoji === emoji);
      const wasReacted = current?.reacted;
      intent.action = wasReacted ? "remove" : "add";

      return prev.map((r) => {
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
      });
    });

    try {
      if (intent.action === "remove") {
        await fetch(`/api/wishes/${wishId}/reactions`, { method: "DELETE" });
      } else {
        await fetch(`/api/wishes/${wishId}/reactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji }),
        });
      }
      startTransition(() => router.refresh());
    } catch {
      // Reset optimistic state to server truth on failure
      setOptimistic(reactions);
    }
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
